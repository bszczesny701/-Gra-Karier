import {
  CLUBS,
  getClub,
  getEffectiveStrength,
  getLeague,
  getLeagueForClub,
  leagueByTier,
  pickStartingClubIds,
  STARTER_CLUB_ID,
} from '../data/clubs'
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
  appearanceChance,
  simulateFullSeason,
} from './seasonSim'
import { playerTablePosition, sortedStandings } from './standings'
import {
  applyAgingDecline,
  attrsFromOverall,
  calcOverall,
  moneyFromStart,
  reputationFromStart,
} from './playerFactory'

export { playerTablePosition, sortedStandings }

export function createPlayer(options: CreateCareerOptions): Player {
  const overall = clamp(options.overall, 45, 70)
  const attrs = attrsFromOverall(options.position, overall)
  const clubId = options.clubId ?? STARTER_CLUB_ID
  const league = getLeagueForClub(clubId)
  const club = getClub(clubId)
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
    injury: null,
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
    midTransferDone: false,
    injuryCare: 0,
  }
}

/** Szansa na grę w danym klubie (start / UI). */
export function estimatePlayChance(
  player: Player,
  clubId: string,
  strengthMods: Record<string, number> = {},
): number {
  return Math.round(appearanceChance(player, clubId, strengthMods) * 100)
}

export function generateStartingOffers(player: Player): TransferOffer[] {
  const league = getLeague('liga-3')
  return pickStartingClubIds(4).map((clubId) => {
    const club = getClub(clubId)
    const playChance = estimatePlayChance(player, clubId)
    const wage = Math.round(club.wage * (0.85 + player.overall / 200))
    return {
      clubId,
      leagueId: league.id,
      wage: Math.max(500, wage),
      signingBonus: Math.round(wage * 1.5 + player.overall * 12),
      playChance,
      message:
        playChance >= 65
          ? 'Trener liczy na Ciebie w pierwszym składzie.'
          : playChance >= 45
            ? 'Szansa na regularne minuty, jeśli pokażesz się na treningu.'
            : playChance >= 30
              ? 'Konkurencja o miejsce — start raczej z rotacji.'
              : 'Trudno o „11” — raczej ławka i wejścia z rezerw.',
    }
  })
}

/** Tworzy zawodnika i pokazuje 4 oferty z III ligi. */
export function draftNewCareer(
  state: GameState,
  options: Omit<CreateCareerOptions, 'clubId'>,
): void {
  state.player = createPlayer(options)
  state.season = null
  state.clubStrengthMods = {}
  state.pendingDecision = null
  state.pendingKeyMatch = null
  state.pendingKeyQueue = []
  state.seasonReport = null
  state.transferOffers = generateStartingOffers(state.player)
  state.seasonSummary = null
  state.log = []
  state.screen = 'startOffers'
}

export function acceptStartingOffer(state: GameState, clubId: string): void {
  const player = state.player
  const offer = state.transferOffers.find((o) => o.clubId === clubId)
  if (!player || !offer) return

  const club = getClub(clubId)
  const league = getLeague(offer.leagueId)
  player.money = moneyFromStart(player.overall, club.wage) + offer.signingBonus
  player.reputation = reputationFromStart(player.overall, league.tier)
  player.morale = clamp(player.morale + 4, 1, 100)

  state.season = createSeason(clubId, league.id, 2026)
  state.transferOffers = []
  pushLog(
    state,
    `Start w ${club.name} (III liga). Szansa na grę ≈ ${offer.playChance ?? estimatePlayChance(player, clubId)}%.`,
  )
  state.screen = 'hub'
}

/** @deprecated retained for tests — prefer draftNewCareer + acceptStartingOffer */
export function startNewCareer(state: GameState, options: CreateCareerOptions): void {
  draftNewCareer(state, options)
  const preferred = options.clubId
  const pick =
    (preferred && state.transferOffers.find((o) => o.clubId === preferred)?.clubId) ||
    state.transferOffers[0]?.clubId
  if (pick) acceptStartingOffer(state, pick)
}

