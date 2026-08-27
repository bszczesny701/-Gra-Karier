import { getClub } from '../data/clubs'
import type {
  CompetitionId,
  GameState,
  LeagueFixture,
  LiveMatchState,
  LivePitchSlot,
  ManagerMatchResult,
  MatchEvent,
  MatchSpeed,
  ScheduledMatch,
  SquadPlayer,
} from '../state/types'
import { clamp, clampFloat, normalizeTactics } from '../state/types'
import {
  aiClubPower,
  applyResultToStandings,
  chance,
  keyPlayerRatings,
  rngInt,
} from './leagueSim'
import { deliverPostMatchMail, deliverBoardReviewMail } from './mailbox'
import { publishYourMatchNews } from './news'
import { formationFit } from './tactics'
import { applyCupMatchResult } from './cup'
import { applyEuropaMatchResult } from './europa'
import { nextUserMatch } from './calendar'
import { maybeBoardReview } from './board'
import { updateWantsToLeave, normalizeSquadPlayer } from './squadGen'
import { applyFanTrustToChemistry, recomputeTeamChemistry } from './chemistry'
import { pushLog } from '../state/gameState'

const MAX_SUBS = 3

export type MotivationId = 'calm' | 'push' | 'defend'

function shortName(name: string): string {
  return name.split(' ').pop() ?? name
}

function pushEvent(
  live: LiveMatchState,
  kind: MatchEvent['kind'],
  text: string,
  side?: 'you' | 'them',
  extra?: { playerName?: string; playerId?: string },
): void {
  live.events.unshift({
    minute: live.minute,
    kind,
    text,
    side,
    playerName: extra?.playerName,
    playerId: extra?.playerId,
  })
  if (live.events.length > 40) live.events.length = 40
}

function mapPlayers(state: GameState): Map<string, SquadPlayer> {
  return new Map(state.team!.squad.map((p) => [p.id, p]))
}

function pitchIds(live: LiveMatchState): string[] {
  return live.onPitchIds.filter((id): id is string => Boolean(id))
}

function effectiveOvr(p: SquadPlayer, fatigue: number): number {
  const f = clampFloat(fatigue, 0, 100)
  const sharp = ((p.sharpness ?? 70) - 70) * 0.06
  return p.overall * (0.55 + 0.45 * (f / 100)) + (p.form - 50) * 0.08 + sharp
}

export function liveTeamPower(state: GameState, live: LiveMatchState): number {
  const team = state.team!
  const map = mapPlayers(state)
  const ids = pitchIds(live)
  const xs = ids.map((id) => map.get(id)).filter(Boolean) as SquadPlayer[]
  if (!xs.length) return 28
  const avg =
    xs.reduce((s, p) => s + effectiveOvr(p, live.fatigue[p.id] ?? 50), 0) / xs.length
  const fit =
    ids.length === 11
      ? (formationFit({ ...team, startingIds: ids }) - 0.65) * 6
      : ((ids.length / 11) - 0.65) * 6
  const t = normalizeTactics(team.tactics)
  const chem = (team.teamChemistry - 50) * 0.05
  const captBonus =
    team.captainId && pitchIds(live).includes(team.captainId) ? 0.7 : 0
  const styleBias = (t.mentality - 3) * 0.45
  const planBias =
    t.plan === 'press' ? 0.5 : t.plan === 'direct' ? 0.4 : t.plan === 'possession' ? -0.15 : 0.2
  const morale = live.moraleBoost * 1.4
  const menDown = (11 - xs.length) * 3.8
  return avg + fit + chem + captBonus + styleBias + planBias + morale - menDown
}

function drainPerMinute(state: GameState, live: LiveMatchState): number {
  const t = normalizeTactics(state.team!.tactics)
  let d = 0.38 + (t.mentality - 3) * 0.06
  if (t.plan === 'press') d += 0.08
  if (t.plan === 'possession') d -= 0.05
  if (t.plan === 'direct') d += 0.04
  d *= 0.88 + (t.tempo - 1) * 0.11
  d *= 0.9 + (t.press - 1) * 0.1
  d *= 0.94 + (t.defLine - 1) * 0.06
  d *= live.half === '2' ? live.drainMod : 1
  return d
}

