import {
  CLUBS,
  foreignTopLeagues,
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
  shouldRetire,
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
  describeRival,
  makeRival,
  matchAppearanceChance,
} from './seasonSim'
import {
  buildWinterSnapshotFromLive,
  finalizeMatchdaySeason,
  initSeasonMatchdayFields,
  nextPlayerFixture,
  playNextMatchday,
  resolveGoalMoment,
  startSeasonCalendar,
} from './matchday'
import { playerTablePosition, sortedStandings } from './standings'
import {
  applyAgingDecline,
  attrsFromOverall,
  calcOverall,
  moneyFromStart,
  reputationFromStart,
} from './playerFactory'

export { playerTablePosition, sortedStandings }

function trackClub(player: Player, clubId: string): void {
  if (!player.clubsPlayed.includes(clubId)) player.clubsPlayed.push(clubId)
}

function bumpPeak(player: Player): void {
  if (player.overall > player.peakOverall) player.peakOverall = player.overall
}

export function createPlayer(options: CreateCareerOptions): Player {
  const overall = clamp(options.overall, 45, 70)
  const attrs = attrsFromOverall(options.position, overall)
  const clubId = options.clubId ?? STARTER_CLUB_ID
  const league = getLeagueForClub(clubId)
  const club = getClub(clubId)
  const ovr = calcOverall(attrs, options.position)
  return {
    name: options.name.trim() || 'Zawodnik',
    age: clamp(options.age, 16, 22),
    position: options.position,
    preferredFoot: options.preferredFoot,
    overall: ovr,
    attrs,
    morale: 62,
    form: 52,
    reputation: reputationFromStart(overall, league.tier),
    money: moneyFromStart(overall, club.wage),
    injury: null,
    contract: { clubId, yearsLeft: 2, wage: Math.max(500, club.wage) },
    loan: null,
    peakOverall: ovr,
    clubsPlayed: [],
    seasonsPlayed: 0,
    titles: 0,
    retired: false,
  }
}

export function createSeason(
  clubId: string,
  leagueId: string,
  year: number,
  inject: 'promote' | 'relegate' | 'none' = 'none',
  strengthMods: Record<string, number> = {},
  playerOverall = 50,
): SeasonState {
  const league = getLeague(leagueId)
  let clubIds = [...league.clubIds]

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

  const season: SeasonState = {
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
    rival: makeRival(clubId, year, strengthMods),
    rivalPressure: 0,
    phase: 'playing',
    halfStats: null,
    fixtures: [],
    fixtureIndex: 0,
    matchMood: 50,
    liveStats: {
      appearances: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      matchesMissedInjury: 0,
      injuryLabels: [],
      appsThisSeason: 0,
      injuryAtApp: -1,
      overallBefore: playerOverall,
      fixturesForPlayer: 0,
      scorerEntries: [],
    },
    lastMatch: null,
    pendingGoalMoment: null,
    winterBreakTaken: false,
    cupAlive: true,
    cupFurthest: 'out',
    cupRoundIndex: 0,
    cupLeagueMatchesDone: 0,
    pendingCup: null,
    cupPlayedLive: false,
    winterDecisionDone: false,
    rivalLastComment: null,
  }
  initSeasonMatchdayFields(season, playerOverall)
  return season
}

export function estimatePlayChance(
  player: Player,
  clubId: string,
  strengthMods: Record<string, number> = {},
  season?: SeasonState | null,
): number {
  if (season) {
    return Math.round(
      matchAppearanceChance(
        player,
        season.matchMood,
        clubId,
        strengthMods,
        season.rival,
        season.rivalPressure ?? 0,
      ) * 100,
    )
  }
  return Math.round(
    appearanceChance(player, clubId, strengthMods, null, 0) * 100,
  )
}

function contractYearsForOffer(leagueId: string, kind: 'transfer' | 'loan' = 'transfer'): number {
  if (kind === 'loan') return 0
  const tier = getLeague(leagueId).tier
  if (tier === 1) return Math.random() < 0.55 ? 3 : 2
  if (tier === 2) return Math.random() < 0.45 ? 3 : 2
  if (tier === 3) return 2
  return 2
}

export function generateStartingOffers(player: Player): TransferOffer[] {
  return pickStartingClubIds(4).map((clubId) => {
    const club = getClub(clubId)
    const league = getLeagueForClub(clubId)
    const playChance = estimatePlayChance(player, clubId)
    const wage = Math.round(club.wage * (0.85 + player.overall / 200))
    const years = league.tier === 3 ? 2 : 2
    return {
      clubId,
      leagueId: league.id,
      wage: Math.max(500, wage),
      signingBonus: Math.round(wage * 1.5 + player.overall * 12),
      playChance,
      kind: 'transfer' as const,
      contractYears: years,
      message:
        playChance >= 65
          ? `Trener liczy na Ciebie w pierwszym składzie. Kontrakt ${years} lata.`
          : playChance >= 45
            ? `Szansa na regularne minuty. Kontrakt ${years} lata.`
            : playChance >= 30
              ? `Konkurencja o miejsce — start z rotacji. Kontrakt ${years} lata.`
              : `Raczej ławka. Kontrakt ${years} lata.`,
    }
  })
}

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
  state.winterSnapshot = null
  state.careerSummary = null
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
  player.contract = {
    clubId,
    yearsLeft: offer.contractYears ?? 2,
    wage: offer.wage,
  }
  player.loan = null
  trackClub(player, clubId)
  bumpPeak(player)

  state.season = createSeason(
    clubId,
    league.id,
    2026,
    'none',
    state.clubStrengthMods ?? {},
    player.overall,
  )
  state.transferOffers = []
  pushLog(
    state,
    `Start w ${club.name} (${league.name}). Kontrakt ${player.contract.yearsLeft} lata. Szansa ≈ ${offer.playChance ?? estimatePlayChance(player, clubId)}%.`,
  )
  state.screen = 'hub'
}