function birthdayAndAge(state: GameState, player: Player): void {
  player.age += 1
  const note = applyAgingDecline(player)
  if (note) pushLog(state, note)
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
    case 'injuryCare':
      // obsługiwane w applyPreseasonDecision na sezonie
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
    speaker: event.speaker,
    speakerRole: event.speakerRole,
    messages: event.messages,
    description: event.messages.join(' '),
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
  for (const effect of choice.effects) {
    if (effect.key === 'injuryCare') {
      state.season.injuryCare = clamp(
        (state.season.injuryCare ?? 0) + effect.delta,
        0,
        5,
      )
    } else {
      applyEffect(player, effect)
    }
  }
  const care = state.season.injuryCare ?? 0
  pushLog(
    state,
    `${pending.speaker}: odpowiedź — „${choice.label}”${care > 0 ? ` · ochrona przed urazem ${care}/5` : ''}`,
  )
  state.pendingDecision = null
  state.season.preseasonDone = true
  state.screen = 'hub'
}

/** Symuluje cały sezon, potem ewentualne kluczowe mecze. */
export function runFullSeason(state: GameState): void {
  const player = state.player!
  const season = state.season!
  const report = simulateFullSeason(player, season, state.clubStrengthMods ?? {})
  state.seasonReport = report
  state.season = {
    ...season,
    standings: report.standings,
    preseasonDone: true,
    midTransferDone: true,
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
  return buildOffersForPlayer(player, report.clubId, currentLeague, {
    goals: report.goals,
    form: report.formLabel,
    place: report.place,
    avgRating: report.avgRating,
    cupBoost: report.cupStage === 'winner' || report.cupStage === 'final',
    forceHigher: player.overall >= ovrThresholdForTier(currentLeague.tier - 1),
  })
}

/** Oferty w trakcie sezonu — głównie wyższe ligi przy wysokim OVR. */
export function generateMidSeasonOffers(state: GameState): TransferOffer[] {
  const player = state.player!
  const season = state.season!
  const currentLeague = getLeague(season.leagueId)
  const higher = leagueByTier(currentLeague.tier - 1)
  if (!higher) return []
  if (player.overall < ovrThresholdForTier(higher.tier)) return []

  return buildOffersForPlayer(player, season.clubId, currentLeague, {
    goals: 0,
    form: 'przyzwoita',
    place: Math.ceil(currentLeague.clubIds.length / 2),
    avgRating: 6.5,
    cupBoost: false,
    forceHigher: true,
    midSeason: true,
  })
}

function ovrThresholdForTier(tier: number): number {
  if (tier <= 1) return 64
  if (tier === 2) return 56
  if (tier === 3) return 50
  return 46
}

function buildOffersForPlayer(
  player: Player,
  currentClubId: string,
  currentLeague: ReturnType<typeof getLeague>,
  ctx: {
    goals: number
    form: string
    place: number
    avgRating: number
    cupBoost: boolean
    forceHigher: boolean
    midSeason?: boolean
  },
): TransferOffer[] {
  const offers: TransferOffer[] = []
  const used = new Set<string>([currentClubId])
  const form = ctx.form

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
    } else if (ctx.midSeason || ctx.forceHigher) {
      // Najpierw kluby, gdzie realnie zagrasz (słabsze w lidze)
      candidates.sort((a, b) => {
        const ga = player.overall - CLUBS[a]!.strength
        const gb = player.overall - CLUBS[b]!.strength
        return gb - ga
      })
    } else {
      candidates.sort(() => Math.random() - 0.5)
    }

    for (const clubId of candidates.slice(0, count)) {
      used.add(clubId)
      const club = getClub(clubId)
      const formPenalty =
        form === 'fatalna' ? 0.55 : form === 'słaba' ? 0.75 : form === 'świetna' ? 1.15 : 1
      const wage = Math.round(
        club.wage * (0.85 + player.reputation / 220 + ctx.goals / 50) * formPenalty,
      )
      const playChance = estimatePlayChance(player, clubId, {})
      offers.push({
        clubId,
        wage: Math.max(400, wage),
        signingBonus: Math.round(
          wage * (form === 'fatalna' ? 1.2 : ctx.midSeason ? 1.8 : 2.2) + player.overall * 20,
        ),
        message: `${msg} Szansa na grę ≈ ${playChance}%.`,
        leagueId,
        playChance,
      })
    }
  }

  const higher = leagueByTier(currentLeague.tier - 1)
  const lower = leagueByTier(currentLeague.tier + 1)

  if (ctx.midSeason) {
    if (higher) addFromLeague(higher.id, 2, 'Okno transferowe — wyższa liga chce Cię już teraz.')
    addFromLeague(currentLeague.id, 1, 'Klub z ligi składa ofertę w trakcie sezonu.')
    return offers.slice(0, 3)
  }

  if (form === 'fatalna' || form === 'słaba') {
    if (lower) addFromLeague(lower.id, 2, 'Słabszy klub daje szansę na odbudowę.', true)
    addFromLeague(currentLeague.id, 2, 'Oferta z dołu tabeli / mniejszy projekt.', true)
  } else {
    // Silny OVR / dobry sezon → wyższe ligi
    if (higher && (ctx.forceHigher || ctx.cupBoost || ctx.place <= 3 || ctx.goals >= 8 || player.overall >= ovrThresholdForTier(higher.tier))) {
      addFromLeague(higher.id, 2, 'Wyższa liga interesuje się Tobą.')
      const top = leagueByTier(higher.tier - 1)
      if (top && player.overall >= ovrThresholdForTier(top.tier) + 2) {
        addFromLeague(top.id, 1, 'Skok o dwie ligi — odważny projekt.')
      }
    }
    addFromLeague(currentLeague.id, 2, 'Klub z Twojej ligi chce Cię wzmocnić.')
    if (ctx.place >= currentLeague.clubIds.length - 2 && lower) {
      addFromLeague(lower.id, 1, 'Bezpieczny projekt w niższej lidze.', true)
    }
  }

  while (offers.length < 2) {
    for (const l of LEAGUES_SAFE()) {
      if (offers.length >= 2) break
      addFromLeague(l.id, 1, 'Dodatkowa oferta rynkowa.', form === 'fatalna' || form === 'słaba')
    }
    break
  }

  return offers.slice(0, 4)
}

