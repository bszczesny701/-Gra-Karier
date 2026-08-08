import { CLUBS, getClub, getEffectiveStrength, getLeague, getLeagueForClub } from '../data/clubs'
import type {
  Attributes,
  ClubStanding,
  CupStage,
  FormLabel,
  PendingKeyMatch,
  Player,
  PositionalRival,
  ScorerEntry,
  SeasonHalfProgress,
  SeasonReport,
  SeasonState,
  WinterBreakSnapshot,
} from '../state/types'
import {
  clamp,
  clampSeasonOvrDelta,
  cupStageLabel,
  formLabelFromAvg,
  performanceFormScore,
} from '../state/types'
import { calcOverall } from './playerFactory'
import { playerTablePosition, sortedStandings } from './standings'

function syncPlayerOverall(player: Player): number {
  player.overall = calcOverall(player.attrs, player.position)
  return player.overall
}

/** Podnosi atrybuty tak, by overall faktycznie zmienił się o targetDelta (±). */
function applyOverallChange(player: Player, targetDelta: number): number {
  const before = player.overall
  if (targetDelta === 0) return 0

  const delta = targetDelta

  const focusOrder: Array<keyof Attributes> =
    player.position === 'NP'
      ? ['shooting', 'pace', 'stamina', 'passing', 'defending']
      : player.position === 'POM'
        ? ['passing', 'shooting', 'stamina', 'pace', 'defending']
        : player.position === 'OB'
          ? ['defending', 'stamina', 'pace', 'passing', 'shooting']
          : ['passing', 'defending', 'stamina', 'pace', 'shooting']

  let guard = 0
  if (delta > 0) {
    let i = 0
    while (player.overall < before + delta && guard < 40) {
      const key = focusOrder[i % focusOrder.length]!
      player.attrs[key] = clamp(player.attrs[key] + 1)
      syncPlayerOverall(player)
      i++
      guard++
    }
  } else {
    let i = 0
    while (player.overall > before + delta && guard < 40) {
      const key = focusOrder[i % focusOrder.length]!
      player.attrs[key] = clamp(player.attrs[key] - 1)
      syncPlayerOverall(player)
      i++
      guard++
    }
  }

  return player.overall - before
}

const NPC_FIRST = [
  'Adam', 'Kamil', 'Piotr', 'Michał', 'Jakub', 'Bartosz', 'Tomasz', 'Mateusz', 'Damian', 'Filip',
  'Patryk', 'Sebastian', 'Krzysztof', 'Marcin', 'Łukasz',
]
const NPC_LAST = [
  'Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański',
  'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Piotrowski', 'Grabowski', 'Pawlak',
]

export function rngInt(n: number): number {
  return Math.floor(Math.random() * n)
}

export function chance(p: number): boolean {
  return Math.random() < p
}

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function npcName(seed: string): string {
  const h = hashSeed(seed)
  const first = NPC_FIRST[h % NPC_FIRST.length] ?? 'Jan'
  const last = NPC_LAST[Math.floor(h / 17) % NPC_LAST.length] ?? 'Kowalski'
  return `${first} ${last}`
}

export function makeRival(
  clubId: string,
  year: number,
  strengthMods: Record<string, number> = {},
): PositionalRival {
  const strength = getEffectiveStrength(clubId, strengthMods)
  const h = hashSeed(`${clubId}-${year}-rival`)
  const overall = clamp(strength + ((h % 9) - 4), 40, 88)
  const form = 45 + (h % 21)
  return {
    name: npcName(`${clubId}-${year}-rival`),
    overall,
    form,
  }
}

export function describeRival(player: Player, rival: PositionalRival): string {
  const playerEdge = player.overall + (player.morale - 50) / 10
  const rivalEdge = rival.overall + (rival.form - 50) / 5
  const diff = playerEdge - rivalEdge
  if (diff > 3) {
    return `Rywal ${rival.name} (OVR ${rival.overall}) — wygrywasz walkę o skład.`
  }
  if (diff < -3) {
    return `Rywal ${rival.name} (OVR ${rival.overall}) — mocniejszy od Ciebie o miejsce w „11”.`
  }
  return `Rywal ${rival.name} (OVR ${rival.overall}) — równa walka o skład.`
}

/** 3 napastników/pomocników na klub — gole nie lecą na jedną osobę. */
export function ensureClubScorers(
  map: Map<string, ScorerEntry>,
  clubId: string,
  year: number,
): string[] {
  const keys: string[] = []
  for (let i = 0; i < 3; i++) {
    const key = `npc-${clubId}-${i}`
    keys.push(key)
    if (!map.has(key)) {
      map.set(key, {
        name: npcName(`${clubId}-${year}-s${i}`),
        clubId,
        goals: 0,
        isPlayer: false,
      })
    }
  }
  return keys
}

/** Rozdziel gole meczu między trzech strzelców; ~12% „inni” (nie na listę). */
export function distributeClubGoals(
  map: Map<string, ScorerEntry>,
  clubId: string,
  year: number,
  goals: number,
): void {
  if (goals <= 0) return
  const keys = ensureClubScorers(map, clubId, year)
  const weights = [0.38, 0.28, 0.22, 0.12]
  for (let g = 0; g < goals; g++) {
    const roll = Math.random()
    let acc = 0
    let pickIdx = weights.length - 1
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i]!
      if (roll < acc) {
        pickIdx = i
        break
      }
    }
    if (pickIdx >= keys.length) continue
    const row = map.get(keys[pickIdx]!)!
    row.goals += 1
  }
}

export function updateStanding(row: ClubStanding, gf: number, ga: number): void {
  row.played++
  row.goalsFor += gf
  row.goalsAgainst += ga
  if (gf > ga) {
    row.won++
    row.points += 3
  } else if (gf === ga) {
    row.drawn++
    row.points += 1
  } else {
    row.lost++
  }
}

