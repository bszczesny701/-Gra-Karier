import type {
  Formation,
  FormationSlot,
  Position,
  SquadPlayer,
  TacticalStyle,
  Tactics,
  TeamState,
} from '../state/types'
import { formationPlan } from '../state/types'
import { pickDefaultLineup, starters } from './squadGen'

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

function softFit(pos: Position, slot: Position): boolean {
  if ((pos === 'POM' || pos === 'ŚO') && (slot === 'POM' || slot === 'ŚO')) return true
  if (pos === 'NP' && slot === 'POM') return true
  return false
}

/** Jak dobrze XI pasuje do slotów formacji (0–1). */
export function formationFit(team: TeamState, formation: Formation = team.tactics.formation): number {
  const plan = formationPlan(formation)
  const xi = starters(team)
  if (xi.length < 11) return 0.55
  let score = 0
  for (let i = 0; i < 11; i++) {
    const slot = plan[i]!
    const p = xi[i]
    if (!p) continue
    if (p.role === slot.role) score += 1
    else if (p.position === slot.base) score += 0.7
    else if (softFit(p.position, slot.base)) score += 0.4
  }
  return score / 11
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
  const width = tactics.width ?? 2
  const press = tactics.press ?? 2
  const tempo = tactics.tempo ?? 2
  const axisBias = (width - 2) * 0.35 + (press - 2) * 0.2 + (tempo - 2) * 0.4
  return ovr + (fit - 0.65) * 8 + chem + styleBias + axisBias
}

export function validateLineup(team: TeamState): string | null {
  if (team.startingIds.length !== 11) return 'Potrzebujesz dokładnie 11 zawodników w składzie.'
  const set = new Set(team.startingIds)
  if (set.size !== 11) return 'Duplikaty w składzie.'
  for (const id of team.startingIds) {
    const p = team.squad.find((x) => x.id === id)
    if (!p) return 'Nieznany zawodnik w składzie.'
    if ((p.injuryMatchesLeft ?? 0) > 0) return `${p.name.split(' ').pop()} jest kontuzjowany.`
    if ((p.suspensionMatchesLeft ?? 0) > 0) return `${p.name.split(' ').pop()} jest zawieszony.`
  }
  const unfit = team.squad.filter((p) => team.startingIds.includes(p.id) && p.fitness < 35)
  if (unfit.length >= 4) return 'Za wielu zmęczonych — daj odpocząć kilku.'
  return null
}

export function applyFormationDefaultOrder(team: TeamState): void {
  const plan = formationPlan(team.tactics.formation)
  const picked = pickDefaultLineup(team.squad, plan)
  team.startingIds = picked.startingIds
  team.benchIds = picked.benchIds
}

export function slotMismatch(p: SquadPlayer, slot: FormationSlot): boolean {
  return p.role !== slot.role && p.position !== slot.base
}
