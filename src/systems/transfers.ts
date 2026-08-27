import { getClub, LEAGUES } from '../data/clubs'
import type {
  GameState,
  SquadPlayer,
  TransferListing,
  TransferOffer,
  TransferOfferCounter,
} from '../state/types'
import { emptyMarket, formationPlan } from '../state/types'
import { pushLog } from '../state/gameState'
import { currentWeek } from './calendar'
import {
  applyBudgetDelta,
  canAffordTransfer,
  clampWageOffer,
  expectedWage,
  playerMarketValue,
} from './finance'
import { generateSquad, normalizeSquadPlayer, pickDefaultLineup } from './squadGen'
import { pushMail } from './mailbox'
import { pushNews } from './news'

const MIN_SQUAD = 18
const MAX_SQUAD = 30

export function ensureMarket(state: GameState): void {
  if (!state.market) state.market = emptyMarket()
  if (!state.market.listings) state.market.listings = []
  if (!state.market.offers) state.market.offers = []
  if (!state.market.aiSquads) state.market.aiSquads = {}
}

export function isTransferWindowOpen(state: GameState): boolean {
  const season = state.season
  if (!season?.calendar) return false
  const w = currentWeek(season)
  return Boolean(w?.transferWindow)
}

export function polishClubIds(state: GameState): string[] {
  const pl = new Set(
    LEAGUES.filter((l) => l.country === 'PL').flatMap((l) =>
      Object.entries(state.clubLeagueIds)
        .filter(([, lid]) => lid === l.id)
        .map(([cid]) => cid),
    ),
  )
  // fallback: all mapped clubs in PL leagues from static data
  if (pl.size < 8) {
    for (const l of LEAGUES.filter((x) => x.country === 'PL')) {
      for (const id of l.clubIds) pl.add(id)
    }
  }
  return [...pl]
}

export function ensureAiSquads(state: GameState): void {
  ensureMarket(state)
  const you = state.team?.clubId
  for (const clubId of polishClubIds(state)) {
    if (clubId === you) continue
    if (!state.market.aiSquads[clubId]?.length) {
      state.market.aiSquads[clubId] = generateSquad(clubId).map((p) => normalizeSquadPlayer(p))
    }
  }
}

export function findPlayerAnywhere(
  state: GameState,
  playerId: string,
): { player: SquadPlayer; clubId: string } | null {
  ensureMarket(state)
  const team = state.team
  if (team) {
    const p = team.squad.find((x) => x.id === playerId)
    if (p) return { player: p, clubId: team.clubId }
  }
  for (const [clubId, squad] of Object.entries(state.market.aiSquads)) {
    const p = squad.find((x) => x.id === playerId)
    if (p) return { player: p, clubId }
  }
  return null
}

export function getClubSquad(state: GameState, clubId: string): SquadPlayer[] {
  ensureAiSquads(state)
  if (state.team?.clubId === clubId) return state.team.squad
  return state.market.aiSquads[clubId] ?? []
}

export function removePlayerFromClub(state: GameState, clubId: string, playerId: string): SquadPlayer | null {
  if (state.team?.clubId === clubId) {
    const idx = state.team.squad.findIndex((p) => p.id === playerId)
    if (idx < 0) return null
    const [p] = state.team.squad.splice(idx, 1)
    state.team.startingIds = state.team.startingIds.filter((id) => id !== playerId)
    state.team.benchIds = state.team.benchIds.filter((id) => id !== playerId)
    return p ?? null
  }
  ensureAiSquads(state)
  const squad = state.market.aiSquads[clubId]
  if (!squad) return null
  const idx = squad.findIndex((p) => p.id === playerId)
  if (idx < 0) return null
  const [p] = squad.splice(idx, 1)
  return p ?? null
}

function addPlayerToClub(state: GameState, clubId: string, player: SquadPlayer): void {
  normalizeSquadPlayer(player)
  if (state.team?.clubId === clubId) {
    state.team.squad.push(player)
    const plan = formationPlan(state.team.tactics.formation)
    const picked = pickDefaultLineup(state.team.squad, plan)
    state.team.startingIds = picked.startingIds
    state.team.benchIds = picked.benchIds
    return
  }
  ensureAiSquads(state)
  if (!state.market.aiSquads[clubId]) state.market.aiSquads[clubId] = []
  state.market.aiSquads[clubId]!.push(player)
}

