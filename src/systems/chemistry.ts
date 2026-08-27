import type { SquadPlayer, TeamState } from '../state/types'
import { clamp, formationPlan } from '../state/types'
import { formationFit, slotMismatch } from './tactics'
import { normalizeSquadPlayer, normalizeTeamSquad, starters } from './squadGen'

export function setCaptain(team: TeamState, playerId: string | null): void {
  normalizeTeamSquad(team)
  if (playerId && !team.squad.some((p) => p.id === playerId)) return
  team.captainId = playerId
  recomputeTeamChemistry(team)
}

export function ensureCaptain(team: TeamState): void {
  normalizeTeamSquad(team)
}

export function dressingRoomStatus(team: TeamState): {
  line: string
  unrest: SquadPlayer[]
  lowMorale: SquadPlayer[]
  captain: SquadPlayer | null
} {
  normalizeTeamSquad(team)
  const unrest = team.squad.filter((p) => p.wantsToLeave).sort((a, b) => b.overall - a.overall)
  const lowMorale = [...team.squad]
    .filter((p) => p.morale < 45)
    .sort((a, b) => a.morale - b.morale)
    .slice(0, 3)
  const captain = team.captainId ? team.squad.find((p) => p.id === team.captainId) ?? null : null
  let line = 'Szatnia spokojna'
  if (unrest.length >= 3) line = `Napięcie: ${unrest.length} zawodników chce odejść`
  else if (unrest.length === 1) line = `Napięcie: ${unrest[0]!.name.split(' ').pop()} chce odejść`
  else if (unrest.length === 2)
    line = `Napięcie: ${unrest.map((p) => p.name.split(' ').pop()).join(', ')} chcą odejść`
  else if (lowMorale.length >= 2) line = 'Morale części kadry spada'
  return { line, unrest, lowMorale, captain }
}

/** Przelicza chemię z XI, dopasowania, morale i kapitana. */
export function recomputeTeamChemistry(team: TeamState, postMatchImpulse = 0): number {
  normalizeTeamSquad(team)
  const xi = starters(team)
  const plan = formationPlan(team.tactics.formation)
  let score = 50 + postMatchImpulse

  score += (formationFit(team) - 0.7) * 25

  if (xi.length) {
    const avgMorale = xi.reduce((s, p) => s + p.morale, 0) / xi.length
    score += (avgMorale - 55) * 0.35
    let mismatches = 0
    let leavers = 0
    for (let i = 0; i < Math.min(xi.length, plan.length); i++) {
      const p = xi[i]!
      const slot = plan[i]!
      if (slotMismatch(p, slot)) mismatches++
      if (p.wantsToLeave) leavers++
    }
    score -= mismatches * 3.5
    score -= leavers * 5
  }

  if (team.captainId && team.startingIds.includes(team.captainId)) score += 5
  else if (team.captainId) score -= 2

  team.teamChemistry = clamp(Math.round(score), 20, 100)
  return team.teamChemistry
}

/** Lekki bonus/kara zaufania kibiców do chemii XI. */
export function applyFanTrustToChemistry(team: TeamState, fanTrust: number): void {
  const bonus = (fanTrust - 50) * 0.08
  team.teamChemistry = clamp(Math.round(team.teamChemistry + bonus), 20, 100)
}

export function playerSharpnessMod(p: SquadPlayer): number {
  normalizeSquadPlayer(p)
  return ((p.sharpness ?? 70) - 70) * 0.04
}
