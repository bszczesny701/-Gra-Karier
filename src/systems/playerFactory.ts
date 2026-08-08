import type { Attributes, Position } from '../state/types'
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

/**
 * Spadek atrybutów wraz z wiekiem (po urodzinach / przed nowym sezonem).
 * Tempo i kondycja najmocniej; od ~35 lat wyraźny regres.
 */
export function applyAgingDecline(player: {
  age: number
  position: Position
  attrs: Attributes
  overall: number
}): string | null {
  const a = player.age
  if (a < 28) return null

  const before = player.overall
  let pace = 0
  let stamina = 0
  let shooting = 0
  let passing = 0
  let defending = 0

  if (a >= 35) {
    pace = 2 + (Math.random() < 0.55 ? 1 : 0)
    stamina = 2 + (Math.random() < 0.4 ? 1 : 0)
    shooting = Math.random() < 0.55 ? 1 : 0
    passing = Math.random() < 0.35 ? 1 : 0
    defending = Math.random() < 0.3 ? 1 : 0
  } else if (a >= 33) {
    pace = 1 + (Math.random() < 0.55 ? 1 : 0)
    stamina = 1 + (Math.random() < 0.45 ? 1 : 0)
    shooting = Math.random() < 0.35 ? 1 : 0
    passing = Math.random() < 0.2 ? 1 : 0
  } else if (a >= 30) {
    pace = Math.random() < 0.75 ? 1 : 0
    stamina = Math.random() < 0.55 ? 1 : 0
    shooting = Math.random() < 0.2 ? 1 : 0
  } else {
    // 28–29: lekki start regresu
    stamina = Math.random() < 0.45 ? 1 : 0
    pace = Math.random() < 0.25 ? 1 : 0
  }

  if (pace + stamina + shooting + passing + defending === 0) return null

  player.attrs.pace = clamp(player.attrs.pace - pace)
  player.attrs.stamina = clamp(player.attrs.stamina - stamina)
  player.attrs.shooting = clamp(player.attrs.shooting - shooting)
  player.attrs.passing = clamp(player.attrs.passing - passing)
  player.attrs.defending = clamp(player.attrs.defending - defending)
  player.overall = calcOverall(player.attrs, player.position)

  const drop = before - player.overall
  const bits: string[] = []
  if (pace) bits.push(`tempo −${pace}`)
  if (stamina) bits.push(`kondycja −${stamina}`)
  if (shooting) bits.push(`strzał −${shooting}`)
  if (passing) bits.push(`podanie −${passing}`)
  if (defending) bits.push(`obrona −${defending}`)
  return `Wiek ${a}: ${bits.join(', ')}${drop > 0 ? ` (OVR −${drop})` : ''}.`
}