function keepersInSquad(squad: SquadPlayer[]): number {
  return squad.filter((p) => p.role === 'BR' && !p.loanToClubId).length
}

export function seedMarketListings(state: GameState): void {
  ensureAiSquads(state)
  const week = state.season?.calendar.weekIndex ?? 0
  const listings: TransferListing[] = []
  const you = state.team?.clubId

  for (const [clubId, squad] of Object.entries(state.market.aiSquads)) {
    if (clubId === you) continue
    const sorted = [...squad].sort((a, b) => a.overall - b.overall || a.morale - b.morale)
    const candidates = sorted.filter(
      (p) => p.morale < 55 || p.overall < getClub(clubId).strength - 4 || (p.seasonApps ?? 0) === 0,
    )
    const pick = (candidates.length ? candidates : sorted).slice(0, 2)
    for (const p of pick) {
      if (keepersInSquad(squad) <= 1 && p.role === 'BR') continue
      listings.push({
        playerId: p.id,
        clubId,
        askingPrice: Math.round(playerMarketValue(p) * (1.05 + Math.random() * 0.25)),
        listedAtWeek: week,
      })
    }
  }
  state.market.listings = listings
  state.market.seededWeek = week
}

export function refreshListingsIfNeeded(state: GameState): void {
  ensureMarket(state)
  if (!isTransferWindowOpen(state)) return
  const week = state.season!.calendar.weekIndex
  if (state.market.seededWeek !== week || state.market.listings.length < 8) {
    seedMarketListings(state)
  }
}

export function listOwnPlayer(state: GameState, playerId: string, askingPrice?: number): string | null {
  if (!isTransferWindowOpen(state)) return 'Okienko transferowe zamknięte'
  const team = state.team!
  const p = team.squad.find((x) => x.id === playerId)
  if (!p) return 'Brak zawodnika'
  if (p.loanFromClubId) return 'Nie wystawisz wypożyczonego'
  if (team.squad.length <= MIN_SQUAD) return `Minimalna kadra: ${MIN_SQUAD}`
  if (p.role === 'BR' && keepersInSquad(team.squad) <= 1) return 'Musisz mieć bramkarza'
  ensureMarket(state)
  state.market.listings = state.market.listings.filter((l) => l.playerId !== playerId)
  state.market.listings.unshift({
    playerId,
    clubId: team.clubId,
    askingPrice: askingPrice ?? Math.round(playerMarketValue(p) * 1.15),
    listedAtWeek: state.season!.calendar.weekIndex,
  })
  pushLog(state, `Wystawiono: ${p.name} za ${state.market.listings[0]!.askingPrice.toLocaleString('pl-PL')} zł`)
  return null
}

export function unlistOwnPlayer(state: GameState, playerId: string): void {
  ensureMarket(state)
  state.market.listings = state.market.listings.filter((l) => l.playerId !== playerId)
}

function nextOfferId(): string {
  return `off-${Date.now()}-${Math.floor(Math.random() * 9999)}`
}

function evaluateFee(asking: number, value: number, fee: number): 'accept' | 'counter' | 'reject' {
  if (fee >= asking * 0.95 || fee >= value * 1.05) return 'accept'
  if (fee >= asking * 0.75 || fee >= value * 0.85) return 'counter'
  return 'reject'
}

