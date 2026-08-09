import type { FormLabel, Position } from '../state/types'
import { clamp } from '../state/types'

export interface SeasonDevInput {
  age: number
  overallBefore: number
  position: Position
  goals: number
  assists: number
  leagueApps: number
  fixturesForPlayer: number
  avgRating: number
  matchesMissedInjury: number
  seriousInjury: boolean
  clubStrength: number
}

export interface SeasonDevResult {
  avgForm: number
  formLabel: FormLabel
  ovrDelta: number
}

/**
 * Forma sezonu: minuty + ocena + G/A, los tylko ±3.
 * Progi stałe — bez „im wyższy OVR, tym trudniej o dobrą formę”.
 */
export function resolveSeasonForm(input: SeasonDevInput): { avgForm: number; formLabel: FormLabel } {
  const {
    position,
    goals,
    assists,
    leagueApps,
    fixturesForPlayer,
    avgRating,
    matchesMissedInjury,
    seriousInjury,
  } = input

  const fixtures = Math.max(1, fixturesForPlayer)
  const appRate = leagueApps / fixtures
  const rating = leagueApps > 0 ? avgRating : 0

  let score = 48

  if (appRate >= 0.7) score += 14
  else if (appRate >= 0.55) score += 10
  else if (appRate >= 0.4) score += 5
  else if (appRate < 0.15) score -= 12
  else if (appRate < 0.3) score -= 6

  if (rating >= 7.3) score += 14
  else if (rating >= 7.0) score += 10
  else if (rating >= 6.7) score += 6
  else if (rating >= 6.4) score += 2
  else if (rating > 0 && rating < 5.8) score -= 10
  else if (rating > 0 && rating < 6.3) score -= 5

  if (position === 'NP') {
    if (goals >= 12) score += 10
    else if (goals >= 8) score += 6
    else if (goals >= 4) score += 3
    else if (goals === 0 && leagueApps >= 12) score -= 6
  } else if (position === 'POM') {
    const contrib = goals + assists
    if (contrib >= 12) score += 10
    else if (contrib >= 7) score += 6
    else if (contrib >= 4) score += 3
    else if (contrib === 0 && leagueApps >= 14) score -= 5
  } else if (rating >= 7.0 && appRate >= 0.55) {
    score += 5
  }

  if (seriousInjury) score -= 10
  else if (matchesMissedInjury >= fixtures * 0.35) score -= 8
  else if (matchesMissedInjury >= 3) score -= 4

  // Jedyny los: ±3
  score += Math.floor(Math.random() * 7) - 3
  const avgForm = clamp(score, 18, 94)

  let formLabel: FormLabel
  if (avgForm >= 72) formLabel = 'świetna'
  else if (avgForm >= 58) formLabel = 'dobra'
  else if (avgForm >= 45) formLabel = 'przyzwoita'
  else if (avgForm >= 32) formLabel = 'słaba'
  else formLabel = 'fatalna'

  // Ocena nie pozwala na sztucznie świetną formę
  if (rating > 0) {
    if (rating < 6.4 && (formLabel === 'świetna' || formLabel === 'dobra')) formLabel = 'przyzwoita'
    else if (rating < 6.8 && formLabel === 'świetna') formLabel = 'dobra'
  }

  return { avgForm, formLabel }
}

/**
 * Rozwój OVR — deterministyczny.
 * Tor: ~45→60 w 3–4 sezony, potem 60→70 w kolejnych 2–3 przy minutach (młody).
 */
export function resolveSeasonOvrDelta(
  input: SeasonDevInput,
  formLabel: FormLabel,
): number {
  const { age, overallBefore, leagueApps, fixturesForPlayer, avgRating, matchesMissedInjury, seriousInjury, clubStrength } =
    input

  const fixtures = Math.max(1, fixturesForPlayer)
  const appRate = leagueApps / fixtures
  const rating = leagueApps > 0 ? avgRating : 0
  const young = age <= 25
  const veryYoung = age <= 21
  const climbing = overallBefore < 70
  const early = overallBefore <= 55
  const midClimb = overallBefore >= 55 && overallBefore < 70

  let delta = 0
  if (formLabel === 'świetna') delta = young ? 3 : 1
  else if (formLabel === 'dobra') delta = young ? 2 : 1
  else if (formLabel === 'przyzwoita') delta = young ? 1 : 0
  else if (formLabel === 'słaba') delta = young ? 0 : -1
  else delta = -2

  // Minuty = główny motor wzrostu
  if (young && delta >= 0) {
    if (appRate >= 0.65) delta += early ? 2 : midClimb ? 2 : climbing ? 1 : veryYoung ? 1 : 0
    else if (appRate >= 0.5) delta += early || midClimb ? 1 : 0
    else if (appRate < 0.25) {
      delta = Math.min(delta, 0)
      if (appRate < 0.15) delta -= 1
    }
  } else if (!young && appRate < 0.2 && delta >= 0) {
    delta = Math.min(delta, 0)
  }

  // Dobre oceny przyspieszają drogę do 70
  if (young && climbing && rating >= 6.8 && appRate >= 0.4 && delta >= 0) delta += 1
  if (young && climbing && rating >= 7.2 && appRate >= 0.5 && delta >= 0) delta += 1
  if (young && midClimb && formLabel === 'świetna' && appRate >= 0.55) delta += 1

  // Lepszy klub: stały +1 przy minutach
  if (young && formLabel !== 'fatalna' && formLabel !== 'słaba' && appRate >= 0.4) {
    if (clubStrength >= 78) delta += 1
    else if (clubStrength >= 68 && (early || appRate >= 0.55)) delta += 1
    else if (clubStrength >= 58 && early && appRate >= 0.6 && formLabel === 'świetna') delta += 1
  }

  if (rating > 0 && rating < 6.3 && delta > 0) delta -= 1
  if (seriousInjury || matchesMissedInjury >= fixtures * 0.45) delta -= 1

  // Sufity — do 70 wciąż realny wzrost; potem zwalnia
  if (overallBefore >= 60 && overallBefore < 70) delta = Math.min(delta, young ? 4 : 2)
  if (overallBefore >= 70 && overallBefore < 78) delta = Math.min(delta, young ? 3 : 1)
  if (overallBefore >= 78 && overallBefore < 85) delta = Math.min(delta, young ? 2 : 1)
  if (overallBefore >= 85) delta = Math.min(delta, 1)

  const maxUp =
    veryYoung && early
      ? 5
      : young && climbing
        ? 4
        : young
          ? 3
          : age <= 28
            ? 2
            : 1
  const maxDown = age <= 28 ? -2 : age <= 33 ? -3 : -4

  return Math.max(maxDown, Math.min(maxUp, Math.round(delta)))
}

export function computeSeasonDevelopment(input: SeasonDevInput): SeasonDevResult {
  const { avgForm, formLabel } = resolveSeasonForm(input)
  const ovrDelta = resolveSeasonOvrDelta(input, formLabel)
  return { avgForm, formLabel, ovrDelta }
}