function tacticAttackMods(state: GameState): { you: number; them: number; chanceYou: number; chanceThem: number } {
  const t = normalizeTactics(state.team!.tactics)
  const ment = t.mentality - 3
  let you = (t.width - 2) * 0.7 + (t.tempo - 2) * 0.55 + (t.press - 2) * 0.25 + ment * 0.5
  let them = (t.width - 2) * 0.4 + (t.press - 2) * 0.55 - (t.tempo - 2) * 0.15 - ment * 0.35
  let chanceYou = 1 + (t.tempo - 2) * 0.08 + (t.width - 2) * 0.05 + (t.press - 2) * 0.04
  let chanceThem = 1 + (t.press - 2) * 0.09 + (t.width - 2) * 0.04 - (t.tempo - 2) * 0.02

  if (t.plan === 'possession') {
    you -= 0.2
    them -= 0.35
    chanceYou *= 0.92
    chanceThem *= 0.9
  } else if (t.plan === 'press') {
    you += 0.35
    them += 0.45
    chanceYou *= 1.08
    chanceThem *= 1.1
  } else if (t.plan === 'counter') {
    you += 0.45
    them -= 0.15
    chanceYou *= 1.06
  } else if (t.plan === 'direct') {
    you += 0.55
    them += 0.2
    chanceYou *= 1.1
    chanceThem *= 1.04
  }

  you += (t.defLine - 2) * 0.25
  them += (t.defLine - 2) * 0.35
  you += (t.buildUp - 2) * 0.15
  if (t.buildUp === 1) {
    chanceYou *= 0.96
    chanceThem *= 0.94
  } else if (t.buildUp === 3) {
    chanceYou *= 1.05
  }

  return { you, them, chanceYou, chanceThem }
}

function yourGoals(live: LiveMatchState, clubId: string): { yours: number; theirs: number } {
  if (live.homeId === clubId) return { yours: live.homeGoals, theirs: live.awayGoals }
  return { yours: live.awayGoals, theirs: live.homeGoals }
}

function addGoal(live: LiveMatchState, forYou: boolean, clubId: string, scorerName: string): void {
  const isHome = live.homeId === clubId
  if (forYou) {
    if (isHome) live.homeGoals += 1
    else live.awayGoals += 1
    pushEvent(live, 'goal', `${scorerName}`, 'you', { playerName: scorerName })
  } else {
    if (isHome) live.awayGoals += 1
    else live.homeGoals += 1
    const opp = getClub(live.opponentId).short
    pushEvent(live, 'goal', `Gol dla ${opp}`, 'them', { playerName: opp })
  }
}

function pickScorer(state: GameState, live: LiveMatchState): string {
  const map = mapPlayers(state)
  const pool = pitchIds(live)
    .map((id) => map.get(id)!)
    .filter((p) => p && p.role !== 'BR')
    .map((p) => ({
      p,
      w:
        (p.role === 'ŚN' || p.role === 'LN' || p.role === 'PN' ? 3.2 : p.role === 'OP' || p.role === 'PP' || p.role === 'LP' ? 1.6 : 0.7) *
        (live.fatigue[p.id] ?? 50) /
        50,
    }))
  const total = pool.reduce((s, x) => s + x.w, 0) || 1
  let r = Math.random() * total
  for (const x of pool) {
    r -= x.w
    if (r <= 0) return x.p.name
  }
  return pool[0]?.p.name ?? 'Zawodnik'
}

function pickPitchPlayer(state: GameState, live: LiveMatchState): SquadPlayer | null {
  const map = mapPlayers(state)
  const pool = pitchIds(live)
    .map((id) => map.get(id))
    .filter(Boolean) as SquadPlayer[]
  if (!pool.length) return null
  return pool[rngInt(pool.length)]!
}