/** Oferta kupna od gracza do AI. */
export function makeBuyOffer(
  state: GameState,
  playerId: string,
  fee: number,
  wage: number,
  years: number,
  releaseClause: number | null = null,
): string | null {
  if (!isTransferWindowOpen(state)) return 'Okienko transferowe zamknięte'
  const team = state.team!
  if (team.squad.length >= MAX_SQUAD) return `Maks. kadra: ${MAX_SQUAD}`
  const found = findPlayerAnywhere(state, playerId)
  if (!found) return 'Nie znaleziono'
  if (found.clubId === team.clubId) return 'To Twój zawodnik'
  const listing = state.market.listings.find((l) => l.playerId === playerId)
  const value = playerMarketValue(found.player)
  const asking = listing?.askingPrice ?? Math.round(value * 1.1)
  const err = canAffordTransfer(team, fee, wage)
  if (err) return err

  const offer: TransferOffer = {
    id: nextOfferId(),
    kind: 'buy',
    playerId,
    fromClubId: found.clubId,
    toClubId: team.clubId,
    fee: Math.round(fee),
    wageOffer: clampWageOffer(wage),
    yearsOffer: Math.max(1, Math.min(5, years)),
    releaseClauseOffer: releaseClause,
    status: 'pending',
    fromAi: false,
  }

  const verdict = evaluateFee(asking, value, offer.fee)
  if (verdict === 'reject') {
    offer.status = 'rejected'
    state.market.offers.unshift(offer)
    return 'Klub odrzucił ofertę (za niska kwota).'
  }
  if (verdict === 'counter') {
    offer.status = 'countered'
    offer.counter = {
      fee: Math.round((asking + offer.fee) / 2),
      wage: Math.max(offer.wageOffer, expectedWage(found.player)),
      years: offer.yearsOffer,
    }
    state.market.offers.unshift(offer)
    return `Kontrpropozycja: ${offer.counter.fee.toLocaleString('pl-PL')} zł + pensja ${offer.counter.wage.toLocaleString('pl-PL')}.`
  }

  return completeBuy(state, offer)
}

export function acceptCounterOffer(state: GameState, offerId: string): string | null {
  ensureMarket(state)
  const offer = state.market.offers.find((o) => o.id === offerId)
  if (!offer || offer.status !== 'countered' || !offer.counter) return 'Brak kontrpropozycji'
  offer.fee = offer.counter.fee
  offer.wageOffer = offer.counter.wage
  offer.yearsOffer = offer.counter.years
  offer.counter = undefined
  if (offer.kind === 'buy') return completeBuy(state, offer)
  if (offer.kind === 'sell') return completeSellToAi(state, offer)
  if (offer.kind === 'loan') return completeLoanIn(state, offer)
  return 'Nieobsługiwany typ'
}

export function rejectOffer(state: GameState, offerId: string): void {
  ensureMarket(state)
  const offer = state.market.offers.find((o) => o.id === offerId)
  if (offer) offer.status = 'rejected'
}

function completeBuy(state: GameState, offer: TransferOffer): string | null {
  const team = state.team!
  const err = canAffordTransfer(team, offer.fee, offer.wageOffer)
  if (err) return err
  if (team.squad.length >= MAX_SQUAD) return `Maks. kadra: ${MAX_SQUAD}`

  const p = removePlayerFromClub(state, offer.fromClubId, offer.playerId)
  if (!p) return 'Zawodnik niedostępny'
  normalizeSquadPlayer(p)
  applyBudgetDelta(state, -offer.fee, `Transfer: ${p.name} z ${getClub(offer.fromClubId).short}`)
  p.wage = offer.wageOffer
  p.contractYears = offer.yearsOffer
  p.releaseClause = offer.releaseClauseOffer ?? p.releaseClause
  p.wantsToLeave = false
  p.loanFromClubId = undefined
  p.loanToClubId = undefined
  p.loanWeeksLeft = undefined
  p.loanBuyOption = undefined
  p.morale = Math.min(100, p.morale + 5)
  addPlayerToClub(state, team.clubId, p)
  state.market.listings = state.market.listings.filter((l) => l.playerId !== p.id)
  offer.status = 'accepted'
  state.market.offers = [offer, ...state.market.offers.filter((o) => o.id !== offer.id)].slice(0, 40)
  pushMail(state, {
    kind: 'system',
    from: 'Dyrektor sportowy',
    subject: `Transfer: ${p.name}`,
    body: `Dołączył ${p.name} z ${getClub(offer.fromClubId).name} za ${offer.fee.toLocaleString('pl-PL')} zł. Kontrakt: ${offer.yearsOffer} lat, ${offer.wageOffer.toLocaleString('pl-PL')} / tyg.`,
    year: state.season?.year,
  })
  return null
}

