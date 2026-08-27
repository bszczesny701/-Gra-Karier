import { getClub } from '../data/clubs'
import type { GameState, SquadPlayer } from '../state/types'
import { pushLog } from '../state/gameState'
import {
  canAffordWageIncrease,
  clampWageOffer,
  defaultReleaseClause,
  expectedWage,
  playerMarketValue,
} from './finance'
import { normalizeSquadPlayer, pickDefaultLineup } from './squadGen'
import { formationPlan } from '../state/types'
import { ensureAiSquads, findPlayerAnywhere, removePlayerFromClub } from './transfers'

export function renewContract(
  state: GameState,
  playerId: string,
  years: number,
  wage: number,
  releaseClause: number | null = null,
): string | null {
  const team = state.team
  if (!team) return 'Brak drużyny'
  const p = team.squad.find((x) => x.id === playerId)
  if (!p) return 'Brak zawodnika'
  if (p.loanFromClubId) return 'Nie możesz przedłużyć kontraktu wypożyczonego'
  normalizeSquadPlayer(p)

  const need = expectedWage(p)
  const y = Math.max(1, Math.min(5, Math.round(years)))
  const w = clampWageOffer(wage)

  const wageErr = canAffordWageIncrease(team, p.wage, w)
  if (wageErr) return wageErr

  if (w < need * 0.92) {
    return p.wantsToLeave
      ? 'Zawodnik chce odejść — za niska pensja (wymaga ~+20%).'
      : `Za niska pensja (oczekuje ok. ${need.toLocaleString('pl-PL')} / tyg.).`
  }
  if (p.wantsToLeave && w < need) {
    return 'Chce odejść — podnieś pensję powyżej oczekiwań.'
  }

  p.contractYears = y
  p.wage = w
  p.releaseClause = releaseClause != null ? Math.max(0, Math.round(releaseClause)) : p.releaseClause
  if (p.releaseClause === 0) p.releaseClause = null
  p.wantsToLeave = false
  p.morale = Math.min(100, p.morale + 8)
  pushLog(
    state,
    `Kontrakt: ${p.name} · ${y} lat · ${w.toLocaleString('pl-PL')}/tyg.${p.releaseClause ? ` · klauzula ${p.releaseClause.toLocaleString('pl-PL')}` : ''}`,
  )
  return null
}

/**
 * Negocjacja przedłużenia — accept / counter / reject zamiast jednego klika.
 * Zwraca komunikat; przy counter zapisuje ofertę kind:'renew' w market.offers.
 */
export function makeRenewOffer(
  state: GameState,
  playerId: string,
  years: number,
  wage: number,
  releaseClause: number | null = null,
): string | null {
  const team = state.team
  if (!team) return 'Brak drużyny'
  if (!state.market) return 'Brak rynku'
  const p = team.squad.find((x) => x.id === playerId)
  if (!p) return 'Brak zawodnika'
  if (p.loanFromClubId) return 'Nie możesz przedłużyć kontraktu wypożyczonego'
  normalizeSquadPlayer(p)

  const need = expectedWage(p)
  const y = Math.max(1, Math.min(5, Math.round(years)))
  const w = clampWageOffer(wage)
  const wageErr = canAffordWageIncrease(team, p.wage, w)
  if (wageErr) return wageErr

  const existing = state.market.offers.find(
    (o) => o.kind === 'renew' && o.playerId === playerId && (o.status === 'pending' || o.status === 'countered'),
  )
  const rounds = (existing?.rounds ?? 0) + 1
  if (rounds > 3) {
    if (existing) existing.status = 'rejected'
    return 'Negocjacje zerwane — zbyt wiele rund.'
  }

  const accept = w >= need * 0.96 && (!p.wantsToLeave || w >= need)
  const mid = w >= need * 0.82

  if (accept) {
    if (existing) existing.status = 'accepted'
    return renewContract(state, playerId, y, w, releaseClause)
  }

  if (!mid || w < need * 0.7) {
    if (existing) existing.status = 'rejected'
    return p.wantsToLeave
      ? 'Zawodnik odrzucił warunki (chce odejść / za niska pensja).'
      : `Zawodnik odrzucił — oczekuje ok. ${need.toLocaleString('pl-PL')} / tyg.`
  }

  const counterWage = Math.round(need * (p.wantsToLeave ? 1.05 : 1))
  const counterYears = p.age >= 32 ? Math.min(y, 2) : Math.max(y, p.age <= 22 ? 4 : 3)
  const offer = existing ?? {
    id: `ren-${Date.now()}`,
    kind: 'renew' as const,
    playerId,
    fromClubId: team.clubId,
    toClubId: team.clubId,
    fee: 0,
    wageOffer: w,
    yearsOffer: y,
    releaseClauseOffer: releaseClause,
    status: 'countered' as const,
    fromAi: false,
    rounds: 0,
  }
  offer.wageOffer = w
  offer.yearsOffer = y
  offer.releaseClauseOffer = releaseClause
  offer.status = 'countered'
  offer.rounds = rounds
  offer.counter = {
    fee: 0,
    wage: clampWageOffer(Math.max(w, counterWage)),
    years: counterYears,
  }
  if (!existing) state.market.offers.unshift(offer)
  return `Kontrpropozycja: ${offer.counter.wage.toLocaleString('pl-PL')} /tyg. · ${offer.counter.years} lat.`
}