/** Usuwa zawodnika z boiska (czerwona / kontuzja). */
function removeFromPitch(
  state: GameState,
  live: LiveMatchState,
  playerId: string,
  reason: 'red' | 'injury',
): void {
  const slot = live.onPitchIds.indexOf(playerId)
  if (slot < 0) return
  live.onPitchIds[slot] = null
  if (reason === 'red') live.redLockedSlots[slot] = true
  const p = mapPlayers(state).get(playerId)
  if (reason === 'red' && p) {
    p.suspensionMatchesLeft = Math.max(p.suspensionMatchesLeft ?? 0, 1)
  }
  if (reason === 'injury' && p) {
    p.injuryMatchesLeft = Math.max(p.injuryMatchesLeft ?? 0, 1 + rngInt(3))
  }
  // startingIds zostawiamy — sync po meczu / zmianie
}

function issueYellow(state: GameState, live: LiveMatchState, p: SquadPlayer): void {
  const prev = live.yellows[p.id] ?? 0
  const next = prev + 1
  live.yellows[p.id] = next
  if (next >= 2) {
    pushEvent(live, 'red', `${shortName(p.name)} — druga żółta`, 'you', {
      playerName: p.name,
      playerId: p.id,
    })
    removeFromPitch(state, live, p.id, 'red')
    return
  }
  pushEvent(live, 'yellow', `${shortName(p.name)}`, 'you', {
    playerName: p.name,
    playerId: p.id,
  })
}

function issueRed(state: GameState, live: LiveMatchState, p: SquadPlayer): void {
  live.yellows[p.id] = 2
  pushEvent(live, 'red', `${shortName(p.name)} — czerwona kartka`, 'you', {
    playerName: p.name,
    playerId: p.id,
  })
  removeFromPitch(state, live, p.id, 'red')
}

function issueInjury(state: GameState, live: LiveMatchState, p: SquadPlayer): void {
  pushEvent(live, 'injury', `${shortName(p.name)} — kontuzja`, 'you', {
    playerName: p.name,
    playerId: p.id,
  })
  removeFromPitch(state, live, p.id, 'injury')
  live.paused = true
}

function maybeDisciplineAndInjuries(state: GameState, live: LiveMatchState): void {
  // Rywal — tylko narracja
  if (chance(0.012)) {
    const opp = getClub(live.opponentId).short
    pushEvent(live, 'yellow', `Żółta dla ${opp}`, 'them', { playerName: opp })
  } else if (chance(0.0025)) {
    const opp = getClub(live.opponentId).short
    pushEvent(live, 'red', `Czerwona dla ${opp}`, 'them', { playerName: opp })
  } else if (chance(0.003)) {
    const opp = getClub(live.opponentId).short
    pushEvent(live, 'injury', `Kontuzja u ${opp}`, 'them', { playerName: opp })
  }

  const p = pickPitchPlayer(state, live)
  if (!p) return

  const fat = live.fatigue[p.id] ?? 50
  // Im niższa świeżość (fatigue), tym większa szansa kontuzji
  const tiredFactor = Math.pow((100 - fat) / 100, 1.45)
  const injuryChance = clampFloat(
    (0.0018 + tiredFactor * 0.032 + (fat < 30 ? 0.01 : 0)) *
      (state.settings?.difficulty === 'hard' ? 1.35 : state.settings?.difficulty === 'easy' ? 0.7 : 1),
    0.001,
    0.055,
  )
  if (chance(injuryChance)) {
    issueInjury(state, live, p)
    return
  }

  if (chance(0.011)) {
    issueYellow(state, live, p)
    return
  }
  if (chance(0.0018)) {
    issueRed(state, live, p)
  }
}