export function startNewCareer(state: GameState, options: CreateCareerOptions): void {
  draftNewCareer(state, options)
  const preferred = options.clubId
  const pick =
    (preferred && state.transferOffers.find((o) => o.clubId === preferred)?.clubId) ||
    state.transferOffers[0]?.clubId
  if (pick) acceptStartingOffer(state, pick)
}

function finishCareer(state: GameState, reason: string): void {
  const player = state.player!
  player.retired = true
  state.careerSummary = {
    name: player.name,
    seasonsPlayed: player.seasonsPlayed,
    peakOverall: player.peakOverall,
    clubsCount: player.clubsPlayed.length,
    titles: player.titles,
    finalAge: player.age,
    finalOverall: player.overall,
    narrative: `${reason} Kariera: ${player.seasonsPlayed} sezonów, szczyt OVR ${player.peakOverall}, ${player.clubsPlayed.length} klubów, tytułów: ${player.titles}.`,
  }
  state.season = null
  state.seasonReport = null
  state.winterSnapshot = null
  state.transferOffers = []
  state.pendingDecision = null
  state.pendingKeyMatch = null
  state.pendingKeyQueue = []
  state.screen = 'careerEnd'
  pushLog(state, `Koniec kariery: ${reason}`)
}

function birthdayAndAge(state: GameState, player: Player): boolean {
  player.age += 1
  const note = applyAgingDecline(player)
  if (note) pushLog(state, note)
  bumpPeak(player)
  if (shouldRetire(player)) {
    finishCareer(state, `W wieku ${player.age} lat (OVR ${player.overall}) kończysz karierę.`)
    return true
  }
  return false
}

function applyEffect(player: Player, effect: ChoiceEffect): void {
  const before = player.overall
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
    case 'rivalPressure':
      break
  }
  player.overall = calcOverall(player.attrs, player.position)

  const attrKey =
    effect.key === 'staminaDrain'
      ? 'stamina'
      : effect.key === 'pace' ||
          effect.key === 'shooting' ||
          effect.key === 'passing' ||
          effect.key === 'defending' ||
          effect.key === 'stamina'
        ? effect.key
        : null
  // Max ±1 OVR z jednego efektu decyzji
  if (attrKey && Math.abs(player.overall - before) > 1) {
    let guard = 0
    while (Math.abs(player.overall - before) > 1 && guard < 20) {
      player.attrs[attrKey] = clamp(
        player.attrs[attrKey] - Math.sign(player.overall - before),
      )
      player.overall = calcOverall(player.attrs, player.position)
      guard++
    }
  }
  bumpPeak(player)
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
    source: 'preseason',
    choices: event.choices.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
    })),
  }
  state.screen = 'decision'
}

export function openWinterDecision(state: GameState): void {
  if (!state.season || state.season.winterDecisionDone) return
  const player = state.player!
  const event = pickEvent(CAREER_EVENTS, player.position, player.reputation)
  state.pendingDecision = {
    eventId: event.id,
    title: event.title,
    speaker: event.speaker,
    speakerRole: event.speakerRole,
    messages: event.messages,
    description: event.messages.join(' '),
    source: 'winter',
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
      state.season.injuryCare = clamp((state.season.injuryCare ?? 0) + effect.delta, 0, 5)
    } else if (effect.key === 'rivalPressure') {
      state.season.rivalPressure = clamp(
        (state.season.rivalPressure ?? 0) + effect.delta,
        -3,
        3,
      )
    } else {
      applyEffect(player, effect)
    }
  }
  const care = state.season.injuryCare ?? 0
  pushLog(
    state,
    `${pending.speaker}: „${choice.label}”${care > 0 ? ` · ochrona urazu ${care}/5` : ''}${
      state.season.rivalPressure ? ` · rywal ${state.season.rivalPressure > 0 ? '+' : ''}${state.season.rivalPressure}` : ''
    }`,
  )
  state.pendingDecision = null
  if (pending.source === 'winter') {
    state.season.winterDecisionDone = true
    state.screen = 'winterBreak'
    return
  }
  state.season.preseasonDone = true
  // Kotwica OVR sezonu = po decyzji przygotowawczej (wzrost ±4 liczony od tego)
  if (state.season.liveStats) {
    state.season.liveStats.overallBefore = player.overall
  }
  state.screen = 'hub'
}

