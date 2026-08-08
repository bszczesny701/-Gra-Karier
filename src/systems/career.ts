import { CLUBS, getClub, getLeague, getLeagueForClub, leagueByTier } from '../data/clubs'
import { CAREER_EVENTS, pickEvent, type ChoiceEffect } from '../data/events'
import {
  clamp,
  type CreateCareerOptions,
  type GameState,
  type MatchMomentResult,
  type Player,
  type SeasonState,
  type TransferOffer,
} from '../state/types'
import { pushLog } from '../state/gameState'
import {
  applyKeyMatchToReport,
  simulateFullSeason,
} from './seasonSim'
import { playerTablePosition, sortedStandings } from './standings'
import {
  attrsFromOverall,
  calcOverall,
  moneyFromStart,
  reputationFromStart,
} from './playerFactory'

export { playerTablePosition, sortedStandings }

export function createPlayer(options: CreateCareerOptions): Player {
  const overall = clamp(options.overall, 45, 70)
  const attrs = attrsFromOverall(options.position, overall)
  const league = getLeagueForClub(options.clubId)
  const club = getClub(options.clubId)
  return {
    name: options.name.trim() || 'Zawodnik',
    age: clamp(options.age, 16, 22),
    position: options.position,
    preferredFoot: options.preferredFoot,
    overall: calcOverall(attrs, options.position),
    attrs,
    morale: 62,
    form: 52,
    reputation: reputationFromStart(overall, league.tier),
    money: moneyFromStart(overall, club.wage),
  }
}

export function createSeason(
  clubId: string,
  leagueId: string,
  year: number,
  inject: 'promote' | 'relegate' | 'none' = 'none',
): SeasonState {
  const league = getLeague(leagueId)
  let clubIds = [...league.clubIds]

  // Zostajesz w tym samym klubie przy awansie/spadku — wstawiamy go do nowej ligi
  if (!clubIds.includes(clubId)) {
    const byStrength = [...clubIds].sort(
      (a, b) => CLUBS[a]!.strength - CLUBS[b]!.strength,
    )
    const replaceId =
      inject === 'relegate'
        ? byStrength[byStrength.length - 1]!
        : byStrength[0]!
    clubIds = clubIds.map((id) => (id === replaceId ? clubId : id))
  }

  return {
    year,
    leagueId,
    clubId,
    standings: clubIds.map((id) => ({
      clubId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    })),
    preseasonDone: false,
  }
}

export function startNewCareer(state: GameState, options: CreateCareerOptions): void {
  const clubId = options.clubId
  const league = getLeagueForClub(clubId)
  state.player = createPlayer({ ...options, clubId })
  state.season = createSeason(clubId, league.id, 2026)
  state.pendingDecision = null
  state.pendingKeyMatch = null
  state.pendingKeyQueue = []
  state.seasonReport = null
  state.transferOffers = []
  state.seasonSummary = null
  state.log = []
  pushLog(
    state,
    `Start w ${getClub(clubId).name} (OVR ${state.player.overall}). Sezon symulujesz w całości.`,
  )
  state.screen = 'hub'
}

function applyEffect(player: Player, effect: ChoiceEffect): void {
  switch (effect.key) {
    case 'pace':
    case 'shooting':
    case 'passing':
    case 'defending':
    case 'stamina':
      player.attrs[effect.key] = clamp(player.attrs[effect.key] + effect.delta)
      break
    case 'morale':
      player.morale = clamp(player.morale + effect.delta, 1, 100)
      break
    case 'reputation':
      player.reputation = clamp(player.reputation + effect.delta, 0, 100)
      break
    case 'money':
      player.money = Math.max(0, player.money + effect.delta)
      break
    case 'staminaDrain':
      player.attrs.stamina = clamp(player.attrs.stamina + effect.delta)
      break
  }
  player.overall = calcOverall(player.attrs, player.position)
}

export function openPreseasonDecision(state: GameState): void {
  const player = state.player!
  const event = pickEvent(CAREER_EVENTS, player.position, player.reputation)
  state.pendingDecision = {
    eventId: event.id,
    title: event.title,
    description: event.description,
    choices: event.choices.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
    })),
  }
  state.screen = 'decision'
}