export function scoreline(att: number, def: number): number {
  const expected = Math.max(0.08, (att - def) / 36 + 0.82)
  let g = 0
  for (let i = 0; i < 4; i++) if (chance(expected / 4)) g++
  if (chance(0.04)) g++
  return Math.min(g, 4)
}

/**
 * Szansa na występ — OVR vs siła klubu + wyraźna kara wyższej ligi.
 * Ten sam OVR w Ekstraklasie ≪ I liga.
 */
export function appearanceChance(
  player: Player,
  clubId?: string,
  strengthMods: Record<string, number> = {},
  rival?: PositionalRival | null,
  rivalPressure = 0,
): number {
  if (!clubId) {
    return Math.max(0.2, Math.min(0.55, 0.3 + player.overall / 200))
  }

  const league = getLeagueForClub(clubId)
  const strength = getEffectiveStrength(clubId, strengthMods)
  const gap = player.overall - strength

  // Baza ligowa: wyższa liga = trudniej o „11” przy tym samym gap
  const tierBase =
    league.tier === 4
      ? 0.44 // III
      : league.tier === 3
        ? 0.4 // II
        : league.tier === 2
          ? 0.36 // I liga
          : league.tier === 1
            ? 0.24 // Ekstraklasa
            : 0.16 // Top Europa

  const gapSlope = gap < 0 ? 0.024 : 0.013
  let playChance = tierBase + gap * gapSlope

  playChance += (player.reputation - 20) / 700
  playChance += (player.morale - 55) / 800
  if (player.age >= 34) playChance -= 0.08
  else if (player.age >= 30) playChance -= 0.04
  else if (player.age <= 18) playChance += 0.02

  if (rival) {
    const rivalEdge = rival.overall + (rival.form - 50) / 5
    const playerEdge = player.overall + (player.morale - 50) / 10
    if (rivalEdge > playerEdge) {
      const edgeGap = rivalEdge - playerEdge
      playChance -= Math.min(0.2, Math.max(0.05, 0.05 + edgeGap * 0.014))
    }
  }
  playChance -= rivalPressure * 0.03

  // Sufity — Ekstraklasa wyraźnie niżej niż I liga
  const tierCap =
    league.tier === 4
      ? 0.88
      : league.tier === 3
        ? 0.8
        : league.tier === 2
          ? 0.74 // I liga
          : league.tier === 1
            ? 0.56 // Ekstraklasa
            : 0.45 // Europa

  // W Ekstraklasie / Europie: bycie poniżej siły składu boli mocniej
  if (league.tier === 1 && gap < 0) playChance *= 0.82
  if (league.tier === 1 && gap < -4) playChance = Math.min(playChance, 0.28)
  if (league.tier <= 0 && gap < 2) playChance = Math.min(playChance, 0.32)
  if (league.tier <= 0 && gap < -4) playChance = Math.min(playChance, 0.14)

  if (league.tier >= 1 && league.tier <= 3 && gap < 2) {
    playChance = Math.min(playChance, tierCap - 0.08)
  }
  if (league.tier === 3 && player.overall < 52) {
    playChance = Math.min(playChance, 0.48)
  }
  if (league.tier === 2 && player.overall < 58) {
    playChance = Math.min(playChance, 0.4)
  }
  if (league.tier === 1 && player.overall < 64) {
    playChance = Math.min(playChance, 0.3)
  }
  if (league.tier <= 1 && gap < -8) {
    playChance = Math.min(playChance, 0.18)
  }
  if (gap <= -18) playChance = Math.min(playChance, 0.04)
  else if (gap <= -12) playChance = Math.min(playChance, 0.12)

  if (gap >= 12) playChance += 0.06
  else if (gap >= 8) playChance += 0.03

  playChance = Math.min(playChance, tierCap)
  return Math.max(0.03, Math.min(0.88, playChance))
}

/** Szansa w trakcie sezonu — chwilowy humor meczowy + rywal. */
export function matchAppearanceChance(
  player: Player,
  matchMood: number,
  clubId: string,
  strengthMods: Record<string, number>,
  rival?: PositionalRival | null,
  rivalPressure = 0,
): number {
  const base = appearanceChance(player, clubId, strengthMods, rival, rivalPressure)
  const moodBit = (matchMood - 50) / 320
  return Math.max(0.03, Math.min(0.8, base + moodBit))
}

/**
 * Pełny terminarz ligowy — każdy klub gra z każdym.
 * Małe ligi (≤10): dwurundowo. Większe (Ekstraklasa): jedna runda.
 */
export function buildSeasonFixtures(
  clubIds: string[],
): Array<{ homeId: string; awayId: string }> {
  const ids = [...clubIds]
  const doubleRound = ids.length <= 10
  const teams: Array<string | null> =
    ids.length % 2 === 0 ? [...ids] : [...ids, null]
  const n = teams.length
  const rounds = n - 1
  const half = n / 2
  const firstHalf: Array<{ homeId: string; awayId: string }> = []

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = teams[i]
      const b = teams[n - 1 - i]
      if (!a || !b) continue
      if ((round + i) % 2 === 0) firstHalf.push({ homeId: a, awayId: b })
      else firstHalf.push({ homeId: b, awayId: a })
    }
    const fixed = teams[0]
    const movable = teams.slice(1)
    const last = movable.pop()
    if (last !== undefined) movable.unshift(last)
    teams.splice(0, teams.length, fixed!, ...movable)
  }

  if (!doubleRound) return firstHalf
  const secondHalf = firstHalf.map((f) => ({ homeId: f.awayId, awayId: f.homeId }))
  return [...firstHalf, ...secondHalf]
}