function applyMatchdayOutcome(state: GameState, outcome: ReturnType<typeof playNextMatchday>): void {
  const player = state.player!
  const season = state.season!

  if (outcome.kind === 'goalMoment') {
    const pending = season.pendingGoalMoment!
    state.pendingKeyMatch = {
      homeId: pending.homeId,
      awayId: pending.awayId,
      opponentId: pending.opponentId,
      reason: 'title',
      label: pending.label,
      description: pending.description,
      stake: 'leaguePoints',
    }
    state.screen = 'keyMatch'
    pushLog(state, `Okazja bramkowa vs ${getClub(pending.opponentId).name}!`)
    return
  }

  if (outcome.kind === 'winter') {
    state.winterSnapshot = outcome.snapshot
    state.season = { ...season, phase: 'winterDone', midTransferDone: true }
    state.screen = 'winterBreak'
    pushLog(
      state,
      `Przerwa zimowa: ${outcome.snapshot.place}. miejsce, ${outcome.snapshot.appearances} meczów, ${outcome.snapshot.goals} G. ${outcome.snapshot.rivalNote}`,
    )
    return
  }

  if (outcome.kind === 'seasonDone') {
    const report = outcome.report
    state.seasonReport = report
    state.winterSnapshot = null
    state.season = {
      ...season,
      standings: report.standings,
      phase: 'done',
      halfStats: null,
      preseasonDone: true,
      midTransferDone: true,
    }
    player.seasonsPlayed += 1
    bumpPeak(player)
    trackClub(player, report.clubId)
    if (report.title) player.titles += 1
    state.pendingKeyMatch = null
    state.pendingKeyQueue = []
    state.screen = 'seasonReport'
    pushLog(state, `Sezon ${report.year} — ${report.place}. miejsce.`)
    return
  }

  // matchResult
  state.screen = 'matchResult'
  const m = outcome.match
  const home = getClub(m.homeId).short
  const away = getClub(m.awayId).short
  pushLog(state, `${home} ${m.homeGoals}:${m.awayGoals} ${away} — ${m.narrative}`)
}

/** Hub: kolejny mecz Twojego klubu (+ tło kolejki). */
export function playCareerMatchday(state: GameState): void {
  const player = state.player!
  const season = state.season!
  const outcome = playNextMatchday(player, season, state.clubStrengthMods ?? {})
  applyMatchdayOutcome(state, outcome)
}

/** Po ekranie wyniku meczu. */
export function dismissMatchResult(state: GameState): void {
  const player = state.player!
  const season = state.season!
  if (season.phase === 'winterDone' && !state.winterSnapshot) {
    const snapshot = buildWinterSnapshotFromLive(player, season)
    state.winterSnapshot = snapshot
    season.midTransferDone = true
    state.screen = 'winterBreak'
    pushLog(
      state,
      `Przerwa zimowa: ${snapshot.place}. miejsce, ${snapshot.appearances} meczów, ${snapshot.goals} G. ${snapshot.rivalNote}`,
    )
    return
  }
  if (!nextPlayerFixture(season) && season.phase !== 'winterDone') {
    const report = finalizeMatchdaySeason(player, season, state.clubStrengthMods ?? {})
    applyMatchdayOutcome(state, { kind: 'seasonDone', report })
    return
  }
  state.screen = 'hub'
}

/** Legacy aliases — hub woła playCareerMatchday. */
export function runFullSeason(state: GameState): void {
  playCareerMatchday(state)
}

export function runFirstHalf(state: GameState): void {
  playCareerMatchday(state)
}

export function runSecondHalf(state: GameState): void {
  playCareerMatchday(state)
}

export function continueAfterWinter(state: GameState): void {
  const season = state.season!
  season.phase = 'playing'
  season.winterBreakTaken = true
  state.winterSnapshot = null
  state.screen = 'hub'
  pushLog(state, 'Koniec przerwy zimowej — wracasz do gry.')
}

export function resolveKeyMatch(state: GameState, moment: MatchMomentResult): void {
  const player = state.player!
  const season = state.season

  if (season?.pendingGoalMoment) {
    const outcome = resolveGoalMoment(
      player,
      season,
      moment.score,
      state.clubStrengthMods ?? {},
    )
    state.pendingKeyMatch = null
    applyMatchdayOutcome(state, outcome)
    return
  }

  const match = state.pendingKeyMatch
  const report = state.seasonReport
  if (!match || !report) return

  applyKeyMatchToReport(report, player, moment.score, moment.action, match)
  pushLog(state, `${match.label}: akcja ${Math.round(moment.score)}%`)

  const next = state.pendingKeyQueue.shift() ?? null
  state.pendingKeyMatch = next
  if (next) state.screen = 'keyMatch'
  else state.screen = 'seasonReport'
}

export function generateTransferOffers(state: GameState): TransferOffer[] {
  const player = state.player!
  const report = state.seasonReport!
  const currentLeague = getLeague(report.leagueId)
  const playPct = estimatePlayChance(player, report.clubId, state.clubStrengthMods ?? {})
  const willSell = clubWillSell(
    player,
    playPct,
    report.formLabel,
    report.avgRating,
    report.contractRenewed,
  )

  const offers: TransferOffer[] = []
  if (willSell) {
    offers.push(
      ...buildOffersForPlayer(player, report.clubId, currentLeague, {
        goals: report.goals,
        form: report.formLabel,
        place: report.place,
        avgRating: report.avgRating,
        cupBoost: report.cupStage === 'winner' || report.cupStage === 'final',
        forceHigher: player.overall >= ovrThresholdForTier(currentLeague.tier - 1),
      }),
    )
  } else {
    pushLog(
      state,
      `${getClub(report.clubId).name} nie chce Cię sprzedać (forma/minuty). Zostaje wypożyczenie albo przedłużenie.`,
    )
  }
  if (playPct < 30 || !report.contractRenewed || !willSell) {
    offers.push(...generateLoanOffers(state, report.clubId, currentLeague.id, false))
  }
  return dedupeOffers(offers).slice(0, 5)
}