export function applyPreseasonDecision(state: GameState, choiceId: string): void {
  const player = state.player!
  const pending = state.pendingDecision
  if (!pending || !state.season) return
  const event = CAREER_EVENTS.find((e) => e.id === pending.eventId)
  const choice = event?.choices.find((c) => c.id === choiceId)
  if (!choice) return
  for (const effect of choice.effects) applyEffect(player, effect)
  pushLog(state, `Przed sezonem: ${choice.label}`)
  state.pendingDecision = null
  state.season.preseasonDone = true
  state.screen = 'hub'
}

/** Symuluje cały sezon, potem ewentualne kluczowe mecze. */
export function runFullSeason(state: GameState): void {
  const player = state.player!
  const season = state.season!
  const report = simulateFullSeason(player, season)
  state.seasonReport = report
  state.season = {
    ...season,
    standings: report.standings,
    preseasonDone: true,
  }

  if (report.keyMatchesPending.length) {
    state.pendingKeyQueue = [...report.keyMatchesPending]
    state.pendingKeyMatch = state.pendingKeyQueue.shift() ?? null
    state.screen = 'keyMatch'
    pushLog(state, `Sezon rozegrany. Kluczowe mecze: ${report.keyMatchesPending.length}.`)
  } else {
    state.pendingKeyMatch = null
    state.pendingKeyQueue = []
    state.screen = 'seasonReport'
    pushLog(state, `Sezon ${report.year} zakończony — ${report.place}. miejsce.`)
  }
}

export function resolveKeyMatch(state: GameState, moment: MatchMomentResult): void {
  const match = state.pendingKeyMatch
  const report = state.seasonReport
  const player = state.player!
  if (!match || !report) return

  applyKeyMatchToReport(report, player, moment.score, moment.action, match)
  pushLog(state, `${match.label}: akcja ${Math.round(moment.score)}%`)

  const next = state.pendingKeyQueue.shift() ?? null
  state.pendingKeyMatch = next
  if (next) {
    state.screen = 'keyMatch'
  } else {
    state.screen = 'seasonReport'
  }
}

export function generateTransferOffers(state: GameState): TransferOffer[] {
  const player = state.player!
  const report = state.seasonReport!
  const currentLeague = getLeague(report.leagueId)
  const offers: TransferOffer[] = []
  const used = new Set<string>([report.clubId])
  const form = report.formLabel

  const addFromLeague = (
    leagueId: string,
    count: number,
    msg: string,
    preferWeak = false,
  ) => {
    const league = getLeague(leagueId)
    let candidates = [...league.clubIds].filter((id) => !used.has(id))
    if (preferWeak) {
      candidates.sort((a, b) => CLUBS[a]!.strength - CLUBS[b]!.strength)
    } else {
      candidates.sort(() => Math.random() - 0.5)
    }

    for (const clubId of candidates.slice(0, count)) {
      used.add(clubId)
      const club = getClub(clubId)
      const formPenalty =
        form === 'fatalna' ? 0.55 : form === 'słaba' ? 0.75 : form === 'świetna' ? 1.15 : 1
      const wage = Math.round(
        club.wage * (0.85 + player.reputation / 220 + report.goals / 50) * formPenalty,
      )
      offers.push({
        clubId,
        wage: Math.max(400, wage),
        signingBonus: Math.round(wage * (form === 'fatalna' ? 1.2 : 2.2) + player.overall * 20),
        message: msg,
        leagueId,
      })
    }
  }

  if (form === 'fatalna' || form === 'słaba') {
    const lower = leagueByTier(currentLeague.tier + 1)
    if (lower) addFromLeague(lower.id, 2, 'Słabszy klub daje szansę na odbudowę.', true)
    addFromLeague(currentLeague.id, 2, 'Oferta z dołu tabeli / mniejszy projekt.', true)
  } else if (report.place <= 3 || report.goals >= 10 || report.cupStage === 'winner') {
    const better = leagueByTier(currentLeague.tier - 1)
    if (better) addFromLeague(better.id, 1, 'Awans sportowy — lepsza liga interesuje się Tobą.')
    addFromLeague(currentLeague.id, 2, 'Klub z Twojej ligi chce Cię wzmocnić.')
  } else if (report.place >= currentLeague.clubIds.length - 2) {
    const lower = leagueByTier(currentLeague.tier + 1)
    addFromLeague(currentLeague.id, 1, 'Oferta z ligi — nowy start.')
    if (lower) addFromLeague(lower.id, 1, 'Bezpieczny projekt w niższej lidze.', true)
    addFromLeague(currentLeague.id, 1, 'Druga oferta z ligi.')
  } else {
    addFromLeague(currentLeague.id, 2, 'Solidny sezon — kluby składają oferty.')
    const better = leagueByTier(currentLeague.tier - 1)
    if (better && (player.overall >= 60 || report.avgRating >= 7)) {
      addFromLeague(better.id, 1, 'Szansa na wyższy poziom.')
    }
  }

  while (offers.length < 2) {
    for (const l of LEAGUES_SAFE()) {
      if (offers.length >= 2) break
      addFromLeague(
        l.id,
        1,
        form === 'fatalna' || form === 'słaba'
          ? 'Jedyna realna oferta po słabym sezonie.'
          : 'Dodatkowa oferta rynkowa.',
        form === 'fatalna' || form === 'słaba',
      )
    }
    break
  }

  return offers.slice(0, 4)
}