/** Wyzwolenie klauzuli. */
export function activateReleaseClause(state: GameState, playerId: string): string | null {
  if (!isTransferWindowOpen(state)) return 'Okienko transferowe zamknięte'
  const team = state.team!
  const found = findPlayerAnywhere(state, playerId)
  if (!found || found.clubId === team.clubId) return 'Niedostępne'
  normalizeSquadPlayer(found.player)
  const clause = found.player.releaseClause
  if (!clause) return 'Brak klauzuli'
  const offer: TransferOffer = {
    id: nextOfferId(),
    kind: 'buy',
    playerId,
    fromClubId: found.clubId,
    toClubId: team.clubId,
    fee: clause,
    wageOffer: Math.max(found.player.wage, expectedWage(found.player)),
    yearsOffer: Math.max(2, found.player.contractYears || 2),
    releaseClauseOffer: null,
    status: 'pending',
  }
  return completeBuy(state, offer)
}

/** AI oferuje kupno Twojego zawodnika. */
export function maybeAiBuyOffers(state: GameState): void {
  if (!isTransferWindowOpen(state)) return
  const team = state.team!
  ensureMarket(state)
  const targets = team.squad.filter(
    (p) =>
      !p.loanFromClubId &&
      (p.wantsToLeave || state.market.listings.some((l) => l.playerId === p.id && l.clubId === team.clubId)),
  )
  if (!targets.length || Math.random() > 0.45) return
  const p = targets[Math.floor(Math.random() * targets.length)]!
  const aiClubs = Object.keys(state.market.aiSquads)
  if (!aiClubs.length) return
  const buyer = aiClubs[Math.floor(Math.random() * aiClubs.length)]!
  const value = playerMarketValue(p)
  const listing = state.market.listings.find((l) => l.playerId === p.id)
  const fee = Math.round((listing?.askingPrice ?? value) * (0.9 + Math.random() * 0.2))
  const offer: TransferOffer = {
    id: nextOfferId(),
    kind: 'sell',
    playerId: p.id,
    fromClubId: team.clubId,
    toClubId: buyer,
    fee,
    wageOffer: expectedWage(p),
    yearsOffer: 3,
    status: 'pending',
    fromAi: true,
  }
  state.market.offers.unshift(offer)
  pushMail(state, {
    kind: 'system',
    from: getClub(buyer).name,
    subject: `Oferta za ${p.name}`,
    body: `${getClub(buyer).name} oferuje ${fee.toLocaleString('pl-PL')} zł za ${p.name}. Sprawdź Transfery.`,
    year: state.season?.year,
  })
}

export function acceptSellOffer(state: GameState, offerId: string): string | null {
  const offer = state.market.offers.find((o) => o.id === offerId)
  if (!offer || offer.kind !== 'sell' || offer.status !== 'pending') return 'Brak oferty'
  return completeSellToAi(state, offer)
}

function completeSellToAi(state: GameState, offer: TransferOffer): string | null {
  const team = state.team!
  if (team.squad.length <= MIN_SQUAD) return `Minimalna kadra: ${MIN_SQUAD}`
  const p = team.squad.find((x) => x.id === offer.playerId)
  if (!p) return 'Brak zawodnika'
  if (p.role === 'BR' && keepersInSquad(team.squad) <= 1) return 'Musisz mieć bramkarza'
  const removed = removePlayerFromClub(state, team.clubId, offer.playerId)
  if (!removed) return 'Błąd sprzedaży'
  applyBudgetDelta(state, offer.fee, `Sprzedaż: ${removed.name} → ${getClub(offer.toClubId).short}`)
  removed.wage = offer.wageOffer
  removed.contractYears = offer.yearsOffer
  removed.wantsToLeave = false
  addPlayerToClub(state, offer.toClubId, removed)
  state.market.listings = state.market.listings.filter((l) => l.playerId !== removed.id)
  offer.status = 'accepted'
  const plan = formationPlan(team.tactics.formation)
  const picked = pickDefaultLineup(team.squad, plan)
  team.startingIds = picked.startingIds
  team.benchIds = picked.benchIds
  return null
}