export function generateMidSeasonOffers(state: GameState): TransferOffer[] {
  const player = state.player!
  const season = state.season!
  const currentLeague = getLeague(season.leagueId)
  const higher = leagueByTier(currentLeague.tier - 1, currentLeague.country)
  const form = formLabelFromPlayer(player, season.matchMood)
  const place =
    state.winterSnapshot?.place ??
    (() => {
      try {
        return playerTablePosition(season)
      } catch {
        return Math.ceil(currentLeague.clubIds.length / 2)
      }
    })()
  const avgRating =
    state.winterSnapshot?.avgRating ??
    (season.liveStats.appearances
      ? Math.round((season.liveStats.ratingSum / season.liveStats.appearances) * 10) / 10
      : 6.5)
  const goals = state.winterSnapshot?.goals ?? season.liveStats.goals
  const playPct = estimatePlayChance(player, season.clubId, state.clubStrengthMods ?? {}, season)
  const willSell = clubWillSell(player, playPct, form, avgRating, true)

  const offers: TransferOffer[] = []
  if (willSell) {
    const forceHigher =
      (higher && player.overall >= ovrThresholdForTier(higher.tier) && avgRating >= 6.8) ||
      (currentLeague.tier <= 1 && player.overall >= ovrThresholdForTier(0) && avgRating >= 7.0)
    offers.push(
      ...buildOffersForPlayer(player, season.clubId, currentLeague, {
        goals,
        form,
        place,
        avgRating,
        cupBoost: season.cupFurthest === 'sf' || season.cupFurthest === 'final' || season.cupFurthest === 'winner',
        forceHigher: Boolean(forceHigher),
        midSeason: true,
      }),
    )
  } else {
    pushLog(
      state,
      `${getClub(season.clubId).name} blokuje transfer zimą — możesz szukać wypożyczenia.`,
    )
  }

  if (playPct < 35 || !willSell) {
    offers.push(...generateLoanOffers(state, season.clubId, season.leagueId, true))
  }

  return dedupeOffers(offers).slice(0, 4)
}

export function generateLoanOffers(
  state: GameState,
  currentClubId: string,
  currentLeagueId: string,
  winter: boolean,
): TransferOffer[] {
  const player = state.player!
  if (player.loan) return []
  const currentLeague = getLeague(currentLeagueId)
  const lower = leagueByTier(currentLeague.tier + 1, currentLeague.country)
  const targets: string[] = []
  const pool = [
    ...currentLeague.clubIds.filter((id) => id !== currentClubId),
    ...(lower?.clubIds ?? []),
  ]
  const sorted = [...pool].sort((a, b) => {
    const ga = player.overall - CLUBS[a]!.strength
    const gb = player.overall - CLUBS[b]!.strength
    return gb - ga
  })
  for (const id of sorted) {
    const pct = estimatePlayChance(player, id, state.clubStrengthMods ?? {})
    if (pct >= 40) {
      targets.push(id)
      if (targets.length >= 2) break
    }
  }
  return targets.map((clubId) => {
    const club = getClub(clubId)
    const league = getLeagueForClub(clubId)
    const playChance = Math.min(78, estimatePlayChance(player, clubId, state.clubStrengthMods ?? {}) + 12)
    const wage = Math.round(club.wage * 0.75)
    const buyOption = Math.random() < 0.42
    const buyOptionFee = buyOption
      ? Math.round(wage * 28 + player.overall * 90 + (winter ? 400 : 900))
      : undefined
    return {
      clubId,
      leagueId: league.id,
      wage,
      signingBonus: Math.round(wage * 0.8),
      playChance,
      kind: 'loan' as const,
      contractYears: 0,
      buyOption,
      buyOptionFee,
      message: winter
        ? `Wypożyczenie do końca sezonu. Więcej minut (≈${playChance}%)${
            buyOption ? ` · opcja wykupu ~${buyOptionFee} zł` : ''
          }. Wracasz do ${getClub(currentClubId).name}.`
        : `Wypożyczenie na sezon. Szansa gry ≈${playChance}%${
            buyOption ? ` · opcja wykupu ~${buyOptionFee} zł` : ''
          }. Kontrakt z ${getClub(currentClubId).name} zostaje.`,
    }
  })
}