function LEAGUES_SAFE() {
  return [getLeague('liga-3'), getLeague('liga-2'), getLeague('liga-1')]
}

export function openTransferChoice(state: GameState): void {
  state.transferOffers = generateTransferOffers(state)
  state.screen = 'transferChoice'
}

export function stayAtClub(state: GameState): void {
  const report = state.seasonReport!
  const player = state.player!

  if (!report.contractRenewed) {
    pushLog(
      state,
      `${getClub(report.clubId).name} nie przedłuża kontraktu. Musisz szukać nowego klubu.`,
    )
    player.age += 1
    openTransferChoice(state)
    return
  }

  player.age += 1
  player.money += getClub(report.clubId).wage * 3
  pushLog(state, `Zostajesz w ${getClub(report.clubId).name} na kolejny sezon.`)
  beginNextSeason(state, report.clubId, report.leagueId, true)
}

export function acceptOffer(state: GameState, clubId: string): void {
  const offer = state.transferOffers.find((o) => o.clubId === clubId)
  const player = state.player!
  if (!offer) return

  player.age += 1
  player.money += offer.signingBonus
  player.morale = clamp(player.morale + 6, 1, 100)
  player.reputation = clamp(player.reputation + 2, 0, 100)
  pushLog(state, `Transfer do ${getClub(clubId).name} (${getLeague(offer.leagueId).name}).`)
  state.transferOffers = []
  beginNextSeason(state, clubId, offer.leagueId, false)
}

function beginNextSeason(
  state: GameState,
  clubId: string,
  leagueId: string,
  staying: boolean,
): void {
  const report = state.seasonReport!
  let nextLeagueId = leagueId
  let nextClubId = clubId
  let inject: 'promote' | 'relegate' | 'none' = 'none'

  if (staying && clubId === report.clubId) {
    const league = getLeague(report.leagueId)
    if (report.promotion) {
      const up = leagueByTier(league.tier - 1)
      if (up) {
        nextLeagueId = up.id
        nextClubId = report.clubId
        inject = 'promote'
        pushLog(
          state,
          `${getClub(report.clubId).name} awansuje do ${up.name} — zostajesz w klubie.`,
        )
      }
    } else if (report.relegation) {
      const down = leagueByTier(league.tier + 1)
      if (down) {
        nextLeagueId = down.id
        nextClubId = report.clubId
        inject = 'relegate'
        pushLog(
          state,
          `${getClub(report.clubId).name} spada do ${down.name} — zostajesz w klubie.`,
        )
      }
    }
  }

  state.season = createSeason(nextClubId, nextLeagueId, report.year + 1, inject)
  state.seasonReport = null
  state.pendingKeyMatch = null
  state.pendingKeyQueue = []
  state.transferOffers = []
  state.seasonSummary = null
  state.screen = 'hub'
}

export function startNextSeason(state: GameState): void {
  // legacy alias
  if (state.seasonReport) stayAtClub(state)
  else state.screen = 'hub'
}