export function bumpScorer(map: Map<string, ScorerEntry>, key: string, entry: ScorerEntry, goals: number): void {
  const cur = map.get(key)
  if (cur) cur.goals += goals
  else map.set(key, { ...entry, goals })
}

export function scorerMapFromEntries(entries: ScorerEntry[]): Map<string, ScorerEntry> {
  const map = new Map<string, ScorerEntry>()
  const npcIdx: Record<string, number> = {}
  for (const e of entries) {
    if (e.isPlayer) {
      const cur = map.get('player')
      if (cur) cur.goals += e.goals
      else map.set('player', { ...e })
      continue
    }
    const idx = npcIdx[e.clubId] ?? 0
    npcIdx[e.clubId] = idx + 1
    const key = `npc-${e.clubId}-${idx}`
    const cur = map.get(key)
    if (cur) cur.goals += e.goals
    else map.set(key, { ...e })
  }
  return map
}

function simulatePolishCup(
  playerClubId: string,
  player: Player,
  strengthMods: Record<string, number>,
  rival?: PositionalRival | null,
  rivalPressure = 0,
): { stage: CupStage; playerGoals: number; playerApps: number } {
  const rounds: Array<{ id: CupStage; difficulty: number }> = [
    { id: 'r32', difficulty: 0.92 },
    { id: 'r16', difficulty: 1.0 },
    { id: 'qf', difficulty: 1.08 },
    { id: 'sf', difficulty: 1.15 },
    { id: 'final', difficulty: 1.22 },
  ]

  let furthest: CupStage = 'out'
  let playerGoals = 0
  let playerApps = 0
  const own = getClub(playerClubId)
  const ownLeague = getLeagueForClub(playerClubId)
  const rivalsPool = Object.keys(CLUBS).filter((id) => {
    if (id === playerClubId) return false
    return getClub(id).country === own.country || getLeagueForClub(id).tier <= ownLeague.tier + 1
  })
  const pool = rivalsPool.length ? rivalsPool : Object.keys(CLUBS).filter((id) => id !== playerClubId)

  for (const round of rounds) {
    const rivalId = pool[rngInt(pool.length)]!
    const cupRival = getClub(rivalId)
    const played = chance(
      appearanceChance(player, playerClubId, strengthMods, rival, rivalPressure),
    )
    if (played) {
      playerApps++
      const goalP =
        (player.position === 'NP' ? 0.28 : player.position === 'POM' ? 0.14 : 0.06) *
        (0.85 + Math.random() * 0.3) *
        (player.attrs.shooting / 70)
      if (chance(Math.min(0.55, goalP))) playerGoals++
    }

    const boost = played
      ? (player.overall - 50) * 0.07 + (Math.random() * 6 - 2)
      : -2
    const ownP = own.strength + boost + Math.random() * 6
    const rivP = cupRival.strength * round.difficulty + Math.random() * 6
    const win = ownP >= rivP

    if (!win) {
      return { stage: furthest === 'out' ? 'out' : furthest, playerGoals, playerApps }
    }
    furthest = round.id
    if (round.id === 'final') {
      return { stage: 'winner', playerGoals, playerApps }
    }
  }
  return { stage: furthest, playerGoals, playerApps }
}

export interface FixtureBatchState {
  appearances: number
  goals: number
  assists: number
  ratingSum: number
  matchesMissedInjury: number
  injuryLabels: string[]
  matchMood: number
  appsThisSeason: number
  injuryAtApp: number
}

