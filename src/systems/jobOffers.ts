import { getClub, getLeague, LEAGUES } from '../data/clubs'
import type { GameState, JobOffer } from '../state/types'
import { emptyMarket } from '../state/types'
import { pushLog } from '../state/gameState'
import { createManagerSeason, initClubLeagueMap } from './leagueSim'
import { buildSeasonSchedule } from './calendar'
import { createTeamState, normalizeTeamSquad } from './squadGen'
import { boardExpectationForClub, initialBoardTrust } from './board'
import { pushMail } from './mailbox'
import { pushNews, seedOpeningNews } from './news'
import { ensureAiSquads, ensureMarket, isTransferWindowOpen, onTransferWindowOpened } from './transfers'
import { playerTablePosition } from './standings'
import { ensureFanTrust } from './press'

let jobSeq = 0

/** Losowa oferta mid-season przy dobrej formie / reputacji. */
export function maybeSpawnJobOffer(state: GameState): void {
  const m = state.manager
  const season = state.season
  if (!m || !season || season.phase !== 'playing') return
  if (state.pendingJobOffer) return
  const round = season.roundIndex
  if (round < 6) return
  if (m.lastJobOfferRound != null && round - m.lastJobOfferRound < 8) return
  if (Math.random() > 0.18) return

  const place = playerTablePosition(season)
  const goodForm = place > 0 && place <= Math.max(4, Math.ceil(season.clubIds.length / 3))
  if (!goodForm && m.reputation < 55) return

  ensureMarket(state)
  const youLeague = getLeague(season.leagueId)
  const candidates = Object.entries(state.clubLeagueIds)
    .filter(([cid, lid]) => {
      if (cid === m.clubId) return false
      const lg = getLeague(lid)
      if (lg.country !== 'PL') return false
      return lg.tier <= youLeague.tier
    })
    .map(([cid]) => cid)

  const pool = candidates.length
    ? candidates
    : LEAGUES.filter((l) => l.country === 'PL')
        .flatMap((l) => l.clubIds)
        .filter((id) => id !== m.clubId)

  if (!pool.length) return
  const clubId = pool[Math.floor(Math.random() * pool.length)]!
  const leagueId = state.clubLeagueIds[clubId] ?? youLeague.id
  const club = getClub(clubId)
  jobSeq += 1
  const offer: JobOffer = {
    id: `job-${Date.now()}-${jobSeq}`,
    clubId,
    leagueId,
    message: `${club.name} zainteresowany Twoją pracą. Natychmiastowe przejęcie klubu (nowy sezon w ${getLeague(leagueId).name}).`,
    createdAt: Date.now(),
  }
  state.pendingJobOffer = offer
  m.lastJobOfferRound = round
  pushMail(state, {
    kind: 'job',
    from: club.name,
    subject: `Oferta pracy: ${club.short}`,
    body: offer.message,
    round,
    year: season.year,
  })
  pushNews(state, {
    kind: 'club',
    headline: `Plotka: ${club.short} szuka trenera`,
    body: `W kuluarach mówi się o zainteresowaniu ${club.name} osobą ${m.name}.`,
    round,
    year: season.year,
  })
}

export function rejectJobOffer(state: GameState): void {
  const offer = state.pendingJobOffer
  if (!offer) return
  pushLog(state, `Odrzucono ofertę: ${getClub(offer.clubId).short}`)
  state.pendingJobOffer = null
}

/** Soft restart: nowy klub, ten sam rok, nowa kadra/sezon. */
export function acceptJobOffer(state: GameState): string | null {
  const offer = state.pendingJobOffer
  const m = state.manager
  if (!offer || !m) return 'Brak oferty'
  if (!state.clubLeagueIds || !Object.keys(state.clubLeagueIds).length) {
    state.clubLeagueIds = initClubLeagueMap()
  }

  const clubId = offer.clubId
  const leagueId = state.clubLeagueIds[clubId] ?? offer.leagueId
  const year = state.season?.year ?? new Date().getFullYear()

  m.clubId = clubId
  m.seasonsManaged += 1
  m.reputation = Math.min(99, m.reputation + 3)
  m.boardTrust = initialBoardTrust(clubId, leagueId)
  ensureFanTrust(state)
  m.fanTrust = Math.max(0, Math.min(100, Math.round(m.boardTrust)))
  m.lastBoardReviewRound = 0
  m.lastJobOfferRound = 0
  m.matchesSincePress = 99
  const club = getClub(clubId)
  m.europaQualified = leagueId === 'liga-1' && club.stars >= 3

  state.team = createTeamState(clubId)
  normalizeTeamSquad(state.team)
  state.season = createManagerSeason(state, clubId, year)
  buildSeasonSchedule(state, state.season)
  state.season.teamChemistry = state.team.teamChemistry
  state.seasonReport = null
  state.liveMatch = null
  state.pendingPress = null
  state.pendingJobOffer = null

  ensureMarket(state)
  state.market = emptyMarket()
  ensureAiSquads(state)
  if (isTransferWindowOpen(state)) onTransferWindowOpened(state)

  const exp = boardExpectationForClub(clubId, leagueId)
  seedOpeningNews(state)
  pushMail(state, {
    kind: 'job',
    from: getClub(clubId).name,
    subject: 'Witamy w klubie',
    body: `Podpisałeś kontrakt z ${getClub(clubId).name}. Cel zarządu: ${exp.label}.`,
    year,
  })
  pushNews(state, {
    kind: 'club',
    headline: `${m.name} w ${getClub(clubId).short}`,
    body: `Oficjalnie: nowy trener ${getClub(clubId).name}.`,
    year,
  })
  pushLog(state, `Nowa praca: ${getClub(clubId).name} · ${getLeague(leagueId).name}`)
  state.screen = 'hub'
  return null
}