function LEAGUES_SAFE() {
  return [getLeague('liga-3'), getLeague('liga-ii'), getLeague('liga-2'), getLeague('liga-1')]
}

export function openTransferChoice(state: GameState): void {
  state.transferOffers = generateTransferOffers(state)
  state.screen = 'transferChoice'
}

export function openMidSeasonTransfers(state: GameState): void {
  if (!state.season || state.season.midTransferDone) return
  const offers = generateMidSeasonOffers(state)
  if (!offers.length) {
    pushLog(state, 'Brak ofert w oknie transferowym — za niski OVR na wyższą ligę.')
    return
  }
  state.transferOffers = offers
  state.screen = 'transferChoice'
}

export function hasMidSeasonOffers(state: GameState): boolean {
  if (!state.player || !state.season || state.season.midTransferDone) return false
  return generateMidSeasonOffers(state).length > 0
}

/** Transfer w trakcie sezonu — bez urodzin, sezon kontynuujesz w nowym klubie. */
export function acceptMidSeasonOffer(state: GameState, clubId: string): void {
  const offer = state.transferOffers.find((o) => o.clubId === clubId)
  const player = state.player!
  const season = state.season!
  if (!offer || !season) return

  player.money += offer.signingBonus
  player.morale = clamp(player.morale + 5, 1, 100)
  player.reputation = clamp(player.reputation + 3, 0, 100)

  const next = createSeason(clubId, offer.leagueId, season.year, 'none')
  next.preseasonDone = true
  next.midTransferDone = true
  state.season = next
  state.transferOffers = []
  state.seasonReport = null
  pushLog(
    state,
    `Transfer w trakcie sezonu → ${getClub(clubId).name} (${getLeague(offer.leagueId).name}). Szansa na grę ≈ ${offer.playChance ?? estimatePlayChance(player, clubId)}%.`,
  )
  state.screen = 'hub'
}