export function counterSellOffer(
  state: GameState,
  offerId: string,
  counter: TransferOfferCounter,
): string | null {
  const offer = state.market.offers.find((o) => o.id === offerId)
  if (!offer || offer.kind !== 'sell' || !offer.fromAi) return 'Brak oferty'
  if (counter.fee <= offer.fee * 1.05) {
    offer.fee = counter.fee
    offer.wageOffer = counter.wage
    offer.yearsOffer = counter.years
    return completeSellToAi(state, offer)
  }
  // AI may accept higher ask ~50%
  if (Math.random() < 0.5) {
    offer.fee = counter.fee
    offer.wageOffer = counter.wage
    offer.yearsOffer = counter.years
    return completeSellToAi(state, offer)
  }
  offer.status = 'rejected'
  return 'Klub odrzucił Twoją kontrpropozycję.'
}

/** Wypożyczenie DO Ciebie. */
export function makeLoanOffer(
  state: GameState,
  playerId: string,
  loanWeeks: number,
  loanBuyOption: number | null,
  fee = 0,
): string | null {
  if (!isTransferWindowOpen(state)) return 'Okienko transferowe zamknięte'
  const team = state.team!
  if (team.squad.length >= MAX_SQUAD) return `Maks. kadra: ${MAX_SQUAD}`
  const found = findPlayerAnywhere(state, playerId)
  if (!found || found.clubId === team.clubId) return 'Niedostępne'
  if (fee > 0) {
    const err = canAffordTransfer(team, fee, found.player.wage)
    if (err) return err
  }
  const offer: TransferOffer = {
    id: nextOfferId(),
    kind: 'loan',
    playerId,
    fromClubId: found.clubId,
    toClubId: team.clubId,
    fee: Math.round(fee),
    wageOffer: found.player.wage,
    yearsOffer: 0,
    loanWeeks: Math.max(4, Math.min(30, loanWeeks)),
    loanBuyOption,
    status: 'pending',
  }
  // AI usually accepts loan for fringe players
  const value = playerMarketValue(found.player)
  if (found.player.overall > getClub(found.clubId).strength + 6 && Math.random() < 0.4) {
    offer.status = 'rejected'
    state.market.offers.unshift(offer)
    return 'Klub nie chce wypożyczać kluczowego zawodnika.'
  }
  if (loanBuyOption != null && loanBuyOption < value * 0.7) {
    offer.status = 'countered'
    offer.counter = { fee: offer.fee, wage: offer.wageOffer, years: 0 }
    offer.loanBuyOption = Math.round(value * 0.95)
    state.market.offers.unshift(offer)
    return `Kontrpropozycja opcji wykupu: ${offer.loanBuyOption.toLocaleString('pl-PL')} zł`
  }
  return completeLoanIn(state, offer)
}

function completeLoanIn(state: GameState, offer: TransferOffer): string | null {
  const team = state.team!
  if (team.squad.length >= MAX_SQUAD) return `Maks. kadra: ${MAX_SQUAD}`
  if (offer.fee > 0) {
    const err = canAffordTransfer(team, offer.fee, offer.wageOffer)
    if (err) return err
    applyBudgetDelta(state, -offer.fee, `Opłata za wypożyczenie`)
  }
  const p = removePlayerFromClub(state, offer.fromClubId, offer.playerId)
  if (!p) return 'Zawodnik niedostępny'
  p.loanFromClubId = offer.fromClubId
  p.loanToClubId = undefined
  p.loanWeeksLeft = offer.loanWeeks ?? 12
  p.loanBuyOption = offer.loanBuyOption ?? null
  p.wantsToLeave = false
  addPlayerToClub(state, team.clubId, p)
  offer.status = 'accepted'
  state.market.offers.unshift(offer)
  pushLog(state, `Wypożyczenie: ${p.name} z ${getClub(offer.fromClubId).short} · ${p.loanWeeksLeft} tyg.`)
  return null
}

