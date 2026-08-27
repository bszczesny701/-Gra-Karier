import type { Attributes, GameState, SquadPlayer, TrainingFocus } from '../state/types'
import { clamp } from '../state/types'
import { calcOverall } from './playerFactory'
import { normalizeSquadPlayer, normalizeTeamSquad } from './squadGen'
import { currentWeek } from './calendar'
import { rngInt } from './leagueSim'

export type { TrainingFocus }

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

export type DrillId =
  | 'shooting'
  | 'passing'
  | 'defending'
  | 'pace'
  | 'stamina'
  | 'technique'
  | 'gk'

export const DRILLS: Array<{ id: DrillId; label: string; hint: string }> = [
  { id: 'shooting', label: 'Strzały', hint: 'Finishing / strzał' },
  { id: 'passing', label: 'Podania', hint: 'Podania / wizja' },
  { id: 'defending', label: 'Obrona', hint: 'Odbiór / ustawienie' },
  { id: 'pace', label: 'Sprinty', hint: 'Tempo / przyspieszenie' },
  { id: 'stamina', label: 'Kondycja', hint: 'Wytrzymałość' },
  { id: 'technique', label: 'Technika', hint: 'Podania + strzał' },
  { id: 'gk', label: 'Bramkarz', hint: 'Refleks / pozycja (BR)' },
]

export type TrainingGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface TrainingSlot {
  playerId: string
  drill: DrillId
}

export interface TrainingSlotResult {
  playerId: string
  playerName: string
  drill: DrillId
  grade: TrainingGrade
  gains: Partial<Record<keyof Attributes, number>>
  overallBefore: number
  overallAfter: number
}

const GRADE_WEIGHTS: Array<{ g: TrainingGrade; w: number }> = [
  { g: 'A', w: 8 },
  { g: 'B', w: 16 },
  { g: 'C', w: 28 },
  { g: 'D', w: 24 },
  { g: 'E', w: 14 },
  { g: 'F', w: 10 },
]

const TRAINING_COOLDOWN_DAYS = 5

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

export function absoluteSeasonDay(state: GameState): number {
  const season = state.season
  if (!season?.calendar) return 0
  const w = currentWeek(season)
  const weekday = w?.days.find((d) => d.activity === 'match')?.weekday ?? 0
  return season.year * 500 + season.calendar.weekIndex * 7 + weekday
}

export function daysUntilTraining(state: GameState): number {
  const team = state.team
  if (!team) return TRAINING_COOLDOWN_DAYS
  if (team.lastTrainingDay == null) return 0
  const elapsed = absoluteSeasonDay(state) - team.lastTrainingDay
  return Math.max(0, TRAINING_COOLDOWN_DAYS - elapsed)
}

export function canRunTraining(state: GameState): string | null {
  if (!state.team || !state.season || state.season.phase !== 'playing') {
    return 'Trening niedostępny'
  }
  const left = daysUntilTraining(state)
  if (left > 0) return `Następny trening za ${left} ${left === 1 ? 'dzień' : 'dni'}`
  return null
}

function rollGrade(): TrainingGrade {
  const total = GRADE_WEIGHTS.reduce((s, x) => s + x.w, 0)
  let r = Math.random() * total
  for (const { g, w } of GRADE_WEIGHTS) {
    r -= w
    if (r <= 0) return g
  }
  return 'C'
}

function drillAttrs(drill: DrillId, role: string): (keyof Attributes)[] {
  if (drill === 'gk' || role === 'BR') return ['defending', 'stamina', 'passing']
  if (drill === 'shooting') return ['shooting']
  if (drill === 'passing') return ['passing']
  if (drill === 'defending') return ['defending']
  if (drill === 'pace') return ['pace']
  if (drill === 'stamina') return ['stamina']
  return ['passing', 'shooting']
}

function gradePoints(grade: TrainingGrade): number {
  if (grade === 'A') return 3
  if (grade === 'B') return 2
  if (grade === 'C') return 1
  if (grade === 'D') return Math.random() < 0.55 ? 1 : 0
  return 0
}

