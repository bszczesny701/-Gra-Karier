import { getClub, LEAGUES } from '../data/clubs'
import type { CupPathStep, CupState, GameState, ScheduledMatch, SeasonState } from '../state/types'
import { cupRoundNames } from './cup'
import { chance } from './leagueSim'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Kluby zagraniczne do drabinki Europy. */
export function europaForeignPool(_state: GameState, excludeId: string): string[] {
  const foreign = LEAGUES.filter((l) => l.country !== 'PL').flatMap((l) => l.clubIds)
  return shuffle(foreign.filter((id) => id !== excludeId))
}

export function shouldCreateEuropa(state: GameState, playerClubId: string, leagueId: string): boolean {
  if (leagueId !== 'liga-1') return false
  if (state.manager?.europaQualified) return true
  const club = getClub(playerClubId)
  return (club.stars ?? 0) >= 3
}

/**
 * Europa lite: 8 drużyn (Ty + 7 zagranicznych), 3 rundy KO.
 * Mecze jako competition: 'europa', id `eu-rN-m*`.
 */
export function createEuropaState(
  state: GameState,
  playerClubId: string,
  leagueId: string,
  matches: Record<string, ScheduledMatch>,
): CupState | null {
  if (!shouldCreateEuropa(state, playerClubId, leagueId)) return null

  const foreigners = europaForeignPool(state, playerClubId).slice(0, 7)
  if (foreigners.length < 7) return null

  const entrants = shuffle([playerClubId, ...foreigners])
  const r0: string[] = []
  for (let i = 0; i + 1 < entrants.length; i += 2) {
    const id = `eu-r0-m${i / 2}`
    const flip = chance(0.5)
    const homeId = flip ? entrants[i]! : entrants[i + 1]!
    const awayId = flip ? entrants[i + 1]! : entrants[i]!
    matches[id] = {
      id,
      competition: 'europa',
      homeId,
      awayId,
      homeGoals: null,
      awayGoals: null,
      cupRound: 0,
    }
    r0.push(id)
  }

  const totalRounds = 3
  const names = cupRoundNames(totalRounds)
  const yourPath: CupPathStep[] = names.map((roundName) => ({
    roundName,
    opponentId: null,
    result: 'pending',
  }))
  const my = r0.map((id) => matches[id]!).find((m) => m.homeId === playerClubId || m.awayId === playerClubId)
  if (my) {
    yourPath[0]!.opponentId = my.homeId === playerClubId ? my.awayId : my.homeId
  }

  return {
    entrantIds: entrants,
    rounds: [r0],
    roundIndex: 0,
    eliminated: false,
    championId: null,
    yourPath,
    advancedIds: [],
    totalRounds,
    calendarWeekForRound: [],
  }
}

function winnerOf(m: ScheduledMatch): string | null {
  if (m.homeGoals == null || m.awayGoals == null) return null
  if (m.homeGoals === m.awayGoals) return null
  return m.homeGoals > m.awayGoals ? m.homeId : m.awayId
}

export function applyEuropaMatchResult(
  season: SeasonState,
  matchId: string,
  homeGoals: number,
  awayGoals: number,
): void {
  const cup = season.europa
  const m = season.matches[matchId]
  if (!cup || !m || m.competition !== 'europa') return

  m.homeGoals = homeGoals
  m.awayGoals = awayGoals
  const winId = winnerOf(m)
  if (!winId) return

  if (!cup.advancedIds.includes(winId)) cup.advancedIds.push(winId)

  const clubId = season.clubId
  const youPlayed = m.homeId === clubId || m.awayId === clubId
  if (youPlayed) {
    const step = cup.yourPath[m.cupRound ?? cup.roundIndex]
    if (step) {
      step.opponentId = m.homeId === clubId ? m.awayId : m.homeId
      step.result = winId === clubId ? 'won' : 'lost'
    }
    if (winId !== clubId) cup.eliminated = true
  }

  const roundMatches = cup.rounds[cup.roundIndex] ?? []
  const allDone = roundMatches.every((id) => {
    const x = season.matches[id]
    return x && x.homeGoals != null && x.awayGoals != null
  })
  if (allDone) advanceEuropaBracket(season)
}

function advanceEuropaBracket(season: SeasonState): void {
  const cup = season.europa
  if (!cup) return

  const winners = [...cup.advancedIds]
  cup.advancedIds = []

  if (winners.length <= 1) {
    cup.championId = winners[0] ?? null
    if (cup.championId === season.clubId) {
      const last = cup.yourPath[cup.yourPath.length - 1]
      if (last && last.result === 'pending') last.result = 'won'
    }
    return
  }

  const nextRound = cup.roundIndex + 1
  const paired = shuffle(winners)
  const matchIds: string[] = []

  for (let i = 0; i + 1 < paired.length; i += 2) {
    const id = `eu-r${nextRound}-m${i / 2}`
    const flip = chance(0.5)
    const homeId = flip ? paired[i]! : paired[i + 1]!
    const awayId = flip ? paired[i + 1]! : paired[i]!
    season.matches[id] = {
      id,
      competition: 'europa',
      homeId,
      awayId,
      homeGoals: null,
      awayGoals: null,
      cupRound: nextRound,
    }
    matchIds.push(id)
  }
  if (paired.length % 2 === 1) {
    cup.advancedIds.push(paired[paired.length - 1]!)
  }

  cup.rounds.push(matchIds)
  cup.roundIndex = nextRound

  const clubId = season.clubId
  const step = cup.yourPath[nextRound]
  if (step && !cup.eliminated) {
    const my = matchIds.map((id) => season.matches[id]!).find((m) => m.homeId === clubId || m.awayId === clubId)
    if (my) {
      step.opponentId = my.homeId === clubId ? my.awayId : my.homeId
      step.result = 'pending'
    } else if (cup.advancedIds.includes(clubId)) {
      step.opponentId = null
      step.result = 'bye'
    }
  }

  const weekIdx = cup.calendarWeekForRound[nextRound]
  if (weekIdx != null) {
    const week = season.calendar.weeks[weekIdx]
    if (week) {
      for (const id of matchIds) {
        if (!week.matchIds.includes(id)) week.matchIds.push(id)
      }
      const your = matchIds
        .map((id) => season.matches[id]!)
        .find((m) => m.homeId === clubId || m.awayId === clubId)
      if (your) {
        // Czwartek — nie koliduje ze Śr PP
        week.days[3] = { weekday: 3, activity: 'match', matchId: your.id }
      }
    }
  }
}

export function europaSummaryText(season: SeasonState): string | null {
  const cup = season.europa
  if (!cup) return null
  if (cup.championId === season.clubId) return 'Zdobywasz Puchar Europy!'
  if (cup.eliminated) {
    const lost = [...cup.yourPath].reverse().find((s) => s.result === 'lost')
    if (lost) {
      const opp = lost.opponentId ? getClub(lost.opponentId).name : 'rywalem'
      return `Odpadasz z Europy w rundzie: ${lost.roundName} (vs ${opp}).`
    }
    return 'Odpadasz z Pucharu Europy.'
  }
  if (cup.championId) {
    return `Puchar Europy zdobywa ${getClub(cup.championId).name}.`
  }
  return 'Puchar Europy w toku.'
}

export function updateEuropaQualification(state: GameState, place: number): void {
  const m = state.manager
  const season = state.season
  if (!m || !season) return
  const inTop = season.leagueId === 'liga-1' && place > 0 && place <= 6
  const wonPp = season.cup?.championId === season.clubId
  const wonEu = season.europa?.championId === season.clubId
  m.europaQualified = Boolean(inTop || wonPp || wonEu)
}