function runFixtureBatch(
  fixtures: Array<{ homeId: string; awayId: string }>,
  player: Player,
  season: SeasonState,
  standings: ClubStanding[],
  scorerMap: Map<string, ScorerEntry>,
  strengthMods: Record<string, number>,
  state: FixtureBatchState,
): void {
  const rival = season.rival
  const rivalPressure = season.rivalPressure ?? 0

  for (const fixture of fixtures) {
    const { homeId, awayId } = fixture
    const involvesPlayer = homeId === season.clubId || awayId === season.clubId

    let starts = false
    let boost = 0
    let matchGoals = 0
    let matchAssists = 0

    if (involvesPlayer) {
      state.matchMood = clamp(
        state.matchMood * 0.82 + 50 * 0.18 + (Math.random() * 10 - 5),
        28,
        88,
      )
      if (chance(0.04)) state.matchMood = clamp(state.matchMood + (4 + Math.random() * 8), 28, 88)
      if (chance(0.03)) state.matchMood = clamp(state.matchMood - (3 + Math.random() * 6), 28, 88)

      const injuredOut =
        player.injury != null &&
        (player.injury.seasonEnding || player.injury.matchesLeft > 0)

      if (injuredOut) {
        state.matchesMissedInjury++
        if (player.injury && !player.injury.seasonEnding) {
          player.injury.matchesLeft = Math.max(0, player.injury.matchesLeft - 1)
          if (player.injury.matchesLeft === 0) {
            state.injuryLabels.push(`Powrót po: ${player.injury.label}`)
            player.injury = null
            state.matchMood = clamp(state.matchMood - 6, 20, 80)
          }
        }
        state.matchMood = clamp(state.matchMood - 2, 15, 80)
      } else {
        starts = chance(
          matchAppearanceChance(
            player,
            state.matchMood,
            season.clubId,
            strengthMods,
            rival,
            rivalPressure,
          ),
        )

        if (starts) {
          state.appearances++
          boost = (player.overall - 50) * 0.1 + (state.matchMood - 50) * 0.04
          const goalChance =
            (player.position === 'NP' ? 0.26 : player.position === 'POM' ? 0.11 : 0.045) *
            (0.85 + state.matchMood / 250) *
            (player.attrs.shooting / 72)
          if (chance(Math.min(0.48, goalChance))) {
            matchGoals = chance(0.14) ? 2 : 1
            state.goals += matchGoals
          }
          const assistChance =
            (player.position === 'POM' || player.position === 'NP' ? 0.18 : 0.08) *
            (player.attrs.passing / 78) *
            (0.85 + state.matchMood / 250)
          if (chance(Math.min(0.4, assistChance))) {
            matchAssists = 1
            state.assists++
          }
          const rating = clamp(
            5.4 +
              state.matchMood / 85 +
              (player.overall - 45) / 40 +
              matchGoals * 0.8 +
              matchAssists * 0.4 +
              (Math.random() * 1.4 - 0.6),
            3.5,
            9.6,
          )
          state.ratingSum += rating
          if (rating >= 7.4) state.matchMood = clamp(state.matchMood + 2 + Math.random() * 2, 28, 88)
          else if (rating < 5.0) {
            state.matchMood = clamp(state.matchMood - (1 + Math.random() * 2), 28, 88)
          }

          state.appsThisSeason++
          if (state.appsThisSeason === state.injuryAtApp && !player.injury) {
            const roll = Math.random()
            if (roll < 0.07) {
              player.injury = {
                matchesLeft: 99,
                label: 'Poważna kontuzja (koniec sezonu)',
                seasonEnding: true,
              }
              state.injuryLabels.push('Poważna kontuzja — praktycznie koniec sezonu')
              state.matchMood = clamp(state.matchMood - 12, 10, 70)
            } else if (roll < 0.45) {
              const n = 3 + rngInt(4)
              player.injury = {
                matchesLeft: n,
                label: `Uraz mięśniowy (${n} meczów)`,
                seasonEnding: false,
              }
              state.injuryLabels.push(`Kontuzja: wypadasz na ${n} meczów`)
              state.matchMood = clamp(state.matchMood - 6, 15, 75)
            } else {
              const n = 1 + rngInt(2)
              player.injury = {
                matchesLeft: n,
                label: `Lekki uraz (${n} meczów)`,
                seasonEnding: false,
              }
              state.injuryLabels.push(`Lekki uraz: ${n} mecz(e) przerwy`)
              state.matchMood = clamp(state.matchMood - 3, 20, 80)
            }
          }
        } else {
          state.matchMood = clamp(state.matchMood * 0.9 + 48 * 0.1, 28, 88)
        }
      }
    }

    const homePow =
      getEffectiveStrength(homeId, strengthMods) +
      (homeId === season.clubId && starts ? boost : 0) +
      Math.random() * 6 -
      3
    const awayPow =
      getEffectiveStrength(awayId, strengthMods) +
      (awayId === season.clubId && starts ? boost : 0) +
      Math.random() * 6 -
      3

    let hg = scoreline(homePow, awayPow * 0.9)
    let ag = scoreline(awayPow, homePow * 0.9)

    if (starts && matchGoals > 0) {
      if (homeId === season.clubId) hg = Math.max(hg, matchGoals)
      else ag = Math.max(ag, matchGoals)
    }

    updateStanding(standings.find((s) => s.clubId === homeId)!, hg, ag)
    updateStanding(standings.find((s) => s.clubId === awayId)!, ag, hg)

    for (const [clubId, gFor] of [
      [homeId, hg],
      [awayId, ag],
    ] as const) {
      if (clubId === season.clubId) {
        const teammates = Math.max(0, gFor - (starts ? matchGoals : 0))
        distributeClubGoals(scorerMap, clubId, season.year, teammates)
      } else {
        distributeClubGoals(scorerMap, clubId, season.year, gFor)
      }
    }
  }
}

export function tweakRivalForm(rival: PositionalRival, appearances: number, goals: number, halfApps: number): void {
  if (appearances >= Math.max(3, halfApps * 0.45) && goals >= 2) {
    rival.form = clamp(rival.form - (3 + rngInt(3)), 28, 78)
  } else if (appearances >= Math.max(2, halfApps * 0.35)) {
    rival.form = clamp(rival.form - 2, 30, 78)
  } else if (appearances <= 1) {
    rival.form = clamp(rival.form + (2 + rngInt(3)), 30, 80)
  } else {
    rival.form = clamp(rival.form + (Math.random() * 4 - 2), 30, 78)
  }
}

function buildHalfProgress(
  state: FixtureBatchState,
  overallBefore: number,
  fixturesForPlayer: number,
  scorerMap: Map<string, ScorerEntry>,
): SeasonHalfProgress {
  return {
    appearances: state.appearances,
    goals: state.goals,
    assists: state.assists,
    ratingSum: state.ratingSum,
    matchesMissedInjury: state.matchesMissedInjury,
    injuryLabels: [...state.injuryLabels],
    matchMood: state.matchMood,
    appsThisSeason: state.appsThisSeason,
    injuryAtApp: state.injuryAtApp,
    overallBefore,
    fixturesForPlayer,
    scorerEntries: [...scorerMap.values()].map((e) => ({ ...e })),
  }
}

