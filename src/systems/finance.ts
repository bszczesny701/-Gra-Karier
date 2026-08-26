import { getLeague } from '../data/clubs'
import type { GameState, SquadPlayer, TeamState } from '../state/types'
import { clamp } from '../state/types'
import { pushLog } from '../state/gameState'
import { normalizeSquadPlayer } from './squadGen'

export function playerMarketValue(p: SquadPlayer): number {
  normalizeSquadPlayer(p)
  const ageMod = p.age <= 23 ? 1.35 : p.age <= 28 ? 1.15 : p.age <= 32 ? 0.9 : 0.55
  const roleMod = p.role === 'BR' ? 0.85 : p.role === 'ŚN' || p.role === 'PN' || p.role === 'LN' ? 1.15 : 1
  return Math.max(50_000, Math.round(p.overall * p.overall * 420 * ageMod * roleMod))
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

export function canAffordFee(team: TeamState, fee: number): boolean {
  return team.budget >= fee
}

/** Fee + nowa pensja: roczny wage bill nie powinien zjeść >65% budżetu po transakcji. */
export function canAffordTransfer(team: TeamState, fee: number, newWage: number, replacingWage = 0): string | null {
  if (fee > team.budget) return 'Za mały budżet transferowy'
  const bill = weeklyWageBill(team) - replacingWage + newWage
  const after = team.budget - fee
  if (bill * 52 > after * 0.65) return 'Za wysoka masa płac względem budżetu'
  return null
}

export function applyBudgetDelta(state: GameState, amount: number, reason: string): void {
  const team = state.team
  if (!team) return
  if (team.seasonIncome == null) team.seasonIncome = 0
  if (team.seasonExpense == null) team.seasonExpense = 0
  team.budget = Math.max(0, Math.round(team.budget + amount))
  if (amount >= 0) team.seasonIncome += amount
  else team.seasonExpense += -amount
  pushLog(state, `${reason}: ${amount >= 0 ? '+' : ''}${Math.round(amount).toLocaleString('pl-PL')} zł · budżet ${Math.round(team.budget).toLocaleString('pl-PL')}`)
}

export function chargeWeeklyWages(state: GameState): void {
  const team = state.team
  if (!team) return
  const bill = weeklyWageBill(team)
  if (bill <= 0) return
  applyBudgetDelta(state, -bill, `Płace tygodniowe (${team.squad.filter((p) => !p.loanToClubId).length} zaw.)`)
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
  applyBudgetDelta(state, prize, `Nagroda za ${place}. miejsce`)
  return prize
}

export function normalizeTeamFinance(team: TeamState): void {
  if (team.seasonIncome == null) team.seasonIncome = 0
  if (team.seasonExpense == null) team.seasonExpense = 0
  for (const p of team.squad) normalizeSquadPlayer(p)
}

export function defaultReleaseClause(p: SquadPlayer): number {
  return Math.round(playerMarketValue(p) * 1.4)
}

export function clampWageOffer(n: number): number {
  return clamp(Math.round(n), 500, 200_000)
}