/** Start live po ustawieniu składu; AI już powinno być odpalone w tygodniu. */
export function createLiveMatch(
  state: GameState,
  fixture: LeagueFixture | ScheduledMatch,
  matchId: string | null = null,
  competition: CompetitionId = 'league',
): LiveMatchState {
  const team = state.team!
  const season = state.season!
  const opponentId = fixture.homeId === season.clubId ? fixture.awayId : fixture.homeId
  const fatigue: Record<string, number> = {}
  for (const id of team.startingIds) {
    const p = team.squad.find((x) => x.id === id)
    const fit = p?.fitness ?? 75
    fatigue[id] = clampFloat(100 - (100 - fit) * 0.3, 55, 100)
  }
  for (const id of team.benchIds) {
    const p = team.squad.find((x) => x.id === id)
    const fit = p?.fitness ?? 80
    fatigue[id] = clampFloat(92 - (100 - fit) * 0.15, 70, 100)
  }

  const live: LiveMatchState = {
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    opponentId,
    minute: 0,
    half: '1',
    homeGoals: 0,
    awayGoals: 0,
    onPitchIds: [...team.startingIds] as LivePitchSlot[],
    benchIds: [...team.benchIds],
    subsUsed: 0,
    fatigue,
    yellows: {},
    redLockedSlots: Array(11).fill(false),
    moraleBoost: 0,
    drainMod: 1,
    motivationDone: false,
    events: [],
    paused: false,
    speed: 2,
    playedIds: [...team.startingIds],
    stoppageUntil: null,
    matchId,
    competition,
  }
  const tag =
    competition === 'cup' ? 'Puchar Polski' : competition === 'europa' ? 'Europa' : 'Liga'
  pushEvent(live, 'kickoff', `${tag}: początek meczu vs ${getClub(opponentId).name}.`)
  return live
}

export function setMatchSpeed(state: GameState, speed: MatchSpeed): void {
  if (!state.liveMatch) return
  state.liveMatch.speed = speed
}

export function setMatchPaused(state: GameState, paused: boolean): void {
  if (!state.liveMatch) return
  if (state.liveMatch.half === 'ht' || state.liveMatch.half === 'done') return
  state.liveMatch.paused = paused
}

/** Zmiana: outId z boiska (null = pusty slot), inId z ławki. slotIndex wymagany gdy outId null. */
export function liveSubstitute(
  state: GameState,
  outId: string | null,
  inId: string,
  slotIndex?: number,
): string | null {
  const live = state.liveMatch
  if (!live) return 'Brak meczu'
  if (live.half !== 'ht' && !live.paused) return 'Zmiany tylko w pauzie lub przerwie'
  if (live.subsUsed >= MAX_SUBS) return 'Limit 3 zmian wyczerpany'
  if (!live.benchIds.includes(inId)) return 'Zawodnik nie jest na ławce'

  const map = mapPlayers(state)
  const inP = map.get(inId)
  if (!inP) return 'Nieznany zawodnik'
  if ((inP.injuryMatchesLeft ?? 0) > 0) return 'Zawodnik kontuzjowany'
  if ((inP.suspensionMatchesLeft ?? 0) > 0) return 'Zawodnik zawieszony'

  let slot =
    slotIndex != null && slotIndex >= 0 && slotIndex <= 10
      ? slotIndex
      : outId
        ? live.onPitchIds.indexOf(outId)
        : live.onPitchIds.findIndex((id, i) => id == null && !live.redLockedSlots[i])
  if (slot < 0) return 'Zawodnik nie jest na boisku'
  if (live.redLockedSlots[slot]) return 'Po czerwonej nie wolno uzupełnić tego slotu'
  if (outId && live.onPitchIds[slot] !== outId) return 'Zawodnik nie jest na boisku'
  if (!outId && live.onPitchIds[slot] != null) return 'Slot zajęty'

  const prev = live.onPitchIds[slot]
  const outP = prev ? map.get(prev) : null
  live.onPitchIds[slot] = inId
  live.benchIds = live.benchIds.filter((id) => id !== inId)
  if (prev && outP && (outP.injuryMatchesLeft ?? 0) === 0 && (live.yellows[prev] ?? 0) < 2) {
    if (!live.benchIds.includes(prev)) live.benchIds.unshift(prev)
  }
  live.subsUsed += 1
  live.fatigue[inId] = clampFloat(88 + Math.random() * 8, 80, 98)
  if (!live.playedIds.includes(inId)) live.playedIds.push(inId)
  pushEvent(
    live,
    'sub',
    prev
      ? `${shortName(outP?.name ?? 'OUT')} ↓ → ${shortName(inP.name)} ↑`
      : `${shortName(inP.name)} wchodzi na boisko`,
    'you',
    { playerName: inP.name, playerId: inId },
  )
  state.team!.benchIds = [...live.benchIds]
  return null
}