/** 1. połowa → przerwa zimowa */
export function simulateFirstHalf(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number> = {},
): WinterBreakSnapshot {
  const clubIds = season.standings.map((s) => s.clubId)
  const allFixtures = buildSeasonFixtures(clubIds)
  const mid = Math.ceil(allFixtures.length / 2)
  const fixtures = allFixtures.slice(0, mid)
  const playerFixturesFull = allFixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  )
  const fixturesForPlayer = playerFixturesFull.length
  const playerFixturesHalf = fixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  )
  const overallBefore = player.overall

  const standings: ClubStanding[] = clubIds.map((id) => {
    const existing = season.standings.find((s) => s.clubId === id)
    return (
      existing ?? {
        clubId: id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      }
    )
  })
  for (const row of standings) {
    row.played = 0
    row.won = 0
    row.drawn = 0
    row.lost = 0
    row.goalsFor = 0
    row.goalsAgainst = 0
    row.points = 0
  }

  const scorerMap = new Map<string, ScorerEntry>()
  for (const clubId of clubIds) {
    ensureClubScorers(scorerMap, clubId, season.year)
  }

  const care = clamp(season.injuryCare ?? 0, 0, 5)
  const seasonInjuryP = Math.max(0.06, 0.2 * (1 - care * 0.14))
  const willGetInjured = Math.random() < seasonInjuryP
  const injuryAtApp = willGetInjured
    ? 1 + rngInt(Math.max(1, Math.floor(fixturesForPlayer * 0.85)))
    : -1

  const batch: FixtureBatchState = {
    appearances: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
    matchesMissedInjury: 0,
    injuryLabels: [],
    matchMood: clamp(50 + (Math.random() * 12 - 4), 38, 62),
    appsThisSeason: 0,
    injuryAtApp,
  }

  runFixtureBatch(fixtures, player, season, standings, scorerMap, strengthMods, batch)

  if (batch.goals > 0) {
    bumpScorer(
      scorerMap,
      'player',
      { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
      batch.goals,
    )
  }

  season.standings = standings
  season.halfStats = buildHalfProgress(batch, overallBefore, fixturesForPlayer, scorerMap)
  season.phase = 'firstHalfDone'

  tweakRivalForm(season.rival, batch.appearances, batch.goals, playerFixturesHalf.length)

  const sorted = sortedStandings({ standings })
  const place = sorted.findIndex((s) => s.clubId === season.clubId) + 1
  const myRow = standings.find((s) => s.clubId === season.clubId)!
  const avgRating = batch.appearances ? Math.round((batch.ratingSum / batch.appearances) * 10) / 10 : 0
  const rivalNote = describeRival(player, season.rival)

  let narrative = `Przerwa zimowa: ${getClub(season.clubId).name} na ${place}. miejscu (${myRow.points} pkt). `
  narrative += `Zagrałeś ${batch.appearances} meczów, ${batch.goals} G / ${batch.assists} A`
  if (avgRating > 0) narrative += `, średnia ${avgRating}`
  narrative += `. ${rivalNote}`
  if (batch.injuryLabels.length) {
    narrative += ` Kontuzje: ${batch.injuryLabels[batch.injuryLabels.length - 1]}.`
  }

  return {
    year: season.year,
    leagueId: season.leagueId,
    clubId: season.clubId,
    place,
    points: myRow.points,
    appearances: batch.appearances,
    goals: batch.goals,
    assists: batch.assists,
    avgRating,
    rivalNote,
    narrative,
  }
}