function applySlotGrowth(p: SquadPlayer, drill: DrillId, grade: TrainingGrade): TrainingSlotResult {
  normalizeSquadPlayer(p)
  const overallBefore = p.overall
  const gains: Partial<Record<keyof Attributes, number>> = {}
  const keys = drillAttrs(drill, p.role)
  let points = gradePoints(grade)

  const ageMod = p.age <= 22 ? 1.2 : p.age <= 28 ? 1 : p.age <= 32 ? 0.65 : 0.35
  if (ageMod < 1 && Math.random() > ageMod) points = Math.max(0, points - 1)

  while (points > 0 && keys.length) {
    const key = keys[rngInt(keys.length)]!
    if (p.attrs[key] >= 99) {
      points--
      continue
    }
    p.attrs[key] = clamp(p.attrs[key] + 1, 1, 99)
    gains[key] = (gains[key] ?? 0) + 1
    points--
  }

  let nextOvr = calcOverall(p.attrs, p.position)
  nextOvr = Math.min(p.potential, nextOvr)
  if (grade === 'A' && nextOvr <= p.overall && p.overall < p.potential && Math.random() < 0.55) {
    const boostKey = keys[0] ?? 'stamina'
    p.attrs[boostKey] = clamp(p.attrs[boostKey] + 1, 1, 99)
    gains[boostKey] = (gains[boostKey] ?? 0) + 1
    nextOvr = Math.min(p.potential, calcOverall(p.attrs, p.position))
  }
  p.overall = nextOvr

  const sharpGain = grade === 'A' ? 10 : grade === 'B' ? 7 : grade === 'C' ? 4 : grade === 'D' ? 2 : 0
  p.sharpness = clamp((p.sharpness ?? 70) + sharpGain, 0, 100)
  p.fitness = clamp(p.fitness - (grade === 'F' ? 4 : grade === 'E' ? 3 : 2), 20, 100)

  return {
    playerId: p.id,
    playerName: p.name,
    drill,
    grade,
    gains,
    overallBefore,
    overallAfter: p.overall,
  }
}

/** Sesja FIFA-style: dokładnie 5 slotów (ten sam zawodnik może wrócić). */
export function runTrainingSession(
  state: GameState,
  slots: TrainingSlot[],
): { error: string | null; results: TrainingSlotResult[] } {
  const gate = canRunTraining(state)
  if (gate) return { error: gate, results: [] }
  const team = state.team!
  normalizeTeamSquad(team)

  if (slots.length !== 5) return { error: 'Wybierz dokładnie 5 ćwiczeń', results: [] }

  const results: TrainingSlotResult[] = []
  for (const slot of slots) {
    const p = team.squad.find((x) => x.id === slot.playerId)
    if (!p) return { error: 'Nieznany zawodnik w slocie', results: [] }
    if ((p.injuryMatchesLeft ?? 0) > 0) {
      return { error: `${p.name.split(' ').pop()} jest kontuzjowany`, results: [] }
    }
    const grade = rollGrade()
    results.push(applySlotGrowth(p, slot.drill, grade))
  }

  team.lastTrainingDay = absoluteSeasonDay(state)
  return { error: null, results }
}

/** Lekka regeneracja sharpness w tygodniu — bez wzrostu atrybutów (to robi sesja FIFA). */
export function applyWeekTraining(state: GameState): void {
  const team = state.team
  const season = state.season
  if (!team || !season?.calendar) return
  normalizeTeamSquad(team)

  const week = currentWeek(season)
  if (!week) return
  const trainDays = week.days.filter((d) => d.activity === 'training').length
  const restDays = week.days.filter((d) => d.activity === 'rest').length

  for (const p of team.squad) {
    normalizeSquadPlayer(p)
    if ((p.injuryMatchesLeft ?? 0) > 0) {
      p.sharpness = clamp(p.sharpness - 1, 0, 100)
      continue
    }
    if (trainDays > 0) {
      p.sharpness = clamp(p.sharpness + 2 * trainDays, 0, 100)
      p.fitness = clamp(p.fitness - trainDays, 20, 100)
    } else if (restDays >= 4) {
      p.fitness = clamp(p.fitness + 2 + rngInt(3), 20, 100)
    }
  }
}

export function gradeColorClass(grade: TrainingGrade): string {
  if (grade === 'A') return 'grade-a'
  if (grade === 'B') return 'grade-b'
  if (grade === 'C') return 'grade-c'
  if (grade === 'D') return 'grade-d'
  if (grade === 'E') return 'grade-e'
  return 'grade-f'
}