/** Zamiana pozycji na boisku (bez zużycia limitu zmian). */
export function liveSwapOnPitch(state: GameState, slotA: number, slotB: number): void {
  const live = state.liveMatch
  if (!live) return
  if (live.half !== 'ht' && !live.paused) return
  if (slotA < 0 || slotB < 0 || slotA > 10 || slotB > 10 || slotA === slotB) return
  if (live.redLockedSlots[slotA] || live.redLockedSlots[slotB]) return
  const tmp = live.onPitchIds[slotA] ?? null
  live.onPitchIds[slotA] = live.onPitchIds[slotB] ?? null
  live.onPitchIds[slotB] = tmp
  state.team!.startingIds = live.onPitchIds.map((id, i) => id ?? state.team!.startingIds[i] ?? '')
}

export function applyHalftimeMotivation(state: GameState, choice: MotivationId): void {
  const live = state.liveMatch
  if (!live || live.half !== 'ht' || live.motivationDone) return
  live.motivationDone = true
  if (choice === 'calm') {
    live.moraleBoost = 0
    live.drainMod = 0.92
    pushEvent(live, 'motivation', 'Przerwa: spokojnie, trzymamy plan.')
  } else if (choice === 'push') {
    live.moraleBoost = 1
    live.drainMod = 1.18
    pushEvent(live, 'motivation', 'Przerwa: podnosimy tempo!')
  } else {
    live.moraleBoost = -1
    live.drainMod = 0.8
    pushEvent(live, 'motivation', 'Przerwa: zamykamy mecz, bronimy wyniku.')
  }
}

export function startSecondHalf(state: GameState): void {
  const live = state.liveMatch
  if (!live || live.half !== 'ht') return
  if (!live.motivationDone) applyHalftimeMotivation(state, 'calm')
  live.half = '2'
  live.minute = 45
  live.paused = false
  live.stoppageUntil = null
  pushEvent(live, 'kickoff', 'Początek drugiej połowy.')
  state.screen = 'liveMatch'
}

function maybeEnterStoppage(live: LiveMatchState, halfEnd: number): boolean {
  if (live.stoppageUntil != null) return false
  const extra = 1 + rngInt(3)
  live.stoppageUntil = halfEnd + extra
  pushEvent(live, 'chance', `Doliczony czas: +${extra} min.`)
  return true
}

