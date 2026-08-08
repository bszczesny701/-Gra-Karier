import type { Attributes, BallTrainResult, Position, PreferredFoot } from '../state/types'
import { clamp } from '../state/types'

const PROFILES: Record<Position, Attributes> = {
  NP: { pace: 1.08, shooting: 1.18, passing: 0.88, defending: 0.62, stamina: 1.0 },
  POM: { pace: 0.98, shooting: 1.0, passing: 1.15, defending: 0.85, stamina: 1.05 },
  ŚO: { pace: 0.95, shooting: 0.9, passing: 1.08, defending: 1.05, stamina: 1.08 },
  OB: { pace: 1.0, shooting: 0.6, passing: 0.9, defending: 1.2, stamina: 1.05 },
}

/** Buduje atrybuty wokół wybranego overall i pozycji. */
export function attrsFromOverall(position: Position, overall: number): Attributes {
  const profile = PROFILES[position]
  const raw = {
    pace: overall * profile.pace,
    shooting: overall * profile.shooting,
    passing: overall * profile.passing,
    defending: overall * profile.defending,
    stamina: overall * profile.stamina,
  }
  const avg =
    (raw.pace + raw.shooting + raw.passing + raw.defending + raw.stamina) / 5
  const scale = overall / avg
  return {
    pace: clamp(raw.pace * scale),
    shooting: clamp(raw.shooting * scale),
    passing: clamp(raw.passing * scale),
    defending: clamp(raw.defending * scale),
    stamina: clamp(raw.stamina * scale),
  }
}

export function calcOverall(attrs: Attributes, position: Position): number {
  const w = PROFILES[position]
  const sumW = w.pace + w.shooting + w.passing + w.defending + w.stamina
  const score =
    (attrs.pace * w.pace +
      attrs.shooting * w.shooting +
      attrs.passing * w.passing +
      attrs.defending * w.defending +
      attrs.stamina * w.stamina) /
    sumW
  return clamp(score, 1, 99)
}

export function moneyFromStart(overall: number, clubWage: number): number {
  return Math.round(300 + overall * 8 + clubWage * 0.4)
}

export function reputationFromStart(overall: number, leagueTier: number): number {
  const tierBonus = leagueTier === 2 ? 8 : leagueTier === 1 ? 15 : 0
  return clamp(5 + (overall - 45) + tierBonus, 0, 40)
}

export function applyBallTrainRewards(
  attrs: Attributes,
  form: number,
  morale: number,
  result: BallTrainResult,
  foot: PreferredFoot,
): { attrs: Attributes; form: number; morale: number; summary: string } {
  const quality = result.avgScore
  let formGain = quality >= 80 ? 4 : quality >= 60 ? 2 : quality >= 40 ? 1 : -1
  let moraleGain = quality >= 70 ? 2 : quality >= 40 ? 1 : -1
  const skillGain = quality >= 75 ? 1 : 0

  const next = { ...attrs }
  if (skillGain) {
    if (foot === 'left' || foot === 'both') next.passing = clamp(next.passing + 1)
    if (foot === 'right' || foot === 'both') next.shooting = clamp(next.shooting + 1)
    if (foot === 'both') next.pace = clamp(next.pace + 1)
    else next.stamina = clamp(next.stamina + 1)
  }

  const summary =
    quality >= 80
      ? `Świetny trening z piłką (${Math.round(quality)}%). Forma w górę.`
      : quality >= 50
        ? `Solidny trening (${Math.round(quality)}%).`
        : `Słaby trening (${Math.round(quality)}%). Trzeba poprawić kontrolę.`

  return {
    attrs: next,
    form: clamp(form + formGain, 1, 100),
    morale: clamp(morale + moraleGain, 1, 100),
    summary,
  }
}
