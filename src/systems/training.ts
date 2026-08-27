import type { GameState, TrainingFocus } from '../state/types'
import { clamp } from '../state/types'
import { calcOverall } from './playerFactory'
import { normalizeSquadPlayer, normalizeTeamSquad } from './squadGen'
import { currentWeek } from './calendar'
import { rngInt } from './leagueSim'

export const TRAINING_FOCUSES: TrainingFocus[] = [
  'balanced',
  'pace',
  'shooting',
  'passing',
  'defending',
  'stamina',
]

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  balanced: 'Zrównoważony',
  pace: 'Tempo',
  shooting: 'Strzały',
  passing: 'Podania',
  defending: 'Obrona',
  stamina: 'Kondycja',
}

export function setTrainingFocus(state: GameState, focus: TrainingFocus): void {
  const team = state.team
  if (!team) return
  team.trainingFocus = focus
}

export function cycleTrainingFocus(state: GameState): TrainingFocus {
  const team = state.team!
  normalizeTeamSquad(team)
  const i = TRAINING_FOCUSES.indexOf(team.trainingFocus)
  const next = TRAINING_FOCUSES[(i + 1) % TRAINING_FOCUSES.length]!
  team.trainingFocus = next
  return next
}

/** Zastosuj trening z bieżącego (kończonego) tygodnia — wywołać PRZED weekIndex++. */
export function applyWeekTraining(state: GameState): void {
  const team = state.team
  const season = state.season
  if (!team || !season?.calendar) return
  normalizeTeamSquad(team)

  const week = currentWeek(season)
  if (!week) return
  const trainDays = week.days.filter((d) => d.activity === 'training').length
  const restDays = week.days.filter((d) => d.activity === 'rest').length
  const focus = team.trainingFocus || 'balanced'

  for (const p of team.squad) {
    normalizeSquadPlayer(p)
    if ((p.injuryMatchesLeft ?? 0) > 0) {
      p.sharpness = clamp(p.sharpness - 1, 0, 100)
      continue
    }

    if (trainDays > 0) {
      const sharpGain = (4 + rngInt(5)) * trainDays
      p.sharpness = clamp(p.sharpness + sharpGain, 0, 100)

      const ageMod = p.age <= 22 ? 1.35 : p.age <= 27 ? 1 : p.age <= 31 ? 0.55 : 0.25
      const room = Math.max(0, p.potential - p.overall)
      const potMod = room > 0 ? 1 : 0.15
      const growChance = clamp(0.35 * ageMod * potMod * trainDays, 0.08, 0.95)

      if (Math.random() < growChance && p.overall < p.potential) {
        const keys =
          focus === 'balanced'
            ? (['pace', 'shooting', 'passing', 'defending', 'stamina'] as const)
            : ([focus] as const)
        const key = keys[rngInt(keys.length)]!
        p.attrs[key] = clamp(p.attrs[key] + 1, 1, 99)
        p.overall = Math.min(p.potential, calcOverall(p.attrs, p.position))
      }

      const fitnessHit =
        focus === 'stamina' ? 1 + rngInt(2) : focus === 'balanced' ? 1 + rngInt(2) : 2 + rngInt(2)
      p.fitness = clamp(p.fitness - fitnessHit * Math.max(1, Math.floor(trainDays / 2)), 20, 100)
    } else if (restDays >= 4) {
      p.sharpness = clamp(p.sharpness - (2 + rngInt(3)), 25, 100)
      p.fitness = clamp(p.fitness + 3 + rngInt(4), 20, 100)
    }
  }
}