export function declineMidSeasonTransfers(state: GameState): void {
  if (state.season) state.season.midTransferDone = true
  state.transferOffers = []
  pushLog(state, 'Zostajesz w klubie — okno transferowe zamknięte.')
  state.screen = 'hub'
}

export function stayAtClub(state: GameState): void {
  const report = state.seasonReport!
  const player = state.player!

  if (!report.contractRenewed) {
    pushLog(
      state,
      `${getClub(report.clubId).name} nie przedłuża kontraktu. Musisz szukać nowego klubu.`,
    )
    openTransferChoice(state)
    return
  }

  birthdayAndAge(state, player)
  player.money += getClub(report.clubId).wage * 3
  beginNextSeason(state, report.clubId, report.leagueId, true)
}

export function acceptOffer(state: GameState, clubId: string): void {
  // Transfer w trakcie sezonu (brak raportu / flaga)
  if (state.season && !state.seasonReport) {
    acceptMidSeasonOffer(state, clubId)
    return
  }

  const offer = state.transferOffers.find((o) => o.clubId === clubId)
  const player = state.player!
  if (!offer) return

  birthdayAndAge(state, player)
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
  if (!state.clubStrengthMods) state.clubStrengthMods = {}

  if (staying && clubId === report.clubId) {
    const league = getLeague(report.leagueId)
    if (report.promotion) {
      const up = leagueByTier(league.tier - 1)
      if (up) {
        nextLeagueId = up.id
        nextClubId = report.clubId
        inject = 'promote'
        // Awans = klub mocniejszy (głębsza ławka, wyższe wymagania)
        const bump = up.tier === 1 ? 10 : up.tier === 2 ? 8 : 7
        state.clubStrengthMods[report.clubId] =
          (state.clubStrengthMods[report.clubId] ?? 0) + bump

        const playPct = estimatePlayChance(
          state.player!,
          report.clubId,
          state.clubStrengthMods,
        )
        const eff = getEffectiveStrength(report.clubId, state.clubStrengthMods)
        pushLog(
          state,
          `${getClub(report.clubId).name} awansuje do ${up.name} (siła składu ↑ do ~${eff}).`,
        )

        // Za słaby na nową ligę — klub nie chce Cię brać wyżej
        if (playPct < 28 || state.player!.overall + 3 < eff - 4) {
          pushLog(
            state,
            `Sztab: przy OVR ${state.player!.overall} i szansie ~${playPct}% nie widzą Cię w ${up.name}. Musisz szukać klubu.`,
          )
          state.seasonReport = {
            ...report,
            contractRenewed: false,
            contractNote: 'Po awansie klub nie bierze Cię do wyższej ligi — za niski poziom.',
          }
          openTransferChoice(state)
          return
        }
      }
    } else if (report.relegation) {
      const down = leagueByTier(league.tier + 1)
      if (down) {
        nextLeagueId = down.id
        nextClubId = report.clubId
        inject = 'relegate'
        state.clubStrengthMods[report.clubId] = Math.max(
          -6,
          (state.clubStrengthMods[report.clubId] ?? 0) - 5,
        )
        pushLog(
          state,
          `${getClub(report.clubId).name} spada do ${down.name} — zostajesz w klubie.`,
        )
      }
    } else {
      pushLog(state, `Zostajesz w ${getClub(report.clubId).name} na kolejny sezon.`)
    }
  }

  // Wylecz drobne kontuzje między sezonami (sezonowe też reset)
  if (state.player) state.player.injury = null

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
