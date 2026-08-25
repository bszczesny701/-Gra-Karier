import type {
  Formation,
  Position,
  SquadPlayer,
  TacticalStyle,
  Tactics,
  TeamState,
} from '../state/types'
import { formationSlots } from '../state/types'
import { starters } from './squadGen'

/** Bonus taktyczny względem siły przeciwnika (różnica stylów). */
export function styleMatchupBonus(style: TacticalStyle, opponentStrength: number, yourOvr: number): number {
  const gap = yourOvr - opponentStrength
  if (style === 'attack') {
    return gap >= -2 ? 2.2 : -1.2
  }
  if (style === 'defend') {
    return gap <= 2 ? 1.8 : -0.6
  }
  return 0.4
}

/** Jak dobrze XI pasuje do slotów formacji (0–1). */
export function formationFit(team: TeamState, formation: Formation = team.tactics.formation): number {
  const slots = formationSlots(formation)
  const xi = starters(team)
  if (xi.length < 11) return 0.55
  let score = 0
  for (let i = 0; i < 11; i++) {
    const slot = slots[i]!
    const p = xi[i]
    if (!p) continue
    if (p.position === slot) score += 1
    else if (softFit(p.position, slot)) score += 0.45
  }
  return score / 11
}

function softFit(pos: Position, slot: Position): boolean {
  if ((pos === 'POM' || pos === 'ŚO') && (slot === 'POM' || slot === 'ŚO')) return true
  if (pos === 'NP' && slot === 'POM') return true
  return false
}

export function lineupPower(team: TeamState, tactics: Tactics = team.tactics): number {
  const xi = starters(team)
  if (!xi.length) return 40
  const ovr =
    xi.reduce((s, p) => s + p.overall + (p.form - 50) * 0.12 + (p.fitness - 70) * 0.08, 0) /
    xi.length
  const fit = formationFit(team, tactics.formation)
  const chem = (team.teamChemistry - 50) * 0.06
  const styleBias =
    tactics.style === 'attack' ? 1.5 : tactics.style === 'defend' ? -0.5 : 0.4
  return ovr + (fit - 0.65) * 8 + chem + styleBias
}

export function validateLineup(team: TeamState): string | null {
  if (team.startingIds.length !== 11) return 'Potrzebujesz dokładnie 11 zawodników w składzie.'
  const set = new Set(team.startingIds)
  if (set.size !== 11) return 'Duplikaty w składzie.'
  for (const id of team.startingIds) {
    if (!team.squad.some((p) => p.id === id)) return 'Nieznany zawodnik w składzie.'
  }
  const unfit = team.squad.filter((p) => team.startingIds.includes(p.id) && p.fitness < 35)
  if (unfit.length >= 4) return 'Za wielu zmęczonych — daj odpocząć kilku.'
  return null
}

export function applyFormationDefaultOrder(team: TeamState): void {
  const slots = formationSlots(team.tactics.formation)
  const pool = [...team.squad]
  const used = new Set<string>()
  const next: string[] = []
  for (const slot of slots) {
    const ranked = pool
      .filter((p) => !used.has(p.id))
      .sort((a, b) => slotScore(b, slot) - slotScore(a, slot))
    const pick = ranked[0]
    if (pick) {
      used.add(pick.id)
      next.push(pick.id)
    }
  }
  team.startingIds = next
  team.benchIds = pool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 7)
    .map((p) => p.id)
}

function slotScore(p: SquadPlayer, slot: Position): number {
  let s = p.overall + (p.form - 50) / 4
  if (p.position === slot) s += 10
  else if (softFit(p.position, slot)) s += 3
  else s -= 14
  if (p.fitness < 50) s -= 8
  return s
}
