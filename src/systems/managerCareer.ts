import { getClub, getLeague, LEAGUES, formatStars, starsLabel } from '../data/clubs'
import type {
  Formation,
  GamePlan,
  GameState,
  Mentality,
  SeasonReport,
  TacticAxis,
  TacticalStyle,
} from '../state/types'
import { emptyMarket, formationPlan, normalizeTactics } from '../state/types'
import { pushLog } from '../state/gameState'
import {
  applyPromotionRelegation,
  createManagerSeason,
  initClubLeagueMap,
} from './leagueSim'
import { beginMatchday, advanceWeek, nextUserMatch, canAdvanceWeek } from './matchEngine'
import {
  applyHalftimeMotivation,
  liveSubstitute,
  liveSwapOnPitch,
  playerUnavailableReason,
  setMatchPaused,
  setMatchSpeed,
  startSecondHalf,
  tickLiveMinute,
  type MotivationId,
} from './liveMatch'
import { createTeamState, pickDefaultLineup, normalizeTeamSquad, normalizeSquadPlayer } from './squadGen'
import { applyFormationDefaultOrder, validateLineup } from './tactics'
import { recomputeTeamChemistry } from './chemistry'
import { playerTablePosition, sortedStandings, standingsAroundPlayer } from './standings'
import {
  applyBoardTrust,
  boardExpectationForClub,
  boardTrustDelta,
  initialBoardTrust,
  shouldSack,
} from './board'
import { seedOpeningNews } from './news'
import { cupSummaryText } from './cup'
import { buildSeasonSchedule } from './calendar'
import { applySeasonPrize, normalizeTeamFinance, weeklyWageBill } from './finance'
import { processContractExpiries } from './contracts'
import {
  ensureAiSquads,
  ensureMarket,
  isTransferWindowOpen,
  onTransferWindowOpened,
} from './transfers'

export { playerTablePosition, sortedStandings, standingsAroundPlayer }
export { beginMatchday, advanceWeek, nextUserMatch, canAdvanceWeek }
export {
  applyHalftimeMotivation,
  liveSubstitute,
  liveSwapOnPitch,
  playerUnavailableReason,
  setMatchPaused,
  setMatchSpeed,
  startSecondHalf,
  tickLiveMinute,
}
export type { MotivationId }

export {
  makeBuyOffer,
  acceptCounterOffer,
  rejectOffer,
  listOwnPlayer,
  unlistOwnPlayer,
  activateReleaseClause,
  acceptSellOffer,
  counterSellOffer,
  makeLoanOffer,
  loanOutPlayer,
  exerciseLoanBuyOption,
  isTransferWindowOpen,
  refreshListingsIfNeeded,
  ensureAiSquads,
  findPlayerAnywhere,
} from './transfers'
export { renewContract, suggestRenewTerms } from './contracts'
export { playerMarketValue, weeklyWageBill, expectedWage } from './finance'
export {
  TRAINING_FOCUS_LABELS,
  TRAINING_FOCUSES,
  setTrainingFocus,
  cycleTrainingFocus,
  applyWeekTraining,
} from './training'
export {
  recomputeTeamChemistry,
  setCaptain,
  dressingRoomStatus,
} from './chemistry'
export { workRateLabel } from './squadGen'
export { tickAiWorldTransfers } from './transfers'

export function polishLeagues() {
  return LEAGUES.filter((l) => l.country === 'PL').sort((a, b) => b.tier - a.tier)
}

export function setDraftManagerName(state: GameState, name: string): void {
  state.draftManagerName = name.trim().slice(0, 32)
}

export function startManagerCreate(state: GameState): void {
  state.draftManagerName = ''
  state.manager = null
  state.team = null
  state.season = null
  state.seasonReport = null
  state.screen = 'createManager'
}

export function confirmManagerName(state: GameState, name: string): void {
  const n = name.trim().slice(0, 32) || 'Trener'
  state.draftManagerName = n
  state.screen = 'pickClub'
}