/** Jedna minuta meczu. Zwraca true jeśli mecz się skończył. */
export function tickLiveMinute(state: GameState): boolean {
  const live = state.liveMatch
  const season = state.season
  if (!live || !season || live.paused) return false
  if (live.half === 'ht' || live.half === 'done') return false

  const clubId = season.clubId
  const halfEnd = live.half === '1' ? 45 : 90

  live.minute += 1

  // Zmęczenie na boisku + odpoczynek na ławce
  const drain = drainPerMinute(state, live)
  const map = mapPlayers(state)
  for (const id of pitchIds(live)) {
    const p = map.get(id)
    const extra = p && p.attrs.stamina < 55 ? 0.12 : 0
    live.fatigue[id] = clampFloat((live.fatigue[id] ?? 50) - drain - extra, 8, 100)
    if (live.fatigue[id]! < 25 && chance(0.08)) {
      pushEvent(live, 'fatigue', `${shortName(p?.name ?? 'Zawodnik')} ledwo stoi na nogach.`, 'you', {
        playerName: p?.name,
        playerId: id,
      })
    }
  }
  for (const id of live.benchIds) {
    live.fatigue[id] = clampFloat((live.fatigue[id] ?? 80) + 0.22, 45, 100)
  }

  const mods = tacticAttackMods(state)
  const yourPow = liveTeamPower(state, live)
  const isHome = live.homeId === clubId
  const oppPow = aiClubPower(live.opponentId) + (isHome ? 0 : 1.0)
  const youAtt = yourPow + (isHome ? 1.5 : 0) + live.moraleBoost * 0.5 + mods.you
  const themAtt = oppPow + (isHome ? 0 : 1.2) - live.moraleBoost * 0.3 + mods.them

  // Osłabienie po czerwonej / kontuzji bez zmiany: więcej szans rywala
  const menOnPitch = pitchIds(live).length
  const menDown = Math.max(0, 11 - menOnPitch)
  const understrengthThem = 1 + menDown * 0.42
  const understrengthYou = Math.max(0.55, 1 - menDown * 0.14)

  const youChance = clampFloat(
    (0.006 + (youAtt - themAtt) / 900) * mods.chanceYou * understrengthYou,
    0.002,
    0.032,
  )
  const themChance = clampFloat(
    (0.006 + (themAtt - youAtt) / 900) * mods.chanceThem * understrengthThem,
    0.003,
    menDown > 0 ? 0.055 : 0.032,
  )

  let scored = false
  if (chance(youChance)) {
    addGoal(live, true, clubId, pickScorer(state, live))
    scored = true
  }
  if (!scored && chance(themChance)) {
    addGoal(live, false, clubId, '')
  } else if (!scored && chance(0.04)) {
    pushEvent(live, 'chance', chance(0.5) ? 'Groźna okazja — obrona na miejscu.' : 'Strzał obok słupka.')
  }

  if (!live.paused) maybeDisciplineAndInjuries(state, live)

  // Koniec regulaminowego czasu → doliczony
  if (live.stoppageUntil == null && live.minute === halfEnd) {
    maybeEnterStoppage(live, halfEnd)
    return false
  }

  const target = live.stoppageUntil ?? halfEnd
  if (live.minute >= target) {
    if (live.half === '1') {
      live.half = 'ht'
      live.paused = true
      live.stoppageUntil = null
      pushEvent(live, 'ht', 'Koniec pierwszej połowy.')
      state.screen = 'halfTime'
      return false
    }
    finishLiveMatch(state)
    return true
  }

  return false
}

