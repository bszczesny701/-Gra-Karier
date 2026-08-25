import { getClub, getEffectiveStrength, getLeague, LEAGUES } from '../data/clubs'
import type {
  ClubStanding,
  GameState,
  LeagueFixture,
  SeasonState,
} from '../state/types'
import { clamp } from '../state/types'
import { lineupPower, styleMatchupBonus } from './tactics'
import { averageStarterOvr, starters } from './squadGen'

export function rngInt(n: number): number {
  return Math.floor(Math.random() * n)
}

export function chance(p: number): boolean {
  return Math.random() < p
}

export function scoreline(att: number, def: number): number {
  const expected = Math.max(0.08, (att - def) / 36 + 0.82)
  let g = 0
  for (let i = 0; i < 4; i++) if (chance(expected / 4)) g++
  if (chance(0.04)) g++
  return Math.min(g, 4)
}

export function updateStanding(row: ClubStanding, gf: number, ga: number): void {
  row.played += 1
  row.goalsFor += gf
  row.goalsAgainst += ga
  if (gf > ga) {
    row.won += 1
    row.points += 3
  } else if (gf === ga) {
    row.drawn += 1
    row.points += 1
  } else {
    row.lost += 1
  }
}

/** Terminarz: każdy z każdym home+away, pogrupowany w kolejki. */
export function buildSeasonFixtures(clubIds: string[]): LeagueFixture[] {
  const ids = [...clubIds]
  const teams: Array<string | null> = ids.length % 2 === 0 ? [...ids] : [...ids, null]
  const n = teams.length
  const rounds = n - 1
  const half = n / 2
  const firstHalf: LeagueFixture[] = []

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

  const secondHalf = firstHalf.map((f) => ({ homeId: f.awayId, awayId: f.homeId }))
  return [...firstHalf, ...secondHalf]
}

export function groupFixturesIntoRounds(
  fixtures: LeagueFixture[],
  clubCount: number,
): LeagueFixture[][] {
  const perRound = Math.floor(clubCount / 2)
  const rounds: LeagueFixture[][] = []
  for (let i = 0; i < fixtures.length; i += perRound) {
    rounds.push(fixtures.slice(i, i + perRound))
  }
  return rounds
}

export function initClubLeagueMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const league of LEAGUES) {
    for (const id of league.clubIds) map[id] = league.id
  }
  return map
}

export function clubsInLeague(state: GameState, leagueId: string): string[] {
  return Object.entries(state.clubLeagueIds)
    .filter(([, lid]) => lid === leagueId)
    .map(([cid]) => cid)
}

export function emptyStanding(clubId: string): ClubStanding {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }
}

export function createManagerSeason(
  state: GameState,
  clubId: string,
  year: number,
): SeasonState {
  const leagueId = state.clubLeagueIds[clubId] ?? findLeagueId(clubId)
  const clubIds = clubsInLeague(state, leagueId)
  if (clubIds.length < 4) {
    // fallback: baza ligi
    const league = getLeague(leagueId)
    for (const id of league.clubIds) {
      if (!state.clubLeagueIds[id]) state.clubLeagueIds[id] = leagueId
    }
  }
  const ids = clubsInLeague(state, leagueId)
  const fixtures = buildSeasonFixtures(ids)
  const rounds = groupFixturesIntoRounds(fixtures, ids.length)
  return {
    year,
    leagueId,
    clubId,
    clubIds: ids,
    standings: ids.map(emptyStanding),
    fixtures,
    roundIndex: 0,
    rounds,
    phase: 'playing',
    lastMatch: null,
    pendingMoment: null,
    record: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    teamChemistry: state.team?.teamChemistry ?? 52,
  }
}

function findLeagueId(clubId: string): string {
  for (const l of LEAGUES) {
    if (l.clubIds.includes(clubId)) return l.id
  }
  return 'liga-3'
}

export function nextRoundFixtures(season: SeasonState): LeagueFixture[] | null {
  if (season.roundIndex >= season.rounds.length) return null
  return season.rounds[season.roundIndex] ?? null
}

export function yourFixtureInRound(
  season: SeasonState,
  round: LeagueFixture[],
): LeagueFixture | null {
  return round.find((f) => f.homeId === season.clubId || f.awayId === season.clubId) ?? null
}

/** Siła AI klubu (bez kadry gracza). */
export function aiClubPower(clubId: string, mods: Record<string, number> = {}): number {
  return getEffectiveStrength(clubId, mods) + (Math.random() * 4 - 2)
}

/** Stabilny podgląd mocy klubu (bez losu) — do UI. */
export function clubPowerPreview(clubId: string): number {
  return Math.round(getEffectiveStrength(clubId))
}

export function simulateAiMatch(
  homeId: string,
  awayId: string,
  mods: Record<string, number> = {},
): { homeGoals: number; awayGoals: number } {
  const homePow = aiClubPower(homeId, mods) + 1.5
  const awayPow = aiClubPower(awayId, mods)
  return {
    homeGoals: scoreline(homePow, awayPow * 0.92),
    awayGoals: scoreline(awayPow, homePow * 0.92),
  }
}