export function selectClub(state: GameState, clubId: string): void {
  if (!state.clubLeagueIds || !Object.keys(state.clubLeagueIds).length) {
    state.clubLeagueIds = initClubLeagueMap()
  }
  const club = getClub(clubId)
  const leagueId = state.clubLeagueIds[clubId]
  const year = state.seasonReport?.sacked
    ? state.seasonReport.year + 1
    : (state.season?.year ?? new Date().getFullYear())
  const returning = Boolean(state.manager && !state.team)
  const trust = initialBoardTrust(clubId, leagueId)
  const exp = boardExpectationForClub(clubId, leagueId)

  if (returning && state.manager) {
    state.manager.clubId = clubId
    state.manager.boardTrust = trust
  } else {
    state.manager = {
      name: state.draftManagerName || state.manager?.name || 'Trener',
      reputation: 35,
      boardTrust: trust,
      seasonsManaged: 0,
      clubId,
    }
  }

  state.team = createTeamState(clubId)
  normalizeTeamSquad(state.team)
  normalizeTeamFinance(state.team)
  state.season = createManagerSeason(state, clubId, year)
  buildSeasonSchedule(state, state.season)
  state.season.teamChemistry = state.team.teamChemistry
  state.seasonReport = null
  state.liveMatch = null
  state.mailbox = []
  state.news = []
  ensureMarket(state)
  state.market = emptyMarket()
  ensureAiSquads(state)
  if (isTransferWindowOpen(state)) onTransferWindowOpened(state)
  state.screen = 'hub'
  pushLog(
    state,
    `${state.manager!.name} obejmuje ${club.name} (${formatStars(club.stars)} ${starsLabel(club.stars)}). Cel zarządu: ${exp.label}.`,
  )
  seedOpeningNews(state)
}

/** Po zwolnieniu — wybór nowego klubu (zachowuje karierę trenera). */
export function seekNewClub(state: GameState): void {
  if (state.manager) {
    state.draftManagerName = state.manager.name
    state.manager.clubId = ''
  }
  state.team = null
  state.season = null
  state.liveMatch = null
  /* seasonReport zostaje — rok i kontekst zwolnienia */
  state.screen = 'pickClub'
}

export function openLineup(state: GameState): void {
  if (!state.team || !state.season || state.season.phase !== 'playing') return
  state.team.tactics = normalizeTactics(state.team.tactics)
  normalizeTeamSquad(state.team)
  recomputeTeamChemistry(state.team)
  state.screen = 'lineup'
}

export function openTactics(state: GameState): void {
  if (!state.team || !state.season) return
  state.team.tactics = normalizeTactics(state.team.tactics)
  state.screen = 'tactics'
}

export function setFormation(state: GameState, formation: Formation): void {
  if (!state.team) return
  state.team.tactics = normalizeTactics({ ...state.team.tactics, formation })
  applyFormationDefaultOrder(state.team)
}

export function setStyle(state: GameState, style: TacticalStyle): void {
  if (!state.team) return
  state.team.tactics = normalizeTactics({ ...state.team.tactics, style })
}

export function setGamePlan(state: GameState, plan: GamePlan): void {
  if (!state.team) return
  state.team.tactics = normalizeTactics({ ...state.team.tactics, plan })
}

export function setMentality(state: GameState, mentality: Mentality): void {
  if (!state.team) return
  state.team.tactics = normalizeTactics({ ...state.team.tactics, mentality })
}

export function setTacticAxis(
  state: GameState,
  key: 'width' | 'press' | 'tempo' | 'defLine' | 'buildUp',
  value: TacticAxis,
): void {
  if (!state.team) return
  state.team.tactics = normalizeTactics({ ...state.team.tactics, [key]: value })
}

/** Ustaw konkretnego zawodnika na slot XI (0–10). */
export function assignSlot(state: GameState, slotIndex: number, playerId: string): void {
  const team = state.team
  if (!team || slotIndex < 0 || slotIndex > 10) return
  const incoming = team.squad.find((p) => p.id === playerId)
  if (!incoming) return
  if ((incoming.injuryMatchesLeft ?? 0) > 0 || (incoming.suspensionMatchesLeft ?? 0) > 0) return

  const prev = team.startingIds[slotIndex]
  if (prev === playerId) return

  const benchIdx = team.benchIds.indexOf(playerId)
  const otherSlot = team.startingIds.indexOf(playerId)

  if (otherSlot >= 0) {
    team.startingIds[otherSlot] = prev!
    team.startingIds[slotIndex] = playerId
    return
  }

  if (benchIdx >= 0) {
    team.startingIds[slotIndex] = playerId
    team.benchIds[benchIdx] = prev!
    return
  }

  if (prev) team.benchIds = [prev, ...team.benchIds.filter((id) => id !== playerId)].slice(0, 7)
  team.startingIds[slotIndex] = playerId
}