export function finalizeSeasonReport(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number>,
  standings: ClubStanding[],
  scorerMap: Map<string, ScorerEntry>,
  batch: FixtureBatchState,
  overallBefore: number,
  fixturesForPlayer: number,
): SeasonReport {
  const league = getLeague(season.leagueId)
  const clubIds = standings.map((s) => s.clubId)
  const clubCount = clubIds.length

  let { appearances, goals, assists, ratingSum, matchesMissedInjury } = batch
  const injuryLabels = [...batch.injuryLabels]
  let injuryNote: string | null = null
  const matchMood = batch.matchMood

  if (goals > 0) {
    const playerEntry = scorerMap.get('player')
    if (!playerEntry || playerEntry.goals < goals) {
      bumpScorer(
        scorerMap,
        'player',
        { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
        goals - (playerEntry?.goals ?? 0),
      )
    }
  }

  const leagueApps = appearances
  const leagueAvgRating = leagueApps ? ratingSum / leagueApps : 5.5

  if (injuryLabels.length) {
    injuryNote = injuryLabels[injuryLabels.length - 1]!
    if (injuryLabels.length > 1) injuryNote += ` (+${injuryLabels.length - 1} wcześniej)`
  }
  if (player.injury?.seasonEnding) {
    injuryNote = player.injury.label
  } else if (player.injury && player.injury.matchesLeft > 0) {
    player.injury = null
  }

  const cup = simulatePolishCup(
    season.clubId,
    { ...player, form: clamp(matchMood, 25, 80) },
    strengthMods,
    season.rival,
    season.rivalPressure ?? 0,
  )
  goals += cup.playerGoals
  appearances += cup.playerApps
  if (cup.playerGoals > 0) {
    bumpScorer(
      scorerMap,
      'player',
      { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
      cup.playerGoals,
    )
  }

  let perfForm = performanceFormScore(
    player.position,
    goals,
    assists,
    leagueApps,
    fixturesForPlayer,
    leagueAvgRating || 6.0,
    player.overall,
  )
  if (matchesMissedInjury >= fixturesForPlayer * 0.35) perfForm -= 10
  else if (matchesMissedInjury >= 3) perfForm -= 5
  if (injuryNote?.includes('Poważna') || injuryNote?.includes('koniec sezonu')) perfForm -= 8

  const appRate = fixturesForPlayer > 0 ? leagueApps / fixturesForPlayer : 0
  const young = player.age <= 25
  const veryYoung = player.age <= 21

  // Młody + dużo gry = lepsza forma sezonu (minuty budują pewność)
  if (young) {
    if (appRate >= 0.7) perfForm += veryYoung ? 12 : 8
    else if (appRate >= 0.55) perfForm += veryYoung ? 8 : 5
    else if (appRate >= 0.4) perfForm += veryYoung ? 4 : 2
    else if (appRate < 0.2) perfForm -= 5
    else if (appRate < 0.3) perfForm -= 2
  }
  // Start kariery (niski OVR): jeszcze mocniejszy boost z minut
  if (player.overall <= 52 && young && appRate >= 0.4) {
    perfForm += player.overall <= 48 ? 8 : 5
  }

  const luckSpan = player.overall <= 50 ? 18 : player.overall <= 62 ? 14 : 10
  const luck = Math.random() * luckSpan - luckSpan * 0.32
  const avgForm = clamp(perfForm + luck, 18, 94)
  let formLabel: FormLabel = formLabelFromAvg(avgForm, player.overall)

  const rating = leagueApps ? leagueAvgRating : 0
  if (rating > 0) {
    if (rating < 6.5 && (formLabel === 'świetna' || formLabel === 'dobra')) formLabel = 'przyzwoita'
    else if (rating < 7.0 && formLabel === 'świetna') formLabel = 'dobra'
    else if (rating < 7.3 && formLabel === 'świetna' && avgForm < 82) formLabel = 'dobra'
  }

  let ovrTarget = 0

  if (formLabel === 'świetna') ovrTarget = young ? 2 : 1
  else if (formLabel === 'dobra') ovrTarget = young ? 1 : chance(0.45) ? 1 : 0
  else if (formLabel === 'przyzwoita') ovrTarget = young ? (chance(0.3) ? 1 : 0) : chance(0.15) ? 1 : 0
  else if (formLabel === 'słaba') ovrTarget = young ? (chance(0.6) ? 0 : -1) : -1
  else if (formLabel === 'fatalna') ovrTarget = -2

  // Minuty: lekki bonus, bez stackowania do sufitu co sezon
  if (young && formLabel !== 'fatalna' && formLabel !== 'słaba') {
    if (appRate >= 0.7 && ovrTarget >= 0 && chance(veryYoung ? 0.55 : 0.35)) {
      ovrTarget += 1
    } else if (appRate >= 0.5 && ovrTarget === 0 && veryYoung && chance(0.4)) {
      ovrTarget = 1
    }
  }

  if (young && ovrTarget >= 1 && rating >= 7.3 && appRate >= 0.55 && chance(veryYoung ? 0.3 : 0.18)) {
    ovrTarget += 1
  }

  // Młody (≤25): lepszy / silniejszy klub = szybszy rozwój (przy minutach)
  if (young && formLabel !== 'fatalna' && appRate >= 0.35) {
    const clubStr = getEffectiveStrength(season.clubId, strengthMods)
    let clubBonus = 0
    if (clubStr >= 88 && appRate >= 0.35) clubBonus = chance(0.7) ? 1 : 0
    else if (clubStr >= 80 && appRate >= 0.4) clubBonus = chance(0.55) ? 1 : 0
    else if (clubStr >= 72 && appRate >= 0.45) clubBonus = chance(0.42) ? 1 : 0
    else if (clubStr >= 64 && appRate >= 0.5) clubBonus = chance(0.3) ? 1 : 0
    else if (clubStr >= 55 && appRate >= 0.55) clubBonus = chance(0.18) ? 1 : 0

    if (veryYoung && clubStr >= 70 && appRate >= 0.5 && chance(0.28)) {
      clubBonus += 1
    }
    ovrTarget += clubBonus
  }

  if ((cup.stage === 'winner' || cup.stage === 'final') && rating >= 7.0 && chance(0.4)) ovrTarget += 1
  if (player.position === 'NP' && goals >= 15 && rating >= 7.0 && chance(0.45)) ovrTarget += 1
  if (player.position === 'POM' && goals + assists >= 14 && rating >= 7.0 && chance(0.45)) ovrTarget += 1
  if (appRate < 0.15 && formLabel !== 'świetna') ovrTarget -= 1
  if (matchesMissedInjury >= fixturesForPlayer * 0.45) ovrTarget -= 1

  // Ocena trzyma sufit wzrostu
  if (rating > 0) {
    const ratingCap =
      rating < 6.5 ? (young ? 1 : 0) : rating < 6.9 ? 1 : rating < 7.4 ? 2 : young ? 3 : 2
    ovrTarget = Math.min(ovrTarget, ratingCap)
  }

  if (ovrTarget > 0) {
    if (player.overall >= 88) ovrTarget = Math.min(ovrTarget, chance(0.25) ? 1 : 0)
    else if (player.overall >= 82) ovrTarget = Math.min(ovrTarget, 1)
    else if (player.overall >= 75) ovrTarget = Math.min(ovrTarget, young ? 2 : 1)
  }

  // Kotwica: zmiana względem OVR z początku sezonu, twardy limit ±4
  syncPlayerOverall(player)
  ovrTarget = clampSeasonOvrDelta(player.age, ovrTarget, overallBefore)
  const desired = clamp(overallBefore + ovrTarget, 1, 99)
  applyOverallChange(player, desired - player.overall)
  syncPlayerOverall(player)
  if (player.overall > overallBefore + 4) {
    applyOverallChange(player, overallBefore + 4 - player.overall)
  } else if (player.overall < overallBefore - 4) {
    applyOverallChange(player, overallBefore - 4 - player.overall)
  }
  syncPlayerOverall(player)

  player.form = 50
  player.morale = clamp(
    player.morale +
      (formLabel === 'świetna'
        ? 5
        : formLabel === 'dobra'
          ? 2
          : formLabel === 'fatalna'
            ? -5
            : formLabel === 'słaba'
              ? -2
              : leagueAvgRating >= 6.8
                ? 1
                : 0),
    1,
    100,
  )
  player.reputation = clamp(
    player.reputation +
      Math.floor(goals / 4) +
      (cup.stage === 'winner' ? 5 : cup.stage === 'final' ? 3 : 0) +
      (leagueApps > fixturesForPlayer * 0.6 ? 2 : 0) +
      (formLabel === 'świetna' ? 2 : formLabel === 'fatalna' ? -2 : 0),
    0,
    100,
  )
  player.money += (player.contract.wage || getClub(season.clubId).wage) * 8

  const finalOverall = player.overall
  const finalDelta = finalOverall - overallBefore

  const sorted = sortedStandings({ standings })
  const place = sorted.findIndex((s) => s.clubId === season.clubId) + 1
  const myRow = standings.find((s) => s.clubId === season.clubId)!

  const scorers = [...scorerMap.values()]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 12)
  const playerScorerRank = scorers.findIndex((s) => s.isPlayer)
  const rank = playerScorerRank >= 0 ? playerScorerRank + 1 : null

  // Minigierka w trakcie sezonu zastępuje post-season key matches
  const keyMatchesPending: PendingKeyMatch[] = []

  const promotion = league.country === 'PL' && league.tier > 1 && place <= 2
  const relegation =
    league.country !== 'PL' || league.tier <= 0
      ? false
      : league.tier === 1
        ? place >= clubCount - 1
        : league.tier < 4
          ? place >= clubCount
          : false
  const title = place === 1 && league.tier <= 1

  const underContract = player.contract.yearsLeft > 1
  let contractRenewed: boolean
  let proposedContractYears: number
  let contractNote: string

  if (underContract) {
    contractRenewed = true
    proposedContractYears = 0
    const remaining = player.contract.yearsLeft - 1
    contractNote =
      remaining === 1
        ? 'Masz jeszcze rok kontraktu — klub nie musi przedłużać.'
        : `Masz jeszcze ${remaining} lata kontraktu — klub nie musi przedłużać.`
  } else {
    let refuseChance = 0.025
    if (formLabel === 'fatalna') refuseChance += 0.14
    else if (formLabel === 'słaba') refuseChance += 0.05
    if (leagueApps < fixturesForPlayer * 0.2) refuseChance += 0.06
    if (leagueAvgRating > 0 && leagueAvgRating < 5.0 && leagueApps >= 8) refuseChance += 0.05
    if (place >= clubCount - 1) refuseChance += 0.03
    if (formLabel === 'świetna' || formLabel === 'dobra' || goals >= 8 || cup.stage === 'winner') {
      refuseChance *= 0.2
    }
    if (matchesMissedInjury >= fixturesForPlayer * 0.4) refuseChance += 0.12
    contractRenewed = Math.random() >= refuseChance
    proposedContractYears = contractRenewed ? (chance(0.4) ? 3 : 2) : 0
    contractNote = contractRenewed
      ? `Klub chce przedłużyć kontrakt o ${proposedContractYears} lat.`
      : formLabel === 'fatalna' || matchesMissedInjury >= fixturesForPlayer * 0.4
        ? 'Klub nie przedłuża kontraktu — forma / kontuzje i brak zaufania.'
        : 'Klub nie przedłuża kontraktu — szuka innego kierunku.'
  }

  const rivalNote = describeRival(player, season.rival)

  let narrative = `${getClub(season.clubId).name} kończy sezon na ${place}. miejscu (${myRow.points} pkt, ${myRow.played} meczów). `
  narrative += `Zagrałeś ${leagueApps}/${fixturesForPlayer} meczów ligowych (+ puchar). Forma: ${formLabel}. `
  if (young && appRate >= 0.55 && finalDelta > 0) {
    const clubStr = getEffectiveStrength(season.clubId, strengthMods)
    narrative +=
      clubStr >= 70
        ? `Silne środowisko + minuty u młodego — rozwój ↑. `
        : `Dużo minut u młodego zawodnika — rozwój ↑. `
  } else if (young && appRate < 0.25 && finalDelta <= 0) {
    narrative += `Mało gry — trudno o rozwój. `
  }
  if (finalDelta > 0) narrative += `Overall ↑ +${finalDelta} (${overallBefore} → ${finalOverall}). `
  else if (finalDelta < 0) narrative += `Overall ↓ ${finalDelta} (${overallBefore} → ${finalOverall}). `
  else narrative += `Overall bez zmian (${finalOverall}). `
  if (promotion) narrative += 'Awans klubu! '
  if (relegation) narrative += 'Spadek klubu. '
  if (title) narrative += 'Mistrzostwo Polski! '
  if (injuryNote) narrative += `Kontuzje: ${injuryNote} (opuszczone mecze: ${matchesMissedInjury}). `
  narrative += `${rivalNote} `
  narrative += cupStageLabel(cup.stage) + '. ' + contractNote

  return {
    year: season.year,
    leagueId: season.leagueId,
    clubId: season.clubId,
    place,
    points: myRow.points,
    played: myRow.played,
    appearances,
    possibleAppearances: fixturesForPlayer,
    goals,
    assists,
    avgRating: leagueApps ? Math.round(leagueAvgRating * 10) / 10 : 0,
    avgForm: Math.round(avgForm),
    formLabel,
    overallBefore,
    overallAfter: finalOverall,
    overallDelta: finalDelta,
    cupStage: cup.stage,
    cupLabel: cupStageLabel(cup.stage),
    scorers,
    playerScorerRank: rank,
    standings,
    narrative,
    keyMatchesPending,
    keyMatchesDone: 0,
    promotion,
    relegation,
    title,
    contractRenewed,
    contractNote,
    proposedContractYears,
    injuryNote,
    matchesMissedInjury,
    rivalNote,
  }
}

/** 2. połowa → raport sezonu */
export function simulateSecondHalf(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number> = {},
): SeasonReport {
  season.phase = 'secondHalf'
  const half = season.halfStats
  const clubIds = season.standings.map((s) => s.clubId)
  const allFixtures = buildSeasonFixtures(clubIds)
  const mid = Math.ceil(allFixtures.length / 2)
  const tableStarted = season.standings.some((s) => s.played > 0)

  // Ten sam klub: dokończ 2. połowę. Nowy klub (pusta tabela): pełny batch jako „reszta sezonu”.
  const fixtures = tableStarted ? allFixtures.slice(mid) : allFixtures

  const standings: ClubStanding[] = season.standings.map((s) => ({ ...s }))
  if (!tableStarted) {
    for (const row of standings) {
      row.played = 0
      row.won = 0
      row.drawn = 0
      row.lost = 0
      row.goalsFor = 0
      row.goalsAgainst = 0
      row.points = 0
    }
  }

  const scorerMap = half
    ? scorerMapFromEntries(half.scorerEntries)
    : new Map<string, ScorerEntry>()
  for (const clubId of clubIds) {
    ensureClubScorers(scorerMap, clubId, season.year)
  }

  const playerFixturesFull = allFixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  )
  const batchPlayerFixtures = fixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  )

  let fixturesForPlayer =
    half?.fixturesForPlayer ?? playerFixturesFull.length
  if (!tableStarted && half) {
    // Transfer zimowy — dorobek osobisty z 1. połowy + mecze w nowym klubie
    const firstHalfAppsPossible = Math.ceil(half.fixturesForPlayer / 2)
    fixturesForPlayer = firstHalfAppsPossible + batchPlayerFixtures.length
  }

  const overallBefore = half?.overallBefore ?? player.overall

  const care = clamp(season.injuryCare ?? 0, 0, 5)
  const seasonInjuryP = Math.max(0.06, 0.2 * (1 - care * 0.14))
  const defaultInjuryAtApp =
    half?.injuryAtApp ??
    (Math.random() < seasonInjuryP
      ? 1 + rngInt(Math.max(1, Math.floor(fixturesForPlayer * 0.85)))
      : -1)

  const batch: FixtureBatchState = {
    appearances: half?.appearances ?? 0,
    goals: half?.goals ?? 0,
    assists: half?.assists ?? 0,
    ratingSum: half?.ratingSum ?? 0,
    matchesMissedInjury: half?.matchesMissedInjury ?? 0,
    injuryLabels: half ? [...half.injuryLabels] : [],
    matchMood: half?.matchMood ?? clamp(50 + (Math.random() * 12 - 4), 38, 62),
    appsThisSeason: half?.appsThisSeason ?? 0,
    injuryAtApp: defaultInjuryAtApp,
  }

  const goalsBeforeBatch = batch.goals
  runFixtureBatch(fixtures, player, season, standings, scorerMap, strengthMods, batch)

  const goalsAdded = batch.goals - goalsBeforeBatch
  if (goalsAdded > 0) {
    bumpScorer(
      scorerMap,
      'player',
      { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
      goalsAdded,
    )
  }

  tweakRivalForm(
    season.rival,
    batch.appearances - (half?.appearances ?? 0),
    batch.goals - (half?.goals ?? 0),
    batchPlayerFixtures.length,
  )

  season.standings = standings
  season.halfStats = null

  return finalizeSeasonReport(
    player,
    season,
    strengthMods,
    standings,
    scorerMap,
    batch,
    overallBefore,
    fixturesForPlayer,
  )
}