export function finishLiveMatch(state: GameState): void {
  const live = state.liveMatch!
  const season = state.season!
  const team = state.team!
  const clubId = season.clubId
  const isKnockout = live.competition === 'cup' || live.competition === 'europa'

  live.half = 'done'
  live.paused = true
  pushEvent(live, 'ft', `Koniec meczu ${live.homeGoals}:${live.awayGoals}.`)

  let pens = false
  if (isKnockout && live.homeGoals === live.awayGoals) {
    pens = true
    const youHome = live.homeId === clubId
    const youWinPens = chance(0.48 + (live.moraleBoost > 0 ? 0.06 : 0))
    if (youWinPens) {
      if (youHome) live.homeGoals += 1
      else live.awayGoals += 1
    } else {
      if (youHome) live.awayGoals += 1
      else live.homeGoals += 1
    }
    pushEvent(live, 'ft', 'Rozstrzygnięcie po rzutach karnych.')
  }

  if (live.competition === 'cup' && live.matchId) {
    applyCupMatchResult(season, live.matchId, live.homeGoals, live.awayGoals)
  } else if (live.competition === 'europa' && live.matchId) {
    applyEuropaMatchResult(season, live.matchId, live.homeGoals, live.awayGoals)
  } else {
    applyResultToStandings(season.standings, live.homeId, live.awayId, live.homeGoals, live.awayGoals)
    if (live.matchId && season.matches[live.matchId]) {
      season.matches[live.matchId].homeGoals = live.homeGoals
      season.matches[live.matchId].awayGoals = live.awayGoals
    }
    season.record.played += 1
    const { yours, theirs } = yourGoals(live, clubId)
    season.record.goalsFor += yours
    season.record.goalsAgainst += theirs
    if (yours > theirs) season.record.won += 1
    else if (yours === theirs) season.record.drawn += 1
    else season.record.lost += 1
  }

  const { yours, theirs } = yourGoals(live, clubId)
  const won = yours > theirs
  const drawn = !isKnockout && yours === theirs

  for (const p of team.squad) {
    normalizeSquadPlayer(p)
    if (live.playedIds.includes(p.id)) {
      p.seasonApps = (p.seasonApps ?? 0) + 1
      const started = team.startingIds.includes(p.id) || live.onPitchIds.includes(p.id)
      const minutes = started && !live.benchIds.includes(p.id) ? 70 + rngInt(21) : 25 + rngInt(40)
      p.seasonMinutes = (p.seasonMinutes ?? 0) + minutes
      p.sharpness = clamp((p.sharpness ?? 70) + 3 + rngInt(4), 0, 100)
      const fat = live.fatigue[p.id] ?? 50
      const loss = clamp(Math.round((100 - fat) * 0.35 + 4), 4, 22)
      p.fitness = clamp(p.fitness - loss, 20, 100)
      p.form = clamp(p.form + (won ? 2 + rngInt(2) : drawn ? 0 : -(1 + rngInt(2))), 25, 90)
      p.morale = clamp(p.morale + (won ? 2 : drawn ? 0 : -2), 20, 100)
    } else if (live.benchIds.includes(p.id)) {
      // ~2 mecze na ławce = pełna kondycja (nawet z ~20%)
      p.fitness = clamp(p.fitness + 50 + rngInt(6), 20, 100)
      p.sharpness = clamp((p.sharpness ?? 70) - 1, 0, 100)
      p.morale = clamp(p.morale + (won ? 1 : 0), 20, 100)
    } else {
      p.fitness = clamp(p.fitness + 52 + rngInt(6), 20, 100)
      p.sharpness = clamp((p.sharpness ?? 70) - 2, 0, 100)
      if (!isKnockout) p.morale = clamp(p.morale - 1, 20, 100)
    }
  }

  const yourGoalEvents = live.events.filter((e) => e.kind === 'goal' && e.side === 'you' && e.playerId)
  for (const e of yourGoalEvents) {
    const scorer = team.squad.find((p) => p.id === e.playerId)
    if (scorer) {
      normalizeSquadPlayer(scorer)
      scorer.seasonGoals = (scorer.seasonGoals ?? 0) + 1
    }
  }
  // Asysty: ~20% goli przypisane losowemu innemu z XI
  const assistPool = pitchIds(live)
  for (const e of yourGoalEvents) {
    if (Math.random() > 0.22 || assistPool.length < 2) continue
    const others = assistPool.filter((id) => id !== e.playerId)
    const aid = others[rngInt(others.length)]
    const asst = team.squad.find((p) => p.id === aid)
    if (asst) {
      normalizeSquadPlayer(asst)
      asst.seasonAssists = (asst.seasonAssists ?? 0) + 1
    }
  }

  const redThisMatch = new Set(
    live.events.filter((e) => e.kind === 'red' && e.side === 'you' && e.playerId).map((e) => e.playerId!),
  )
  const injThisMatch = new Set(
    live.events.filter((e) => e.kind === 'injury' && e.side === 'you' && e.playerId).map((e) => e.playerId!),
  )
  for (const p of team.squad) {
    if ((p.suspensionMatchesLeft ?? 0) > 0 && !redThisMatch.has(p.id)) {
      p.suspensionMatchesLeft = Math.max(0, p.suspensionMatchesLeft - 1)
    }
    if ((p.injuryMatchesLeft ?? 0) > 0 && !injThisMatch.has(p.id)) {
      p.injuryMatchesLeft = Math.max(0, p.injuryMatchesLeft - 1)
    }
  }

  const available = team.squad.filter(
    (p) => (p.injuryMatchesLeft ?? 0) === 0 && (p.suspensionMatchesLeft ?? 0) === 0,
  )
  const keep = pitchIds(live).filter((id) => available.some((p) => p.id === id))
  const fill = available
    .filter((p) => !keep.includes(p.id))
    .sort((a, b) => b.overall - a.overall)
  while (keep.length < 11 && fill.length) keep.push(fill.shift()!.id)
  team.startingIds = keep.slice(0, 11)
  team.benchIds = available
    .filter((p) => !team.startingIds.includes(p.id))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 7)
    .map((p) => p.id)

  const impulse = won ? 2 : drawn ? 0 : -2
  team.teamChemistry = clamp(team.teamChemistry + impulse + (rngInt(3) - 1), 20, 100)
  recomputeTeamChemistry(team, impulse)
  if (state.manager?.fanTrust != null) applyFanTrustToChemistry(team, state.manager.fanTrust)
  season.teamChemistry = team.teamChemistry

  const ratings = keyPlayerRatings(state)

  const home = getClub(live.homeId)
  const away = getClub(live.awayId)
  const yourReds = live.events.filter((e) => e.kind === 'red' && e.side === 'you').length
  const yourInj = live.events.filter((e) => e.kind === 'injury' && e.side === 'you').length
  let narrative =
    live.competition === 'cup'
      ? 'Puchar Polski · '
      : live.competition === 'europa'
        ? 'Europa · '
        : ''
  narrative += `${home.short} ${live.homeGoals}:${live.awayGoals} ${away.short}. `
  if (pens) narrative += 'Po karnych. '
  if (won) narrative += 'Wygrana! '
  else if (drawn) narrative += 'Remis. '
  else narrative += 'Porażka. '
  narrative += `Zmiany: ${live.subsUsed}/3.`
  if (yourReds) narrative += ` Czerwone: ${yourReds}.`
  if (yourInj) narrative += ` Kontuzje: ${yourInj}.`

  const result: ManagerMatchResult = {
    homeId: live.homeId,
    awayId: live.awayId,
    homeGoals: live.homeGoals,
    awayGoals: live.awayGoals,
    opponentId: live.opponentId,
    yourGoals: yours,
    theirGoals: theirs,
    won,
    drawn,
    narrative,
    keyRatings: ratings,
    chemistryAfter: team.teamChemistry,
    competition: live.competition,
    yourReds,
  }
  season.lastMatch = result

  if (state.manager) {
    state.manager.matchesSincePress = (state.manager.matchesSincePress ?? 0) + 1
  }

  // Sync kolejki ligowej bez ślepego ++
  if (!isKnockout) {
    let completed = 0
    for (let li = 0; li < season.rounds.length; li++) {
      const ids = Object.values(season.matches).filter(
        (m) => m.competition === 'league' && m.leagueRound === li,
      )
      if (!ids.length) break
      if (ids.every((m) => m.homeGoals != null)) completed = li + 1
      else break
    }
    season.roundIndex = completed
  }

  if (season.calendar?.weeks?.length) {
    if (!nextUserMatch(season)) {
      const allLeagueDone = Object.values(season.matches)
        .filter((m) => m.competition === 'league')
        .every((m) => m.homeGoals != null)
      if (allLeagueDone && season.calendar.weekIndex >= season.calendar.weeks.length - 1) {
        season.phase = 'done'
      }
    }
  } else {
    season.roundIndex += 1
    if (season.roundIndex >= season.rounds.length) season.phase = 'done'
  }

  deliverPostMatchMail(state)
  publishYourMatchNews(state, live.homeId, live.awayId, live.homeGoals, live.awayGoals)

  if (!isKnockout) {
    const review = maybeBoardReview(state)
    if (review) {
      deliverBoardReviewMail(state, review)
      pushLog(
        state,
        `Przegląd zarządu: ${review.summary} Zaufanie ${Math.round(review.before)}% → ${Math.round(review.after)}%.`,
      )
    }
  }

  updateWantsToLeave(team, season.roundIndex)

  state.liveMatch = null
  state.screen = 'matchResult'
}

export function intervalMsForSpeed(speed: MatchSpeed): number {
  if (speed === 1) return 420
  if (speed === 4) return 110
  return 210
}

export function playerUnavailableReason(p: SquadPlayer): string | null {
  if ((p.injuryMatchesLeft ?? 0) > 0) {
    return `Kontuzja · ${p.injuryMatchesLeft} mecz${p.injuryMatchesLeft === 1 ? '' : 'e'}`
  }
  if ((p.suspensionMatchesLeft ?? 0) > 0) {
    return `Zawieszenie · ${p.suspensionMatchesLeft} mecz${p.suspensionMatchesLeft === 1 ? '' : 'e'}`
  }
  return null
}
