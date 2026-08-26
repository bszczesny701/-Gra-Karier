import type { GameState, ScheduledMatch } from '../state/types'
import { canAdvanceWeek, currentWeek, nextUserMatch } from './calendar'
import { applyCupMatchResult, simulateCupScore } from './cup'
import {
  applyResultToStandings,
  nextRoundFixtures,
  simulateAiMatch,
  yourFixtureInRound,
} from './leagueSim'
import { createLiveMatch } from './liveMatch'
import { publishRoundNews } from './news'

export { canAdvanceWeek, nextUserMatch }

function syncLeagueRoundProgress(season: GameState['season']): void {
  if (!season) return
  let completed = 0
  for (let li = 0; li < season.rounds.length; li++) {
    const ids = Object.values(season.matches).filter((m) => m.competition === 'league' && m.leagueRound === li)
    if (!ids.length) break
    if (ids.every((m) => m.homeGoals != null)) completed = li + 1
    else break
  }
  season.roundIndex = completed
}

function resolveScheduledAi(state: GameState, m: ScheduledMatch): void {
  if (m.homeGoals != null) return
  if (m.competition === 'cup') {
    const { homeGoals, awayGoals } = simulateCupScore(m.homeId, m.awayId)
    applyCupMatchResult(state.season!, m.id, homeGoals, awayGoals)
    return
  }
  const { homeGoals, awayGoals } = simulateAiMatch(m.homeId, m.awayId)
  m.homeGoals = homeGoals
  m.awayGoals = awayGoals
  applyResultToStandings(state.season!.standings, m.homeId, m.awayId, homeGoals, awayGoals)
}

/** Symuluj pozostałe AI mecze tygodnia (poza wybranym meczem użytkownika). */
function simOtherMatchesInWeek(state: GameState, exceptMatchId: string | null): void {
  const season = state.season!
  const week = currentWeek(season)
  if (!week) return
  const clubId = season.clubId
  const aiResults: Array<{ homeId: string; awayId: string; homeGoals: number; awayGoals: number }> =
    []

  for (const id of week.matchIds) {
    if (exceptMatchId && id === exceptMatchId) continue
    const m = season.matches[id]
    if (!m || m.homeGoals != null) continue
    if (m.homeId === clubId || m.awayId === clubId) continue
    resolveScheduledAi(state, m)
    if (m.competition === 'league' && m.homeGoals != null && m.awayGoals != null) {
      aiResults.push({
        homeId: m.homeId,
        awayId: m.awayId,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      })
    }
  }
  if (aiResults.length) publishRoundNews(state, aiResults)
  syncLeagueRoundProgress(season)
}

/**
 * Start meczu użytkownika (liga lub puchar).
 * Domyślnie bierze najbliższy z bieżącego tygodnia.
 */
export function beginScheduledMatch(state: GameState, matchId?: string): void {
  const season = state.season!
  if (!season.calendar?.weeks?.length) {
    beginMatchdayLegacy(state)
    return
  }

  const target = matchId ? season.matches[matchId] : nextUserMatch(season)
  if (!target || target.homeGoals != null) {
    state.screen = 'hub'
    return
  }
  if (target.homeId !== season.clubId && target.awayId !== season.clubId) {
    state.screen = 'hub'
    return
  }

  simOtherMatchesInWeek(state, target.id)
  state.liveMatch = createLiveMatch(state, target, target.id, target.competition)
  state.screen = 'liveMatch'
}

/** Przejście do następnego tygodnia (wymaga braku Twoich meczów). */
export function advanceWeek(state: GameState): string | null {
  const season = state.season!
  if (!season.calendar?.weeks?.length) return 'Brak kalendarza'
  if (season.phase !== 'playing') return 'Sezon zakończony'
  if (nextUserMatch(season)) return 'Najpierw rozegraj swój mecz w tym tygodniu'

  simOtherMatchesInWeek(state, null)
  season.calendar.weekIndex += 1

  if (season.calendar.weekIndex >= season.calendar.weeks.length) {
    season.phase = 'done'
    season.roundIndex = season.rounds.length
  } else {
    syncLeagueRoundProgress(season)
  }
  state.screen = 'hub'
  return null
}

/** Stary flow kolejkowy — fallback gdy brak kalendarza. */
function beginMatchdayLegacy(state: GameState): void {
  const season = state.season!
  const round = nextRoundFixtures(season)
  if (!round) {
    state.screen = 'hub'
    return
  }

  const yourFix = yourFixtureInRound(season, round)
  const aiResults: Array<{ homeId: string; awayId: string; homeGoals: number; awayGoals: number }> =
    []
  for (const f of round) {
    if (yourFix && f.homeId === yourFix.homeId && f.awayId === yourFix.awayId) continue
    const { homeGoals, awayGoals } = simulateAiMatch(f.homeId, f.awayId)
    applyResultToStandings(season.standings, f.homeId, f.awayId, homeGoals, awayGoals)
    aiResults.push({ homeId: f.homeId, awayId: f.awayId, homeGoals, awayGoals })
  }
  publishRoundNews(state, aiResults)

  if (!yourFix) {
    season.roundIndex += 1
    if (season.roundIndex >= season.rounds.length) season.phase = 'done'
    state.screen = 'hub'
    return
  }

  state.liveMatch = createLiveMatch(state, yourFix, null, 'league')
  state.screen = 'liveMatch'
}

/** Kolejka: AI + start Twojego meczu live. */
export function beginMatchday(state: GameState): void {
  beginScheduledMatch(state)
}