/** Pełny sezon = 1. połowa + 2. połowa (wrapper). */
export function simulateFullSeason(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number> = {},
): SeasonReport {
  simulateFirstHalf(player, season, strengthMods)
  return simulateSecondHalf(player, season, strengthMods)
}

export function applyKeyMatchToReport(
  report: SeasonReport,
  player: Player,
  momentScore: number,
  action: 'shoot' | 'pass',
  match: PendingKeyMatch,
): void {
  const success = momentScore >= 65
  report.keyMatchesDone++

  if (success) {
    player.morale = clamp(player.morale + 5, 1, 100)
    if (action === 'shoot' && momentScore >= 70) {
      report.goals += 1
      const entry = report.scorers.find((s) => s.isPlayer)
      if (entry) entry.goals += 1
      else
        report.scorers.unshift({
          name: player.name,
          clubId: report.clubId,
          goals: 1,
          isPlayer: true,
        })
      report.scorers.sort((a, b) => b.goals - a.goals)
      report.playerScorerRank = report.scorers.findIndex((s) => s.isPlayer) + 1
    }
    if (action === 'pass' && momentScore >= 70) report.assists += 1

    if (match.stake === 'leaguePoints') {
      const row = report.standings.find((s) => s.clubId === report.clubId)
      if (row) {
        row.points += 2
        row.goalsFor += 1
      }
      report.points += 2
      const fakeSeason = {
        clubId: report.clubId,
        standings: report.standings,
      }
      report.place = playerTablePosition(fakeSeason)
    }

    if (match.stake === 'cupProgress') {
      if (report.cupStage === 'sf') {
        report.cupStage = 'final'
        report.cupLabel = cupStageLabel('final')
      } else if (report.cupStage === 'final') {
        report.cupStage = 'winner'
        report.cupLabel = cupStageLabel('winner')
        player.reputation = clamp(player.reputation + 3, 0, 100)
      } else if (report.cupStage === 'qf' || report.cupStage === 'r16') {
        report.cupStage = 'sf'
        report.cupLabel = cupStageLabel('sf')
      }
    }

    report.narrative += ` Kluczowy mecz wygrany akcją (${Math.round(momentScore)}%).`
  } else {
    player.morale = clamp(player.morale - 2, 1, 100)
    report.narrative += ` Kluczowa akcja nie wyszła (${Math.round(momentScore)}%).`
  }
}