export function applyResultToStandings(
  standings: ClubStanding[],
  homeId: string,
  awayId: string,
  hg: number,
  ag: number,
): void {
  const home = standings.find((s) => s.clubId === homeId)
  const away = standings.find((s) => s.clubId === awayId)
  if (home) updateStanding(home, hg, ag)
  if (away) updateStanding(away, ag, hg)
}

/** Bazowa symulacja Twojego meczu (bez momentu). */
export function simulateYourMatchBase(
  state: GameState,
  fixture: LeagueFixture,
): {
  homeGoals: number
  awayGoals: number
  yourPower: number
  oppPower: number
  narrativeBits: string[]
} {
  const team = state.team!
  const season = state.season!
  const isHome = fixture.homeId === season.clubId
  const opponentId = isHome ? fixture.awayId : fixture.homeId
  const yourOvr = averageStarterOvr(team)
  let yourPower = lineupPower(team) + (isHome ? 1.8 : 0)
  yourPower += styleMatchupBonus(
    team.tactics.style,
    getEffectiveStrength(opponentId),
    yourOvr,
  )
  const oppPower = aiClubPower(opponentId) + (isHome ? 0 : 1.2)

  let homeGoals: number
  let awayGoals: number
  if (isHome) {
    homeGoals = scoreline(yourPower, oppPower * 0.9)
    awayGoals = scoreline(oppPower, yourPower * 0.92)
  } else {
    homeGoals = scoreline(oppPower, yourPower * 0.92)
    awayGoals = scoreline(yourPower, oppPower * 0.9)
  }

  const bits: string[] = []
  const fitNote =
    team.tactics.style === 'attack'
      ? 'Gra ofensywna.'
      : team.tactics.style === 'defend'
        ? 'Ustawienie defensywne.'
        : 'Zbalansowane podejście.'
  bits.push(fitNote)

  return { homeGoals, awayGoals, yourPower, oppPower, narrativeBits: bits }
}

export function tickSquadAfterMatch(state: GameState, playedIds: string[], won: boolean, drawn: boolean): void {
  const team = state.team!
  for (const p of team.squad) {
    if (playedIds.includes(p.id)) {
      p.fitness = clamp(p.fitness - (8 + rngInt(6)), 25, 100)
      p.form = clamp(p.form + (won ? 2 + rngInt(2) : drawn ? 0 : -(1 + rngInt(2))), 25, 90)
      p.morale = clamp(p.morale + (won ? 2 : drawn ? 0 : -2), 20, 100)
    } else {
      p.fitness = clamp(p.fitness + 4 + rngInt(3), 25, 100)
      if (rngInt(3) === 0) p.form = clamp(p.form - 1, 25, 90)
    }
  }
  team.teamChemistry = clamp(
    team.teamChemistry + (won ? 2 : drawn ? 0 : -2) + (rngInt(3) - 1),
    20,
    100,
  )
  if (state.season) state.season.teamChemistry = team.teamChemistry
}

export function keyPlayerRatings(state: GameState): Array<{ name: string; rating: number }> {
  const xi = starters(state.team!)
  return [...xi]
    .sort((a, b) => b.overall + b.form - (a.overall + a.form))
    .slice(0, 3)
    .map((p) => ({
      name: p.name,
      rating: Math.round(clamp(5.5 + (p.overall - 45) / 40 + (p.form - 50) / 40 + Math.random() * 1.4, 4.5, 9.2) * 10) / 10,
    }))
}

/** Awans/spadek: zamiana z klubem z ligi wyżej/niżej. */
export function applyPromotionRelegation(
  state: GameState,
  place: number,
  leagueId: string,
): { promotion: boolean; relegation: boolean; nextLeagueId: string | null } {
  const league = getLeague(leagueId)
  const higher = LEAGUES.find((l) => l.country === league.country && l.tier === league.tier - 1)
  const lower = LEAGUES.find((l) => l.country === league.country && l.tier === league.tier + 1)

  let promotion = false
  let relegation = false
  let nextLeagueId: string | null = leagueId

  const clubId = state.manager!.clubId

  if (place <= 2 && higher) {
    promotion = true
    // Najsłabszy punktowo / losowy z dołu wyższej ligi
    const higherClubs = clubsInLeague(state, higher.id)
    const victim =
      higherClubs.sort(
        (a, b) => getClub(a).strength - getClub(b).strength,
      )[0] ?? higherClubs[higherClubs.length - 1]
    if (victim) {
      state.clubLeagueIds[clubId] = higher.id
      state.clubLeagueIds[victim] = leagueId
      nextLeagueId = higher.id
    }
  } else if (lower) {
    const n = clubsInLeague(state, leagueId).length
    const relegatedSlots = league.tier === 1 ? 3 : 2
    if (place > n - relegatedSlots) {
      relegation = true
      const lowerClubs = clubsInLeague(state, lower.id)
      const promotee =
        lowerClubs.sort((a, b) => getClub(b).strength - getClub(a).strength)[0] ??
        lowerClubs[0]
      if (promotee) {
        state.clubLeagueIds[clubId] = lower.id
        state.clubLeagueIds[promotee] = leagueId
        nextLeagueId = lower.id
      }
    }
  }

  return { promotion, relegation, nextLeagueId }
}