/** Wypożycz swojego do AI. */
export function loanOutPlayer(
  state: GameState,
  playerId: string,
  loanWeeks: number,
  loanBuyOption: number | null = null,
): string | null {
  if (!isTransferWindowOpen(state)) return 'Okienko transferowe zamknięte'
  const team = state.team!
  const p = team.squad.find((x) => x.id === playerId)
  if (!p) return 'Brak zawodnika'
  if (p.loanFromClubId) return 'Już wypożyczony'
  if (team.squad.length <= MIN_SQUAD) return `Minimalna kadra: ${MIN_SQUAD}`
  if (p.role === 'BR' && keepersInSquad(team.squad) <= 1) return 'Musisz mieć bramkarza'
  ensureAiSquads(state)
  const aiClubs = Object.keys(state.market.aiSquads)
  if (!aiClubs.length) return 'Brak klubu'
  const dest = aiClubs[Math.floor(Math.random() * aiClubs.length)]!
  const removed = removePlayerFromClub(state, team.clubId, playerId)
  if (!removed) return 'Błąd'
  removed.loanToClubId = dest
  removed.loanFromClubId = undefined
  removed.loanWeeksLeft = Math.max(4, loanWeeks)
  removed.loanBuyOption = loanBuyOption
  addPlayerToClub(state, dest, removed)
  // keep a ghost reference? Plan: player lives in AI squad with loanToClubId pointing dest and we need to find him - he's IN dest squad with loanToClubId=dest and we need loanFrom = you
  removed.loanFromClubId = team.clubId
  const plan = formationPlan(team.tactics.formation)
  const picked = pickDefaultLineup(team.squad, plan)
  team.startingIds = picked.startingIds
  team.benchIds = picked.benchIds
  pushLog(state, `Wypożyczono ${removed.name} → ${getClub(dest).short}`)
  return null
}

export function tickLoans(state: GameState): void {
  const team = state.team
  if (!team) return
  ensureAiSquads(state)

  // Loan-ins at your club
  for (const p of [...team.squad]) {
    if (!p.loanFromClubId || p.loanWeeksLeft == null) continue
    p.loanWeeksLeft -= 1
    if (p.loanWeeksLeft > 0) continue
    // return or buy
    if (p.loanBuyOption != null && team.budget >= p.loanBuyOption && Math.random() < 0.01) {
      // rare auto — player must confirm via UI; just return
    }
    const parent = p.loanFromClubId
    const removed = removePlayerFromClub(state, team.clubId, p.id)
    if (!removed) continue
    removed.loanFromClubId = undefined
    removed.loanToClubId = undefined
    removed.loanWeeksLeft = undefined
    removed.loanBuyOption = undefined
    addPlayerToClub(state, parent, removed)
    pushLog(state, `Koniec wypożyczenia: ${removed.name} wraca do ${getClub(parent).short}`)
  }

  // Loan-outs: players in AI squads belonging to you
  for (const [clubId, squad] of Object.entries(state.market.aiSquads)) {
    for (const p of [...squad]) {
      if (p.loanFromClubId !== team.clubId || p.loanWeeksLeft == null) continue
      p.loanWeeksLeft -= 1
      if (p.loanWeeksLeft > 0) continue
      const removed = removePlayerFromClub(state, clubId, p.id)
      if (!removed) continue
      removed.loanFromClubId = undefined
      removed.loanToClubId = undefined
      removed.loanWeeksLeft = undefined
      removed.loanBuyOption = undefined
      addPlayerToClub(state, team.clubId, removed)
      pushLog(state, `Powrót z wypożyczenia: ${removed.name}`)
    }
  }
}