function dedupeOffers(offers: TransferOffer[]): TransferOffer[] {
  const seen = new Set<string>()
  const out: TransferOffer[] = []
  for (const o of offers) {
    const key = `${o.kind ?? 'transfer'}:${o.clubId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}

function formLabelFromPlayer(player: Player, matchMood?: number): string {
  const f = matchMood != null ? Math.round(player.form * 0.4 + matchMood * 0.6) : player.form
  if (f >= 72) return 'świetna'
  if (f >= 62) return 'dobra'
  if (f >= 48) return 'przyzwoita'
  if (f >= 38) return 'słaba'
  return 'fatalna'
}

/** Czy obecny klub wypuszcza zawodnika (transfer). Słaba forma / ławka = łatwiej. */
function clubWillSell(
  player: Player,
  playPct: number,
  form: string,
  avgRating: number,
  contractRenewed: boolean,
): boolean {
  if (player.contract.yearsLeft <= 1 && !contractRenewed) return true
  if (playPct < 32 || form === 'fatalna' || (avgRating > 0 && avgRating < 5.7)) return true
  if (playPct >= 58 && (form === 'świetna' || avgRating >= 7.2)) {
    return Math.random() < 0.22 // gwiazda — rzadko
  }
  if (playPct >= 48 && form === 'dobra' && avgRating >= 6.8) {
    return Math.random() < 0.45
  }
  return Math.random() < 0.72
}

function ovrThresholdForTier(tier: number): number {
  if (tier <= 0) return 72 // zagranica — dopiero przy solidnym OVR
  if (tier === 1) return 64
  if (tier === 2) return 56
  if (tier === 3) return 50
  return 46
}

/** Czy klub zagraniczny / top w ogóle zainteresuje się zawodnikiem (lepszy klub = wyższy próg). */
function meetsClubOfferBar(player: Player, clubId: string): boolean {
  const club = getClub(clubId)
  const league = getLeagueForClub(clubId)
  // Polska — bez twardego filtra klubowego (liga i tak ogranicza %)
  if (league.tier > 0) return true
  // Zagranica: min ~72, a elita dużo wyżej
  if (player.overall < 72) return false
  if (club.strength >= 92) return player.overall >= 84 // City / Real / Inter-level
  if (club.strength >= 88) return player.overall >= 80
  if (club.strength >= 84) return player.overall >= 77
  if (club.strength >= 80) return player.overall >= 75
  if (club.strength >= 76) return player.overall >= 73
  return player.overall >= 72
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
    let candidates = [...league.clubIds].filter(
      (id) => !used.has(id) && meetsClubOfferBar(player, id),
    )
    if (!candidates.length) return

    if (preferWeak) {
      candidates.sort((a, b) => CLUBS[a]!.strength - CLUBS[b]!.strength)
    } else if (ctx.midSeason || ctx.forceHigher || league.tier <= 0) {
      // Zagranica / awans: najpierw kluby, do których OVR realnie pasuje
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
      const years = contractYearsForOffer(leagueId)
      offers.push({
        clubId,
        wage: Math.max(400, wage),
        signingBonus: Math.round(
          wage * (form === 'fatalna' ? 1.2 : ctx.midSeason ? 1.8 : 2.2) + player.overall * 20,
        ),
        message: `${msg} Kontrakt ${years} lat. Szansa ≈ ${playChance}%.`,
        leagueId,
        playChance,
        kind: 'transfer',
        contractYears: years,
      })
    }
  }

  const higher = leagueByTier(currentLeague.tier - 1, currentLeague.country)
  const lower = leagueByTier(currentLeague.tier + 1, currentLeague.country)
  const canGoAbroad = player.overall >= ovrThresholdForTier(0)

  if (ctx.midSeason) {
    const hot = ctx.avgRating >= 7.0 || form === 'świetna' || form === 'dobra'
    const cold =
      (ctx.avgRating > 0 && ctx.avgRating < 6.0) || form === 'słaba' || form === 'fatalna'
    if (higher && player.overall >= ovrThresholdForTier(higher.tier) && hot && !cold) {
      addFromLeague(higher.id, 2, 'Okno zimowe — wyższa liga (forma/oceny).')
    }
    if (canGoAbroad && currentLeague.tier <= 1 && ctx.avgRating >= 6.8 && player.overall >= 72) {
      for (const fl of foreignTopLeagues()) {
        addFromLeague(fl.id, 1, `${fl.name} — zainteresowanie zimą.`)
      }
    }
    addFromLeague(currentLeague.id, cold ? 2 : 1, 'Oferta z ligi w trakcie sezonu.', cold)
    if (lower && (cold || ctx.place >= currentLeague.clubIds.length - 3)) {
      addFromLeague(lower.id, 1, 'Niższa liga — więcej minut.', true)
    }
    return offers.slice(0, 4)
  }

  if (form === 'fatalna' || form === 'słaba' || (ctx.avgRating > 0 && ctx.avgRating < 5.9)) {
    if (lower) addFromLeague(lower.id, 2, 'Słabszy klub — odbudowa.', true)
    addFromLeague(currentLeague.id, 2, 'Oferta z dołu tabeli.', true)
  } else {
    const ratingOk = ctx.avgRating <= 0 || ctx.avgRating >= 6.4
    if (
      higher &&
      ratingOk &&
      (ctx.forceHigher ||
        ctx.cupBoost ||
        ctx.place <= 3 ||
        ctx.goals >= 8 ||
        (player.overall >= ovrThresholdForTier(higher.tier) && ctx.avgRating >= 6.7))
    ) {
      addFromLeague(higher.id, 2, 'Wyższa liga interesuje się Tobą.')
      const top = leagueByTier(higher.tier - 1, currentLeague.country)
      if (top && player.overall >= ovrThresholdForTier(top.tier) + 2 && ctx.avgRating >= 7.0) {
        addFromLeague(top.id, 1, 'Skok o dwie ligi.')
      }
    }
    // Big 5 — dopiero od ~72 + przyzwoita średnia
    if (
      canGoAbroad &&
      (ctx.avgRating <= 0 || ctx.avgRating >= 6.8) &&
      (currentLeague.tier <= 1 || player.overall >= 74)
    ) {
      for (const fl of foreignTopLeagues()) {
        if (fl.id === currentLeague.id) continue
        addFromLeague(fl.id, 1, `${fl.name} patrzy na Ciebie.`)
      }
    }
    addFromLeague(currentLeague.id, 2, 'Klub z Twojej ligi.')
    if (ctx.place >= currentLeague.clubIds.length - 2 && lower) {
      addFromLeague(lower.id, 1, 'Bezpieczny projekt niżej.', true)
    }
  }

  while (offers.length < 2) {
    for (const l of LEAGUES_SAFE(player.overall)) {
      if (offers.length >= 2) break
      addFromLeague(l.id, 1, 'Oferta rynkowa.', form === 'fatalna' || form === 'słaba')
    }
    break
  }

  return offers.slice(0, 5)
}

function LEAGUES_SAFE(overall: number) {
  const pl = [
    getLeague('liga-3'),
    getLeague('liga-ii'),
    getLeague('liga-2'),
    getLeague('liga-1'),
  ]
  if (overall >= ovrThresholdForTier(0)) {
    return [...pl, ...foreignTopLeagues()]
  }
  return pl
}

export function openTransferChoice(state: GameState): void {
  const player = state.player!
  let buyBack: TransferOffer | null = null
  // Przy aktywnym wypożyczeniu oferty liczymy względem klubu-rodzica
  if (player.loan?.returnAfterSeason && state.seasonReport) {
    const loanClubId = state.seasonReport.clubId
    const loanLeagueId = state.seasonReport.leagueId
    const parentClub = player.loan.parentClubId
    const parentLeague = player.loan.parentLeagueId
    if (player.loan.buyOption) {
      const fee = player.loan.buyOptionFee ?? Math.round(player.contract.wage * 30 + player.overall * 100)
      const playChance = estimatePlayChance(player, loanClubId, state.clubStrengthMods ?? {})
      const years = contractYearsForOffer(loanLeagueId)
      buyBack = {
        clubId: loanClubId,
        leagueId: loanLeagueId,
        wage: Math.round(getClub(loanClubId).wage * (0.9 + player.overall / 200)),
        signingBonus: 0,
        playChance,
        kind: 'transfer',
        contractYears: years,
        buyOption: true,
        buyOptionFee: fee,
        message: `Opcja wykupu z wypożyczenia (~${fee} zł). Zostajesz w ${getClub(loanClubId).name} na stałe.`,
      }
    }
    state.seasonReport = {
      ...state.seasonReport,
      clubId: parentClub,
      leagueId: parentLeague,
    }
    pushLog(
      state,
      `Koniec wypożyczenia — wracasz do ${getClub(parentClub).name}.${
        buyBack ? ` ${getClub(loanClubId).name} ma opcję wykupu.` : ''
      }`,
    )
    player.loan = null
  }
  state.transferOffers = generateTransferOffers(state)
  if (buyBack) {
    state.transferOffers = dedupeOffers([buyBack, ...state.transferOffers]).slice(0, 6)
  }
  state.screen = 'transferChoice'
}

/** Powrót z wypożyczenia + dalsza ścieżka kontraktowa u rodzica. */
function returnFromLoanThenContinue(state: GameState): void {
  const report = state.seasonReport!
  const player = state.player!
  const parentClub = player.loan!.parentClubId
  const parentLeague = player.loan!.parentLeagueId
  player.loan = null
  pushLog(state, `Koniec wypożyczenia — wracasz do ${getClub(parentClub).name}.`)

  // Raport „domu” = rodzic (awans/spadek dotyczyło klubu z wypożyczenia — nie przenosimy)
  state.seasonReport = {
    ...report,
    clubId: parentClub,
    leagueId: parentLeague,
    promotion: false,
    relegation: false,
  }

  const underContract = player.contract.yearsLeft > 1
  if (!report.contractRenewed && !underContract) {
    pushLog(
      state,
      `${getClub(parentClub).name}: kontrakt się skończył — szukasz nowego klubu.`,
    )
    openTransferChoice(state)
    return
  }

  if (underContract) {
    player.contract.yearsLeft -= 1
    player.contract.clubId = parentClub
  } else if (report.contractRenewed) {
    player.contract = {
      clubId: parentClub,
      yearsLeft: report.proposedContractYears || 2,
      wage: Math.max(player.contract.wage, getClub(parentClub).wage),
    }
    pushLog(state, `Nowy kontrakt w ${getClub(parentClub).name}: ${player.contract.yearsLeft} lat.`)
  }

  if (birthdayAndAge(state, player)) return
  player.money += player.contract.wage * 3
  beginNextSeason(state, parentClub, parentLeague, true)
}

export function stayAtClub(state: GameState): void {
  const report = state.seasonReport!
  const player = state.player!

  if (player.loan?.returnAfterSeason) {
    returnFromLoanThenContinue(state)
    return
  }

  const underContract = player.contract.yearsLeft > 1
  if (!report.contractRenewed && !underContract) {
    pushLog(
      state,
      `${getClub(report.clubId).name} nie przedłuża kontraktu. Musisz szukać nowego klubu.`,
    )
    openTransferChoice(state)
    return
  }

  if (underContract) {
    player.contract.yearsLeft -= 1
    player.contract.clubId = report.clubId
  } else if (report.contractRenewed) {
    player.contract = {
      clubId: report.clubId,
      yearsLeft: report.proposedContractYears || 2,
      wage: Math.max(player.contract.wage, getClub(report.clubId).wage),
    }
    pushLog(state, `Nowy kontrakt: ${player.contract.yearsLeft} lat, pensja ~${player.contract.wage} zł.`)
  }

  if (birthdayAndAge(state, player)) return
  player.money += player.contract.wage * 3
  beginNextSeason(state, report.clubId, report.leagueId, true)
}

export function openWinterTransfers(state: GameState): void {
  if (!state.season || (state.season.phase !== 'winterDone' && !state.season.winterBreakTaken)) {
    return
  }
  state.transferOffers = generateMidSeasonOffers(state)
  if (!state.transferOffers.length) {
    pushLog(state, 'Brak ofert zimowych.')
    return
  }
  state.screen = 'transferChoice'
}

export function openWinterLoans(state: GameState): void {
  if (!state.season || (state.season.phase !== 'winterDone' && !state.season.winterBreakTaken)) {
    return
  }
  const loans = generateLoanOffers(
    state,
    state.season.clubId,
    state.season.leagueId,
    true,
  )
  if (!loans.length) {
    pushLog(state, 'Brak sensownych wypożyczeń — za wysoki OVR albo brak klubów.')
    return
  }
  state.transferOffers = loans
  state.screen = 'transferChoice'
}

export function openMidSeasonTransfers(state: GameState): void {
  if (!state.season || state.season.midTransferDone) return
  if (state.season.phase === 'winterDone' || state.screen === 'winterBreak') {
    openWinterTransfers(state)
    return
  }
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
  if (state.season.phase === 'winterDone' || state.screen === 'winterBreak') return false
  return generateMidSeasonOffers(state).length > 0
}

export function acceptMidSeasonOffer(state: GameState, clubId: string): void {
  const offer = state.transferOffers.find((o) => o.clubId === clubId)
  const player = state.player!
  const season = state.season!
  if (!offer || !season) return

  const winter = Boolean(state.winterSnapshot)
  player.money += offer.signingBonus
  player.morale = clamp(player.morale + 5, 1, 100)
  player.reputation = clamp(player.reputation + 3, 0, 100)

  if (offer.kind === 'loan') {
    player.loan = {
      parentClubId: season.clubId,
      parentLeagueId: season.leagueId,
      returnAfterSeason: true,
      buyOption: offer.buyOption,
      buyOptionFee: offer.buyOptionFee,
    }
  } else {
    player.loan = null
    player.contract = {
      clubId,
      yearsLeft: offer.contractYears ?? 2,
      wage: offer.wage,
    }
    if (offer.buyOption && offer.buyOptionFee) {
      player.money = Math.max(0, player.money - offer.buyOptionFee)
      pushLog(state, `Wykup z wypożyczenia — zapłacono ~${offer.buyOptionFee} zł.`)
    }
  }

  trackClub(player, clubId)
  const preserved = winter
    ? {
        ...season.liveStats,
        scorerEntries: season.liveStats.scorerEntries.map((e) => ({ ...e })),
      }
    : null
  const mood = season.matchMood
  const next = createSeason(
    clubId,
    offer.leagueId,
    season.year,
    'none',
    state.clubStrengthMods ?? {},
    player.overall,
  )
  next.preseasonDone = true
  next.midTransferDone = true

  if (winter && preserved) {
    const mid = Math.ceil(next.fixtures.length / 2)
    startSeasonCalendar(player, next, state.clubStrengthMods ?? {}, {
      preserveLive: preserved,
      fixtureIndex: mid,
      winterTaken: true,
    })
    next.matchMood = mood
    next.phase = 'playing'
    state.season = next
    state.transferOffers = []
    pushLog(
      state,
      `${offer.kind === 'loan' ? 'Wypożyczenie' : 'Transfer'} zimowy → ${getClub(clubId).name}. Szansa ≈ ${offer.playChance ?? estimatePlayChance(player, clubId)}%.`,
    )
    state.screen = 'winterBreak'
    if (state.winterSnapshot) {
      state.winterSnapshot = {
        ...state.winterSnapshot,
        clubId,
        leagueId: offer.leagueId,
        narrative: `${offer.kind === 'loan' ? 'Wypożyczenie' : 'Transfer'}: ${getClub(clubId).name}. ${describeRival(player, next.rival)}`,
        rivalNote: describeRival(player, next.rival),
      }
    }
    return
  }

  state.season = next
  state.transferOffers = []
  state.seasonReport = null
  state.winterSnapshot = null
  pushLog(
    state,
    `Transfer w trakcie sezonu → ${getClub(clubId).name}. Szansa ≈ ${offer.playChance ?? estimatePlayChance(player, clubId)}%.`,
  )
  state.screen = 'hub'
}

export function declineMidSeasonTransfers(state: GameState): void {
  if (state.season) {
    if (state.winterSnapshot || state.season.phase === 'winterDone') {
      state.transferOffers = []
      state.screen = 'winterBreak'
      pushLog(state, 'Zostajesz — dokańczasz sezon w klubie.')
      return
    }
    state.season.midTransferDone = true
  }
  state.transferOffers = []
  pushLog(state, 'Zostajesz w klubie — okno zamknięte.')
  state.screen = 'hub'
}

export function acceptOffer(state: GameState, clubId: string): void {
  if (state.season && !state.seasonReport) {
    acceptMidSeasonOffer(state, clubId)
    return
  }

  const offer = state.transferOffers.find((o) => o.clubId === clubId)
  const player = state.player!
  if (!offer) return

  // Przy żywym kontrakcie transfer = nowy kontrakt; wypożyczenie zachowuje rodzica
  if (offer.kind === 'loan') {
    const parentClub = state.seasonReport?.clubId ?? player.contract.clubId
    const parentLeague =
      state.seasonReport?.leagueId ?? getLeagueForClub(parentClub).id
    player.loan = {
      parentClubId: parentClub,
      parentLeagueId: parentLeague,
      returnAfterSeason: true,
      buyOption: offer.buyOption,
      buyOptionFee: offer.buyOptionFee,
    }
  } else {
    player.loan = null
    player.contract = {
      clubId,
      yearsLeft: offer.contractYears ?? 2,
      wage: offer.wage,
    }
    if (offer.buyOption && offer.buyOptionFee) {
      player.money = Math.max(0, player.money - offer.buyOptionFee)
      pushLog(state, `Wykup z wypożyczenia — zapłacono ~${offer.buyOptionFee} zł.`)
    }
  }

  if (birthdayAndAge(state, player)) return
  player.money += offer.signingBonus
  player.morale = clamp(player.morale + 6, 1, 100)
  player.reputation = clamp(player.reputation + 2, 0, 100)
  trackClub(player, clubId)
  pushLog(
    state,
    `${offer.kind === 'loan' ? 'Wypożyczenie' : 'Transfer'} → ${getClub(clubId).name} (${getLeague(offer.leagueId).name}).`,
  )
  state.transferOffers = []
  beginNextSeason(state, clubId, offer.leagueId, false)
}

function beginNextSeason(
  state: GameState,
  clubId: string,
  leagueId: string,
  staying: boolean,
): void {
  if (state.screen === 'careerEnd') return
  const report = state.seasonReport!
  let nextLeagueId = leagueId
  let nextClubId = clubId
  let inject: 'promote' | 'relegate' | 'none' = 'none'
  if (!state.clubStrengthMods) state.clubStrengthMods = {}

  if (staying && clubId === report.clubId && !state.player!.loan) {
    const league = getLeague(report.leagueId)
    if (report.promotion) {
      const up = leagueByTier(league.tier - 1, league.country)
      if (up) {
        nextLeagueId = up.id
        nextClubId = report.clubId
        inject = 'promote'
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
          `${getClub(report.clubId).name} awansuje do ${up.name} (siła ≈${eff}).`,
        )

        if (playPct < 28 || state.player!.overall + 3 < eff - 4) {
          pushLog(
            state,
            `Sztab: OVR ${state.player!.overall}, szansa ~${playPct}% — nie biorą Cię wyżej. Oferty / wypożyczenie.`,
          )
          state.seasonReport = {
            ...report,
            contractRenewed: false,
            contractNote: 'Po awansie klub nie bierze Cię do wyższej ligi — za niski poziom.',
            proposedContractYears: 0,
          }
          openTransferChoice(state)
          return
        }
      }
    } else if (report.relegation) {
      const down = leagueByTier(league.tier + 1, league.country)
      if (down) {
        nextLeagueId = down.id
        nextClubId = report.clubId
        inject = 'relegate'
        state.clubStrengthMods[report.clubId] = Math.max(
          -6,
          (state.clubStrengthMods[report.clubId] ?? 0) - 5,
        )
        pushLog(state, `${getClub(report.clubId).name} spada do ${down.name}.`)
      }
    } else {
      pushLog(state, `Zostajesz w ${getClub(report.clubId).name}.`)
    }
  }

  if (state.player) state.player.injury = null

  state.season = createSeason(
    nextClubId,
    nextLeagueId,
    report.year + 1,
    inject,
    state.clubStrengthMods,
    state.player?.overall ?? 50,
  )
  state.seasonReport = null
  state.winterSnapshot = null
  state.pendingKeyMatch = null
  state.pendingKeyQueue = []
  state.transferOffers = []
  state.seasonSummary = null
  state.screen = 'hub'
}

export function startNextSeason(state: GameState): void {
  if (state.seasonReport) stayAtClub(state)
  else state.screen = 'hub'
}

export function leaveForTransferWhileUnderContract(state: GameState): void {
  const player = state.player!
  const report = state.seasonReport
  if (!report) {
    openTransferChoice(state)
    return
  }
  if (player.contract.yearsLeft > 1 && report.contractRenewed) {
    // Lojalność: zostawiasz oferty, boost morale
    player.morale = clamp(player.morale + 3, 1, 100)
    pushLog(state, 'Masz ważny kontrakt — odejście tylko za porozumieniem. Otwieram oferty (nowy kontrakt).')
  }
  openTransferChoice(state)
}
