import { getLeague } from '../data/clubs'
import type { GameState, SquadPlayer, TeamState } from '../state/types'
import { clamp } from '../state/types'
import { pushLog } from '../state/gameState'
import { normalizeSquadPlayer } from './squadGen'

export function playerMarketValue(p: SquadPlayer): number {
  normalizeSquadPlayer(p)
  const ageMod = p.age <= 23 ? 1.35 : p.age <= 28 ? 1.15 : p.age <= 32 ? 0.9 : 0.55
  const roleMod = p.role === 'BR' ? 0.85 : p.role === 'ŚN' || p.role === 'PN' || p.role === 'LN' ? 1.15 : 1
  const potGap = Math.max(0, (p.potential ?? p.overall) - p.overall)
  const potMod = p.age <= 24 ? 1 + potGap * 0.035 : 1 + potGap * 0.015
  return Math.max(50_000, Math.round(p.overall * p.overall * 420 * ageMod * roleMod * potMod))
}

export function expectedWage(p: SquadPlayer): number {
  normalizeSquadPlayer(p)
  const base = Math.round(600 + p.overall * p.overall * 1.6)
  return p.wantsToLeave ? Math.round(base * 1.2) : base
}

export function weeklyWageBill(team: TeamState): number {
  return team.squad
    .filter((p) => !p.loanToClubId)
    .reduce((s, p) => s + (normalizeSquadPlayer(p).wage || 0), 0)
}

export function wageRoom(team: TeamState): number {
  normalizeTeamFinance(team)
  return Math.max(0, team.wageBudget - weeklyWageBill(team))
}

export function canAffordFee(team: TeamState, fee: number): boolean {
  normalizeTeamFinance(team)
  return team.transferBudget >= fee
}

/** Opłata z budżetu transferowego; pensja z limitu płac (FIFA). */
export function canAffordTransfer(
  team: TeamState,
  fee: number,
  newWage: number,
  replacingWage = 0,
): string | null {
  normalizeTeamFinance(team)
  if (fee > team.transferBudget) return 'Za mały budżet transferowy'
  const bill = weeklyWageBill(team) - replacingWage + newWage
  if (bill > team.wageBudget) {
    return `Za mały budżet płac (masa ${Math.round(bill).toLocaleString('pl-PL')} / limit ${Math.round(team.wageBudget).toLocaleString('pl-PL')} /tyg.)`
  }
  return null
}

export function canAffordWageIncrease(team: TeamState, oldWage: number, newWage: number): string | null {
  normalizeTeamFinance(team)
  const delta = Math.max(0, newWage - oldWage)
  if (delta <= 0) return null
  if (weeklyWageBill(team) + delta > team.wageBudget) {
    return `Za mały budżet płac (wolne ${wageRoom(team).toLocaleString('pl-PL')} /tyg.)`
  }
  return null
}

/** Zmiana budżetu transferowego (+ nagrody / sprzedaże / kupna). */
export function applyBudgetDelta(state: GameState, amount: number, reason: string): void {
  const team = state.team
  if (!team) return
  normalizeTeamFinance(team)
  team.transferBudget = Math.max(0, Math.round(team.transferBudget + amount))
  if (amount >= 0) team.seasonIncome += amount
  else team.seasonExpense += -amount
  pushLog(
    state,
    `${reason}: ${amount >= 0 ? '+' : ''}${Math.round(amount).toLocaleString('pl-PL')} zł · transferowy ${Math.round(team.transferBudget).toLocaleString('pl-PL')}`,
  )
}

export function applyWageBudgetDelta(state: GameState, amount: number, reason: string): void {
  const team = state.team
  if (!team) return
  normalizeTeamFinance(team)
  team.wageBudget = Math.max(0, Math.round(team.wageBudget + amount))
  pushLog(
    state,
    `${reason}: płace ${amount >= 0 ? '+' : ''}${Math.round(amount).toLocaleString('pl-PL')} /tyg. · limit ${Math.round(team.wageBudget).toLocaleString('pl-PL')}`,
  )
}

export function seasonPrizeMoney(place: number, leagueId: string, clubs: number): number {
  const tier = getLeague(leagueId).tier
  const pot = tier === 1 ? 8_000_000 : tier === 2 ? 3_500_000 : tier === 3 ? 1_200_000 : 400_000
  const share = Math.max(0.08, 1.05 - (place - 1) * (0.9 / Math.max(8, clubs)))
  return Math.round(pot * share)
}

export function applySeasonPrize(state: GameState, place: number): number {
  const season = state.season!
  const prize = seasonPrizeMoney(place, season.leagueId, season.clubIds.length)
  const transferShare = Math.round(prize * 0.75)
  const wageShare = Math.round(prize * 0.08)
  applyBudgetDelta(state, transferShare, `Nagroda za ${place}. miejsce (transferowy)`)
  if (wageShare > 0) applyWageBudgetDelta(state, wageShare, `Nagroda — podniesienie limitu płac`)
  return prize
}

export function normalizeTeamFinance(team: TeamState): void {
  if (team.seasonIncome == null) team.seasonIncome = 0
  if (team.seasonExpense == null) team.seasonExpense = 0
  const legacy = team as TeamState & { budget?: number }
  if (team.transferBudget == null || Number.isNaN(team.transferBudget)) {
    team.transferBudget = Math.max(0, Math.round(legacy.budget ?? 0))
  }
  if (team.wageBudget == null || Number.isNaN(team.wageBudget)) {
    const bill = weeklyWageBill(team)
    team.wageBudget = Math.max(bill, Math.round(bill * 1.2 + 50_000))
  }
  for (const p of team.squad) normalizeSquadPlayer(p)
}

export function defaultReleaseClause(p: SquadPlayer): number {
  return Math.round(playerMarketValue(p) * 1.65)
}

export function clampWageOffer(wage: number): number {
  return clamp(Math.round(wage), 200, 250_000)
}

/** Seed FIFA-style pots for a new club. */
export function seedClubBudgets(
  clubWage: number,
  clubStrength: number,
  squadBill: number,
): { transferBudget: number; wageBudget: number } {
  const transferBudget = Math.round(clubWage * 380 + clubStrength * 1400 + 400_000)
  const wageBudget = Math.round(Math.max(squadBill * 1.28, squadBill + clubWage * 12 + 40_000))
  return { transferBudget, wageBudget }
}