export function exerciseLoanBuyOption(state: GameState, playerId: string): string | null {
  if (!isTransferWindowOpen(state)) return 'Okienko transferowe zamknięte'
  const team = state.team!
  const p = team.squad.find((x) => x.id === playerId)
  if (!p?.loanFromClubId || p.loanBuyOption == null) return 'Brak opcji wykupu'
  const fee = p.loanBuyOption
  const err = canAffordTransfer(team, fee, p.wage)
  if (err) return err
  applyBudgetDelta(state, -fee, `Wykup z wypożyczenia: ${p.name}`)
  p.loanFromClubId = undefined
  p.loanToClubId = undefined
  p.loanWeeksLeft = undefined
  p.loanBuyOption = undefined
  p.contractYears = Math.max(2, p.contractYears || 2)
  pushLog(state, `Wykupiono ${p.name} za ${fee.toLocaleString('pl-PL')} zł`)
  return null
}

export function onTransferWindowOpened(state: GameState): void {
  seedMarketListings(state)
  maybeAiBuyOffers(state)
  tickAiWorldTransfers(state)
}

function leagueTierOf(state: GameState, clubId: string): number {
  const lid = state.clubLeagueIds[clubId]
  const league = LEAGUES.find((l) => l.id === lid)
  return league?.tier ?? 9
}

function avgSquadOvr(squad: SquadPlayer[]): number {
  if (!squad.length) return 40
  const top = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11)
  return top.reduce((s, p) => s + p.overall, 0) / top.length
}

/** Transfery AI↔AI w okienku — zmieniają kadry i generują newsy. */
export function tickAiWorldTransfers(state: GameState, maxDeals = 2): void {
  if (!isTransferWindowOpen(state)) return
  ensureAiSquads(state)
  const you = state.team?.clubId
  const listings = state.market.listings.filter((l) => l.clubId !== you)
  if (!listings.length) return

  let deals = 0
  const shuffled = [...listings].sort(() => Math.random() - 0.5)

  for (const listing of shuffled) {
    if (deals >= maxDeals) break
    if (Math.random() > 0.55) continue

    const sellerSquad = state.market.aiSquads[listing.clubId]
    if (!sellerSquad) continue
    const player = sellerSquad.find((p) => p.id === listing.playerId)
    if (!player) continue
    if (keepersInSquad(sellerSquad) <= 1 && player.role === 'BR') continue
    if (sellerSquad.length <= MIN_SQUAD) continue

    const sellerTier = leagueTierOf(state, listing.clubId)
    const buyers = Object.keys(state.market.aiSquads).filter((cid) => {
      if (cid === listing.clubId || cid === you) return false
      const sq = state.market.aiSquads[cid]!
      if (sq.length >= MAX_SQUAD) return false
      const tier = leagueTierOf(state, cid)
      return tier <= sellerTier + 1
    })
    if (!buyers.length) continue

    const buyerId = buyers[Math.floor(Math.random() * buyers.length)]!
    const buyerSquad = state.market.aiSquads[buyerId]!
    const buyerAvg = avgSquadOvr(buyerSquad)
    const needsUpgrade = player.overall >= buyerAvg - 1
    const roleGap = !buyerSquad.some((p) => p.role === player.role && p.overall >= player.overall - 2)
    if (!needsUpgrade && !roleGap && Math.random() > 0.35) continue

    const moved = removePlayerFromClub(state, listing.clubId, player.id)
    if (!moved) continue
    addPlayerToClub(state, buyerId, moved)
    state.market.listings = state.market.listings.filter((l) => l.playerId !== listing.playerId)
    publishAiTransferNews(state, moved, listing.clubId, buyerId, listing.askingPrice)
    deals++
  }
}

function publishAiTransferNews(
  state: GameState,
  player: SquadPlayer,
  fromId: string,
  toId: string,
  fee: number,
): void {
  const from = getClub(fromId)
  const to = getClub(toId)
  pushNews(state, {
    kind: 'transfer',
    headline: `${player.name} → ${to.short}`,
    body: `${to.name} wykupił ${player.name} (${player.overall} OVR) z ${from.name} za ok. ${Math.round(fee).toLocaleString('pl-PL')} zł.`,
    round: state.season?.roundIndex,
    year: state.season?.year,
  })
  pushLog(state, `AI: ${from.short} → ${to.short}: ${player.name}`)
}
