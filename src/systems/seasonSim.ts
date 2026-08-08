import { CLUBS, getClub, getLeague } from '../data/clubs'
import type {
  Attributes,
  ClubStanding,
  CupStage,
  KeyMatchReason,
  PendingKeyMatch,
  Player,
  ScorerEntry,
  SeasonReport,
  SeasonState,
} from '../state/types'
import { clamp, clampSeasonOvrDelta, cupStageLabel, formLabelFromAvg, performanceFormScore } from '../state/types'
import { calcOverall } from './playerFactory'
import { playerTablePosition, sortedStandings } from './standings'

/** Podnosi atrybuty tak, by overall faktycznie zmienił się o targetDelta (±). */
function applyOverallChange(player: Player, targetDelta: number): number {
  const before = player.overall
  if (targetDelta === 0) return 0

  const focusOrder: Array<keyof Attributes> =
    player.position === 'NP'
      ? ['shooting', 'pace', 'stamina', 'passing', 'defending']
      : player.position === 'POM'
        ? ['passing', 'shooting', 'stamina', 'pace', 'defending']
        : player.position === 'OB'
          ? ['defending', 'stamina', 'pace', 'passing', 'shooting']
          : ['passing', 'defending', 'stamina', 'pace', 'shooting']

  let guard = 0
  if (targetDelta > 0) {
    let i = 0
    while (player.overall < before + targetDelta && guard < 40) {
      const key = focusOrder[i % focusOrder.length]!
      player.attrs[key] = clamp(player.attrs[key] + 1)
      player.overall = calcOverall(player.attrs, player.position)
      i++
      guard++
    }
  } else {
    let i = 0
    while (player.overall > before + targetDelta && guard < 40) {
      const key = focusOrder[i % focusOrder.length]!
      player.attrs[key] = clamp(player.attrs[key] - 1)
      player.overall = calcOverall(player.attrs, player.position)
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

function rngInt(n: number): number {
  return Math.floor(Math.random() * n)
}

function chance(p: number): boolean {
  return Math.random() < p
}

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

function npcName(seed: string): string {
  const h = hashSeed(seed)
  const first = NPC_FIRST[h % NPC_FIRST.length] ?? 'Jan'
  const last = NPC_LAST[Math.floor(h / 17) % NPC_LAST.length] ?? 'Kowalski'
  return `${first} ${last}`
}

/** 3 napastników/pomocników na klub — gole nie lecą na jedną osobę. */
function ensureClubScorers(
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
function distributeClubGoals(
  map: Map<string, ScorerEntry>,
  clubId: string,
  year: number,
  goals: number,
): void {
  if (goals <= 0) return
  const keys = ensureClubScorers(map, clubId, year)
  // główny / 2. / 3. / reszta składu (bez wpisu na listę)
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

function updateStanding(row: ClubStanding, gf: number, ga: number): void {
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

function scoreline(att: number, def: number): number {
  // ~0.8–1.0 gola/mecz — król strzelców w 14 kolejkach ≈ 8–12
  const expected = Math.max(0.08, (att - def) / 36 + 0.82)
  let g = 0
  for (let i = 0; i < 4; i++) if (chance(expected / 4)) g++
  if (chance(0.04)) g++
  return Math.min(g, 4)
}

/** Szansa na występ — OVR vs siła klubu + reputacja / morale / wiek. */
export function appearanceChance(player: Player, clubId?: string): number {
  const ovrPart = player.overall / 145
  const repPart = player.reputation / 240
  const moralePart = player.morale / 300
  const agePart =
    player.age >= 36 ? -0.14 : player.age >= 33 ? -0.08 : player.age >= 30 ? -0.04 : 0

  let clubBit = 0
  if (clubId) {
    const club = getClub(clubId)
    // Silniejszy klub → trudniej o „11”; słabszy → łatwiej
    const gap = player.overall - club.strength
    clubBit = gap / 48
  }

  return Math.max(0.1, Math.min(0.92, 0.28 + ovrPart + repPart + moralePart + agePart + clubBit))
}

/** Szansa w trakcie sezonu — chwilowy humor meczowy, nie zapisana forma. */
function matchAppearanceChance(player: Player, matchMood: number, clubId: string): number {
  const base = appearanceChance(player, clubId)
  const moodBit = (matchMood - 50) / 220
  return Math.max(0.1, Math.min(0.94, base + moodBit))
}

/**
 * Pełny terminarz ligowy — każdy klub gra z każdym.
 * Małe ligi (≤10): dwurundowo. Większe (Ekstraklasa): jedna runda.
 */
function buildSeasonFixtures(
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
    // rotacja „okrężna”
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

function bumpScorer(map: Map<string, ScorerEntry>, key: string, entry: ScorerEntry, goals: number): void {
  const cur = map.get(key)
  if (cur) cur.goals += goals
  else map.set(key, { ...entry, goals })
}

function simulatePolishCup(
  playerClubId: string,
  player: Player,
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
  const rivalsPool = Object.keys(CLUBS).filter((id) => id !== playerClubId)

  for (const round of rounds) {
    const rivalId = rivalsPool[rngInt(rivalsPool.length)]!
    const rival = getClub(rivalId)
    const played = chance(appearanceChance(player, playerClubId))
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
    const rivP = rival.strength * round.difficulty + Math.random() * 6
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

function buildKeyMatches(
  season: SeasonState,
  place: number,
  clubIds: string[],
  cupStage: CupStage,
): PendingKeyMatch[] {
  const keys: PendingKeyMatch[] = []
  const league = getLeague(season.leagueId)
  const clubCount = clubIds.length
  const own = season.clubId
  const others = clubIds.filter((id) => id !== own)
  const opp = (i: number) => others[i % others.length]!

  const push = (
    reason: KeyMatchReason,
    label: string,
    description: string,
    stake: PendingKeyMatch['stake'],
    opponentId: string,
  ) => {
    if (keys.length >= 2) return
    const home = keys.length % 2 === 0
    keys.push({
      homeId: home ? own : opponentId,
      awayId: home ? opponentId : own,
      opponentId,
      reason,
      label,
      description,
      stake,
    })
  }

  if (cupStage === 'final' || cupStage === 'sf') {
    push(
      'cup',
      cupStage === 'final' ? 'Finał Pucharu Polski' : 'Półfinał Pucharu Polski',
      `Kluczowa akcja w Pucharze Polski przeciwko ${getClub(opp(3)).name}.`,
      'cupProgress',
      opp(3),
    )
  }

  if (league.tier > 1 && place <= 2) {
    push(
      'promotion',
      'Mecz o awans',
      `${getClub(own).name} walczy o awans. Jedna akcja może przesądzić sezon.`,
      'leaguePoints',
      opp(1),
    )
  }

  if (league.tier === 1 && place <= 2) {
    push(
      'title',
      'Walka o mistrzostwo',
      `Czołówka Ekstraklasy — starcie z ${getClub(opp(0)).name}.`,
      'leaguePoints',
      opp(0),
    )
  }

  const relegationZone = league.tier === 1 ? clubCount - 2 : clubCount - 1
  if (league.tier < 4 && place >= relegationZone) {
    push(
      'relegation',
      'Walka o utrzymanie',
      `Strefa spadkowa. Musisz pomóc ${getClub(own).name}.`,
      'leaguePoints',
      opp(2),
    )
  }

  // jeśli brak kluczowych, a puchar głęboko — dodaj mecz pucharowy
  if (keys.length === 0 && (cupStage === 'qf' || cupStage === 'r16')) {
    push(
      'cup',
      'Mecz Pucharu Polski',
      `Ważny mecz PP z ${getClub(opp(4)).name}.`,
      'cupProgress',
      opp(4),
    )
  }

  return keys.slice(0, 2)
}

export function simulateFullSeason(player: Player, season: SeasonState): SeasonReport {
  const league = getLeague(season.leagueId)
  // Kluby z aktualnego sezonu (po awansie/spadku mogą różnić się od szablonu ligi)
  const clubIds = season.standings.map((s) => s.clubId)
  const clubCount = clubIds.length
  const allFixtures = buildSeasonFixtures(clubIds)
  const playerFixtures = allFixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  )
  const fixturesForPlayer = playerFixtures.length
  const overallBefore = player.overall

  const standings: ClubStanding[] = clubIds.map((id) => ({
    clubId: id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }))

  const scorerMap = new Map<string, ScorerEntry>()
  for (const clubId of clubIds) {
    ensureClubScorers(scorerMap, clubId, season.year)
  }

  let appearances = 0
  let goals = 0
  let assists = 0
  let ratingSum = 0

  // Humor meczowy — wraca do średniej, nie spirala w dół
  let matchMood = clamp(50 + (Math.random() * 12 - 4), 38, 62)

  for (const fixture of allFixtures) {
    const { homeId, awayId } = fixture
    const involvesPlayer = homeId === season.clubId || awayId === season.clubId

    let starts = false
    let boost = 0
    let matchGoals = 0
    let matchAssists = 0

    if (involvesPlayer) {
      // mean-reversion + lekki szum
      matchMood = clamp(matchMood * 0.82 + 50 * 0.18 + (Math.random() * 10 - 5), 28, 88)
      if (chance(0.04)) matchMood = clamp(matchMood + (4 + Math.random() * 8), 28, 88)
      if (chance(0.03)) matchMood = clamp(matchMood - (3 + Math.random() * 6), 28, 88)

      starts = chance(matchAppearanceChance(player, matchMood, season.clubId))

      if (starts) {
        appearances++
        boost = (player.overall - 50) * 0.1 + (matchMood - 50) * 0.04
        const goalChance =
          (player.position === 'NP' ? 0.26 : player.position === 'POM' ? 0.11 : 0.045) *
          (0.85 + matchMood / 250) *
          (player.attrs.shooting / 72)
        if (chance(Math.min(0.48, goalChance))) {
          matchGoals = chance(0.14) ? 2 : 1
          goals += matchGoals
        }
        const assistChance =
          (player.position === 'POM' || player.position === 'NP' ? 0.18 : 0.08) *
          (player.attrs.passing / 78) *
          (0.85 + matchMood / 250)
        if (chance(Math.min(0.4, assistChance))) {
          matchAssists = 1
          assists++
        }
        const rating = clamp(
          5.4 +
            matchMood / 85 +
            (player.overall - 45) / 40 +
            matchGoals * 0.8 +
            matchAssists * 0.4 +
            (Math.random() * 1.4 - 0.6),
          3.5,
          9.6,
        )
        ratingSum += rating
        if (rating >= 7.4) matchMood = clamp(matchMood + 2 + Math.random() * 2, 28, 88)
        else if (rating < 5.0) matchMood = clamp(matchMood - (1 + Math.random() * 2), 28, 88)
      } else {
        // Ławka — lekki spadek, bez spiral
        matchMood = clamp(matchMood * 0.9 + 48 * 0.1, 28, 88)
      }
    }

    const homePow =
      getClub(homeId).strength +
      (homeId === season.clubId && starts ? boost : 0) +
      Math.random() * 6 -
      3
    const awayPow =
      getClub(awayId).strength +
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

    // NPC gole — 3 strzelców na klub; u gracza reszta po odjęciu jego goli
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

  if (goals > 0) {
    bumpScorer(
      scorerMap,
      'player',
      { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
      goals,
    )
  }

  const leagueApps = appearances
  const leagueAvgRating = leagueApps ? ratingSum / leagueApps : 5.5

  const cup = simulatePolishCup(season.clubId, {
    ...player,
    form: clamp(matchMood, 25, 80),
  })
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

  // Forma = wynik względem oczekiwań + mały los (średni sezon ≈ przyzwoita)
  const perfForm = performanceFormScore(
    player.position,
    goals,
    assists,
    leagueApps,
    fixturesForPlayer,
    leagueAvgRating || 6.0,
    player.overall,
  )
  const luck = Math.random() * 14 - 5 // lekko na plus (−5…+9)
  const avgForm = clamp(perfForm + luck, 22, 94)
  const formLabel = formLabelFromAvg(avgForm)

  let ovrTarget = 0
  if (leagueApps >= fixturesForPlayer * 0.5 && formLabel !== 'fatalna') {
    if (avgForm >= 60 && leagueAvgRating >= 6.4) ovrTarget += 1
  }
  if (leagueApps >= fixturesForPlayer * 0.65 && leagueAvgRating >= 7.0 && formLabel !== 'słaba' && formLabel !== 'fatalna') {
    ovrTarget += 1
  }
  if (cup.stage === 'winner' || cup.stage === 'final') ovrTarget += 1

  if (player.position === 'NP') {
    if (goals >= 10) ovrTarget += 1
    if (goals >= 15) ovrTarget += 1
    if (goals === 0 && leagueApps >= 10) ovrTarget -= 1
  } else if (player.position === 'POM') {
    const contrib = goals + assists
    if (contrib >= 9) ovrTarget += 1
    if (contrib === 0 && leagueApps >= 12) ovrTarget -= 1
  } else {
    if (leagueAvgRating >= 7.2 && leagueApps >= fixturesForPlayer * 0.6) ovrTarget += 1
    if (leagueAvgRating > 0 && leagueAvgRating < 5.2 && leagueApps >= 8) ovrTarget -= 1
  }

  // Forma wpływa łagodnie — tylko skrajności
  if (formLabel === 'świetna') ovrTarget += 1
  if (formLabel === 'fatalna') ovrTarget -= 1
  if (leagueApps < fixturesForPlayer * 0.15) ovrTarget -= 1

  // Młodzi: do +4 (rzadko), max −2; później mniejszy potencjał wzrostu
  if (player.age <= 25 && formLabel === 'świetna' && leagueAvgRating >= 7.0) ovrTarget += 1
  if (player.age <= 22 && goals >= 12 && player.position === 'NP') ovrTarget += 1
  ovrTarget = clampSeasonOvrDelta(player.age, ovrTarget)

  applyOverallChange(player, ovrTarget)

  // Forma nie jest trwałym atrybutem — reset
  player.form = 50
  player.overall = calcOverall(player.attrs, player.position)
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
  player.money += getClub(season.clubId).wage * 8

  const finalOverall = player.overall
  const finalDelta = finalOverall - overallBefore

  const sorted = sortedStandings({ ...season, standings })
  const place = sorted.findIndex((s) => s.clubId === season.clubId) + 1
  const myRow = standings.find((s) => s.clubId === season.clubId)!

  const scorers = [...scorerMap.values()]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 12)
  const playerScorerRank = scorers.findIndex((s) => s.isPlayer)
  const rank = playerScorerRank >= 0 ? playerScorerRank + 1 : null

  const keyMatchesPending = buildKeyMatches(season, place, clubIds, cup.stage)

  const promotion = league.tier > 1 && place <= 2
  const relegation =
    league.tier === 1
      ? place >= clubCount - 1
      : league.tier < 4
        ? place >= clubCount
        : false
  const title = league.tier === 1 && place === 1

  // Przedłużenie kontraktu — rzadkie, głównie przy fatalnej formie
  let refuseChance = 0.025
  if (formLabel === 'fatalna') refuseChance += 0.14
  else if (formLabel === 'słaba') refuseChance += 0.05
  if (leagueApps < fixturesForPlayer * 0.2) refuseChance += 0.06
  if (leagueAvgRating > 0 && leagueAvgRating < 5.0 && leagueApps >= 8) refuseChance += 0.05
  if (place >= clubCount - 1) refuseChance += 0.03
  if (formLabel === 'świetna' || formLabel === 'dobra' || goals >= 8 || cup.stage === 'winner')
    refuseChance *= 0.2
  const contractRenewed = Math.random() >= refuseChance
  const contractNote = contractRenewed
    ? 'Klub chce przedłużyć kontrakt.'
    : formLabel === 'fatalna'
      ? 'Klub nie przedłuża kontraktu — fatalna forma i brak zaufania.'
      : 'Klub nie przedłuża kontraktu — szuka innego kierunku.'

  let narrative = `${getClub(season.clubId).name} kończy sezon na ${place}. miejscu (${myRow.points} pkt, ${myRow.played} meczów). `
  narrative += `Zagrałeś ${leagueApps}/${fixturesForPlayer} meczów ligowych (+ puchar). Forma: ${formLabel}. `
  if (finalDelta > 0) narrative += `Overall ↑ +${finalDelta} (${overallBefore} → ${finalOverall}). `
  else if (finalDelta < 0) narrative += `Overall ↓ ${finalDelta} (${overallBefore} → ${finalOverall}). `
  else narrative += `Overall bez zmian (${finalOverall}). `
  if (promotion) narrative += 'Awans klubu! '
  if (relegation) narrative += 'Spadek klubu. '
  if (title) narrative += 'Mistrzostwo Polski! '
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
  }
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
      // przelicz miejsce
      const fakeSeason = {
        year: report.year,
        leagueId: report.leagueId,
        clubId: report.clubId,
        standings: report.standings,
        preseasonDone: true,
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

