import type { GameState } from '../state/types'
import {
  applyResultToStandings,
  nextRoundFixtures,
  simulateAiMatch,
  yourFixtureInRound,
} from './leagueSim'
import { createLiveMatch } from './liveMatch'

/** Kolejka: AI + start Twojego meczu live. */
export function beginMatchday(state: GameState): void {
  const season = state.season!
  const round = nextRoundFixtures(season)
  if (!round) {
    state.screen = 'hub'
    return
  }

  const yourFix = yourFixtureInRound(season, round)
  for (const f of round) {
    if (yourFix && f.homeId === yourFix.homeId && f.awayId === yourFix.awayId) continue
    const { homeGoals, awayGoals } = simulateAiMatch(f.homeId, f.awayId)
    applyResultToStandings(season.standings, f.homeId, f.awayId, homeGoals, awayGoals)
  }

  if (!yourFix) {
    season.roundIndex += 1
    if (season.roundIndex >= season.rounds.length) season.phase = 'done'
    state.screen = 'hub'
    return
  }

  state.liveMatch = createLiveMatch(state, yourFix)
  state.screen = 'liveMatch'
}