export function autoPickLineup(state: GameState): void {
  if (!state.team) return
  applyFormationDefaultOrder(state.team)
}

export function confirmLineupAndPlay(state: GameState): string | null {
  if (!state.team || !state.season) return 'Brak sezonu'
  const err = validateLineup(state.team)
  if (err) return err
  // Upewnij się że kolejność slotów ma sens — nie przestawiamy przy starcie
  beginMatchday(state)
  return null
}

export function dismissMatchResult(state: GameState): void {
  const season = state.season
  if (!season) {
    state.screen = 'hub'
    return
  }
  if (season.lastMatch) {
    pushLog(state, season.lastMatch.narrative)
  }
  if (season.phase === 'done') {
    finalizeSeason(state)
    return
  }
  state.screen = 'hub'
}

export function finalizeSeason(state: GameState): void {
  const season = state.season!
  const manager = state.manager!
  const place = playerTablePosition(season)
  const row = season.standings.find((s) => s.clubId === season.clubId)
  const { promotion, relegation, nextLeagueId } = applyPromotionRelegation(
    state,
    place,
    season.leagueId,
  )

  manager.seasonsManaged += 1
  if (manager.boardTrust == null) {
    manager.boardTrust = initialBoardTrust(season.clubId, season.leagueId)
  }

  const exp = boardExpectationForClub(season.clubId, season.leagueId)
  const trustBefore = manager.boardTrust
  const { delta, summary } = boardTrustDelta(place, exp, relegation)
  manager.boardTrust = applyBoardTrust(trustBefore, delta)

  const repDelta =
    place <= 2 ? 8 : place <= 6 ? 3 : place >= season.clubIds.length - 2 ? -5 : 1
  const repBoard =
    delta >= 15 ? 4 : delta >= 5 ? 1 : delta <= -20 ? -6 : delta < 0 ? -3 : 0
  manager.reputation = Math.max(10, Math.min(99, manager.reputation + repDelta + repBoard))

  const sacked = shouldSack(manager.boardTrust)
  if (sacked) {
    manager.reputation = Math.max(10, manager.reputation - 8)
  }

  const league = getLeague(season.leagueId)
  const cupLine = cupSummaryText(season)
  const prize = state.team ? applySeasonPrize(state, place) : 0
  let narrative = `Sezon ${season.year}: ${place}. miejsce w ${league.name} (${row?.points ?? 0} pkt). `
  if (promotion) narrative += 'Awans! '
  else if (relegation) narrative += 'Spadek. '
  else narrative += 'Zostajesz w lidze. '
  if (cupLine) narrative += ` ${cupLine}`
  if (prize) narrative += ` Nagroda: ${prize.toLocaleString('pl-PL')} zł.`
  narrative += ` ${summary}`
  if (sacked) narrative += ' Zarząd zwalnia trenera.'

  const report: SeasonReport = {
    year: season.year,
    leagueId: season.leagueId,
    clubId: season.clubId,
    place,
    points: row?.points ?? 0,
    record: { ...season.record },
    promotion,
    relegation,
    narrative,
    nextLeagueId,
    boardSummary: summary,
    boardTrustBefore: trustBefore,
    boardTrustAfter: manager.boardTrust,
    boardTrustDelta: delta,
    boardGoalLabel: exp.label,
    sacked,
    cupSummary: cupLine ?? undefined,
    financeSummary: state.team
      ? `Budżet ${Math.round(state.team.budget).toLocaleString('pl-PL')} · płace ${weeklyWageBill(state.team).toLocaleString('pl-PL')}/tyg. · bilans +${Math.round(state.team.seasonIncome).toLocaleString('pl-PL')} / −${Math.round(state.team.seasonExpense).toLocaleString('pl-PL')}`
      : undefined,
  }
  state.seasonReport = report
  state.screen = 'seasonReport'
  pushLog(state, narrative)
}