/** Akceptuj kontrpropozycję przedłużenia. */
export function acceptRenewCounter(state: GameState, offerId: string): string | null {
  const offer = state.market?.offers.find((o) => o.id === offerId)
  if (!offer || offer.kind !== 'renew' || offer.status !== 'countered' || !offer.counter) {
    return 'Brak kontrpropozycji'
  }
  const err = renewContract(
    state,
    offer.playerId,
    offer.counter.years,
    offer.counter.wage,
    offer.releaseClauseOffer ?? null,
  )
  if (!err) offer.status = 'accepted'
  return err
}

/** Propozycja domyślna do UI. */
export function suggestRenewTerms(p: SquadPlayer): { years: number; wage: number; clause: number } {
  normalizeSquadPlayer(p)
  const years = p.age >= 32 ? 1 : p.age <= 22 ? 4 : 3
  const wage = expectedWage(p)
  const clause = defaultReleaseClause(p)
  return { years, wage, clause }
}

/**
 * Na nowy sezon: years--, wygaśnięcie → odejście za darmo do AI (jeśli nie przedłużono).
 */
export function processContractExpiries(state: GameState): void {
  const team = state.team
  if (!team) return
  ensureAiSquads(state)
  const gone: SquadPlayer[] = []

  for (const p of [...team.squad]) {
    normalizeSquadPlayer(p)
    if ((p.contractYears ?? 0) > 0) continue
    // free agent → random AI club
    const aiIds = Object.keys(state.market.aiSquads)
    if (!aiIds.length) {
      p.contractYears = 1
      continue
    }
    const dest = aiIds[Math.floor(Math.random() * aiIds.length)]!
    removePlayerFromClub(state, team.clubId, p.id)
    p.contractYears = 2
    p.wage = expectedWage(p)
    p.wantsToLeave = false
    p.loanFromClubId = undefined
    p.loanToClubId = undefined
    p.loanWeeksLeft = undefined
    p.loanBuyOption = undefined
    state.market.aiSquads[dest] = [...(state.market.aiSquads[dest] ?? []), p]
    gone.push(p)
    pushLog(state, `${p.name} odszedł za darmo do ${getClub(dest).name} (koniec kontraktu).`)
  }

  if (gone.length) {
    const plan = formationPlan(team.tactics.formation)
    const picked = pickDefaultLineup(team.squad, plan)
    team.startingIds = picked.startingIds
    team.benchIds = picked.benchIds
  }
}

export function triggerReleaseClause(state: GameState, playerId: string): string | null {
  const found = findPlayerAnywhere(state, playerId)
  if (!found) return 'Nie znaleziono zawodnika'
  const { player, clubId } = found
  normalizeSquadPlayer(player)
  if (!player.releaseClause) return 'Brak klauzuli odstępnego'
  const team = state.team!
  if (clubId === team.clubId) return 'To Twój zawodnik'
  // buy via clause handled in transfers.activateReleaseClause
  return null
}

export { playerMarketValue, expectedWage }