export function startNextSeason(state: GameState): void {
  const manager = state.manager!
  if (state.seasonReport?.sacked || !state.team) {
    seekNewClub(state)
    return
  }
  const team = state.team
  const prev = state.season!
  const year = prev.year + 1

  // Regeneracja lekka: fitness/form reset, lekki rozwój młodych
  for (const p of team.squad) {
    p.fitness = 80 + Math.floor(Math.random() * 15)
    p.form = 48 + Math.floor(Math.random() * 16)
    if (p.age <= 24 && Math.random() < 0.45) {
      p.overall = Math.min(p.potential ?? 92, p.overall + 1)
    } else if (p.age >= 33 && Math.random() < 0.4) {
      p.overall = Math.max(32, p.overall - 1)
      if (p.potential != null) p.potential = Math.max(p.overall, p.potential - (Math.random() < 0.3 ? 1 : 0))
    }
    p.age += 1
    p.seasonApps = 0
    p.seasonGoals = 0
    p.seasonAssists = 0
    p.seasonMinutes = 0
    p.sharpness = 65 + Math.floor(Math.random() * 20)
    p.contractYears = Math.max(0, (p.contractYears ?? 1) - 1)
    p.wantsToLeave = false
    if (p.potential != null) p.overall = Math.min(p.potential, p.overall)
  }
  if (manager.lastBoardReviewRound != null) manager.lastBoardReviewRound = 0
  normalizeTeamSquad(team)
  processContractExpiries(state)
  team.seasonIncome = 0
  team.seasonExpense = 0
  normalizeTeamFinance(team)
  team.teamChemistry = Math.max(40, Math.min(70, team.teamChemistry))
  const plan = formationPlan(team.tactics.formation)
  const picked = pickDefaultLineup(team.squad, plan)
  team.startingIds = picked.startingIds
  team.benchIds = picked.benchIds

  state.season = createManagerSeason(state, manager.clubId, year)
  buildSeasonSchedule(state, state.season)
  state.season.teamChemistry = team.teamChemistry
  state.seasonReport = null
  ensureMarket(state)
  const keptAi = { ...(state.market.aiSquads ?? {}) }
  state.market.listings = []
  state.market.offers = []
  state.market.seededWeek = undefined
  state.market.aiSquads = keptAi
  for (const sq of Object.values(state.market.aiSquads)) {
    for (const p of sq) {
      normalizeSquadPlayer(p)
      p.seasonApps = 0
      p.seasonGoals = 0
      p.seasonAssists = 0
      p.seasonMinutes = 0
      p.age += 1
      p.contractYears = Math.max(0, (p.contractYears ?? 1) - 1)
      p.fitness = 80 + Math.floor(Math.random() * 15)
      p.form = 48 + Math.floor(Math.random() * 16)
      p.sharpness = 65 + Math.floor(Math.random() * 20)
      if (p.age <= 24 && Math.random() < 0.4 && p.overall < p.potential) {
        p.overall = Math.min(p.potential, p.overall + 1)
      }
    }
  }
  ensureAiSquads(state)
  if (isTransferWindowOpen(state)) onTransferWindowOpened(state)
  state.screen = 'hub'
  const league = getLeague(state.season.leagueId)
  const exp = boardExpectationForClub(manager.clubId, state.season.leagueId)
  pushLog(
    state,
    `Nowy sezon ${year} — ${getClub(manager.clubId).name} w ${league.name}. Cel: ${exp.label}.`,
  )
}

export function playNextMatchFromHub(state: GameState): string | null {
  if (!state.season || state.season.phase !== 'playing') return 'Sezon zakończony'
  if (state.season.calendar?.weeks?.length && !nextUserMatch(state.season)) {
    return canAdvanceWeek(state.season)
      ? 'Brak meczu — przejdź do następnego tygodnia w Kalendarzu'
      : 'Brak meczu w tym tygodniu'
  }
  state.screen = 'lineup'
  return null
}
