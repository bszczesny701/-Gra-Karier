import {
  CLUBS,
  getClub,
  getLeague,
  getLeagueForClub,
  leagueByTier,
} from '../data/clubs'
import { CAREER_EVENTS, pickEvent, type ChoiceEffect } from '../data/events'
import {
  WEEKS_PER_SEASON,
  clamp,
  type BallTrainResult,
  type ClubStanding,
  type CreateCareerOptions,
  type GameState,
  type PendingDecision,
  type Player,
  type SeasonState,
  type TransferOffer,
} from '../state/types'
import { pushLog } from '../state/gameState'
import {
  isHomeWeek,
  pickOpponent,
  simulateMatch,
} from './matchSim'
import {
  applyBallTrainRewards,
  attrsFromOverall,
  calcOverall,
  moneyFromStart,
  reputationFromStart,
} from './playerFactory'

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
    morale: 70,
    form: 65,
    reputation: reputationFromStart(overall, league.tier),
    money: moneyFromStart(overall, club.wage),
  }
}

export function createSeason(clubId: string, leagueId: string, year: number): SeasonState {
  const league = getLeague(leagueId)
  const standings: ClubStanding[] = league.clubIds.map((id) => ({
    clubId: id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }))

  return {
    year,
    week: 1,
    maxWeeks: WEEKS_PER_SEASON,
    leagueId,
    clubId,
    standings,
    playerAppearances: 0,
    playerGoals: 0,
    playerAssists: 0,
    avgRating: 0,
    ratingSum: 0,
    ballTrainedWeek: 0,
  }
}

export function startNewCareer(state: GameState, options: CreateCareerOptions): void {
  const clubId = options.clubId
  const league = getLeagueForClub(clubId)
  state.player = createPlayer({ ...options, clubId })
  state.season = createSeason(clubId, league.id, 2026)
  state.lastMatch = null
  state.pendingDecision = null
  state.pendingTransfer = null
  state.seasonSummary = null
  state.log = []
  pushLog(
    state,
    `Start kariery w ${getClub(clubId).name} (OVR ${state.player.overall}). Powodzenia!`,
  )
  state.screen = 'hub'
}

export function applyBallTrainResult(state: GameState, result: BallTrainResult): void {
  const player = state.player!
  const season = state.season!
  const rewarded = applyBallTrainRewards(
    player.attrs,
    player.form,
    player.morale,
    result,
    player.preferredFoot,
  )
  player.attrs = rewarded.attrs
  player.form = rewarded.form
  player.morale = rewarded.morale
  player.overall = calcOverall(player.attrs, player.position)
  season.ballTrainedWeek = season.week
  pushLog(state, rewarded.summary)
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
    case 'form':
      player.form = clamp(player.form + effect.delta, 1, 100)
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
}

export function buildWeekDecision(state: GameState): PendingDecision {
  const player = state.player!
  const event = pickEvent(CAREER_EVENTS, player.position, player.reputation)
  return {
    eventId: event.id,
    title: event.title,
    description: event.description,
    choices: event.choices.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
    })),
  }
}

export function openWeekDecision(state: GameState): void {
  state.pendingDecision = buildWeekDecision(state)
  state.screen = 'decision'
}

export function applyDecision(state: GameState, choiceId: string): void {
  const player = state.player!
  const pending = state.pendingDecision
  if (!pending) return

  const event = CAREER_EVENTS.find((e) => e.id === pending.eventId)
  const choice = event?.choices.find((c) => c.id === choiceId)
  if (!choice) return

  for (const effect of choice.effects) applyEffect(player, effect)
  pushLog(state, `${pending.title}: ${choice.label}`)
  state.pendingDecision = null

  // wypłata tygodniowa
  const wage = Math.round(getClub(state.season!.clubId).wage / 4)
  player.money += wage

  runMatchWeek(state)
}

function updateStanding(
  standings: ClubStanding[],
  clubId: string,
  gf: number,
  ga: number,
): void {
  const row = standings.find((s) => s.clubId === clubId)
  if (!row) return
  row.played++
  row.goalsFor += gf
  row.goalsAgainst += ga
  if (gf > ga) {
    row.won++
    row.points += 3
  } else if (gf === ga) {
    row.drawn++
    row.points += 1
  } else {
    row.lost++
  }
}

function simulateOtherFixtures(
  standings: ClubStanding[],
  leagueClubIds: string[],
  playedIds: Set<string>,
  week: number,
): void {
  const remaining = leagueClubIds.filter((id) => !playedIds.has(id))
  for (let i = 0; i + 1 < remaining.length; i += 2) {
    const a = remaining[i]!
    const b = remaining[i + 1]!
    const sa = getClub(a).strength + ((week * 7 + i) % 9) - 4
    const sb = getClub(b).strength + ((week * 11 + i) % 9) - 4
    const ga = Math.max(0, Math.round((sa - sb) / 25 + Math.random() * 2))
    const gb = Math.max(0, Math.round((sb - sa) / 25 + Math.random() * 2))
    updateStanding(standings, a, ga, gb)
    updateStanding(standings, b, gb, ga)
  }
}

export function runMatchWeek(state: GameState): void {
  const player = state.player!
  const season = state.season!
  const league = getLeague(season.leagueId)
  const opponent = pickOpponent(league.clubIds, season.clubId, season.week)
  const home = isHomeWeek(season.week)
  const homeId = home ? season.clubId : opponent
  const awayId = home ? opponent : season.clubId

  const result = simulateMatch(homeId, awayId, player, season.clubId)
  state.lastMatch = result

  updateStanding(season.standings, homeId, result.homeGoals, result.awayGoals)
  updateStanding(season.standings, awayId, result.awayGoals, result.homeGoals)

  const played = new Set([homeId, awayId])
  simulateOtherFixtures(season.standings, league.clubIds, played, season.week)

  if (result.playerStarted) {
    season.playerAppearances++
    season.playerGoals += result.playerGoals
    season.playerAssists += result.playerAssists
    season.ratingSum += result.playerRating
    season.avgRating = Math.round((season.ratingSum / season.playerAppearances) * 10) / 10

    player.form = clamp(player.form + (result.playerRating >= 7 ? 2 : result.playerRating < 5.5 ? -3 : 0), 1, 100)
    player.morale = clamp(
      player.morale + (result.playerRating >= 7.5 ? 3 : result.playerRating < 5 ? -3 : 1),
      1,
      100,
    )
    player.reputation = clamp(
      player.reputation +
        (result.playerGoals > 0 ? 2 : 0) +
        (result.playerAssists > 0 ? 1 : 0) +
        (result.playerRating >= 8 ? 1 : 0),
      0,
      100,
    )
    player.attrs.stamina = clamp(player.attrs.stamina - 1)
  } else {
    player.morale = clamp(player.morale - 2, 1, 100)
    player.form = clamp(player.form + 1, 1, 100)
  }

  // natural recovery
  player.form = clamp(player.form + 1, 1, 100)

  state.screen = 'match'
}

export function sortedStandings(season: SeasonState): ClubStanding[] {
  return [...season.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst
    const gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.goalsFor - a.goalsFor
  })
}

export function playerTablePosition(season: SeasonState): number {
  return sortedStandings(season).findIndex((s) => s.clubId === season.clubId) + 1
}

function maybeCreateTransfer(state: GameState): TransferOffer | null {
  const player = state.player!
  const season = state.season!
  const league = getLeague(season.leagueId)
  const pos = playerTablePosition(season)
  const ratingOk = season.avgRating >= 6.8 || player.reputation >= 35
  const endish = season.week >= season.maxWeeks - 1

  if (!ratingOk && !endish) return null
  if (player.reputation < 20 && season.avgRating < 6.5) return null

  const betterLeague = leagueByTier(league.tier - 1)
  let targetLeague = league
  let message = 'Klub z ligi chce Cię wzmocnić.'

  if (betterLeague && (pos <= 3 || player.reputation >= 40 || season.avgRating >= 7.2)) {
    targetLeague = betterLeague
    message = `${betterLeague.name} obserwowała Cię cały sezon.`
  }

  const candidates = targetLeague.clubIds.filter((id) => id !== season.clubId)
  if (!candidates.length) return null

  const clubId = candidates[Math.floor(Math.random() * candidates.length)]!
  const club = getClub(clubId)
  const wage = Math.round(club.wage * (1 + player.reputation / 200))
  const signingBonus = Math.round(wage * 2 + player.reputation * 20)

  return { clubId, wage, signingBonus, message }
}

export function continueAfterMatch(state: GameState): void {
  const season = state.season!

  if (season.week >= season.maxWeeks) {
    finishSeason(state)
    return
  }

  // oferta transferowa okazjonalnie
  if (season.week % 4 === 0 || season.week === season.maxWeeks - 1) {
    const offer = maybeCreateTransfer(state)
    if (offer) {
      state.pendingTransfer = offer
      state.screen = 'transfer'
      return
    }
  }

  season.week++
  state.screen = 'hub'
}

export function acceptTransfer(state: GameState): void {
  const offer = state.pendingTransfer
  const player = state.player!
  const season = state.season!
  if (!offer) return

  const club = getClub(offer.clubId)
  const league = getLeagueForClub(offer.clubId)

  player.money += offer.signingBonus
  player.reputation = clamp(player.reputation + 5, 0, 100)
  player.morale = clamp(player.morale + 8, 1, 100)

  if (league.id !== season.leagueId) {
    const rebuilt = createSeason(offer.clubId, league.id, season.year)
    rebuilt.week = season.week
    rebuilt.playerAppearances = season.playerAppearances
    rebuilt.playerGoals = season.playerGoals
    rebuilt.playerAssists = season.playerAssists
    rebuilt.avgRating = season.avgRating
    rebuilt.ratingSum = season.ratingSum
    rebuilt.ballTrainedWeek = season.ballTrainedWeek
    state.season = rebuilt
  } else {
    season.clubId = offer.clubId
  }

  pushLog(state, `Transfer do ${club.name}! Premia: ${offer.signingBonus} zł.`)
  state.pendingTransfer = null
  state.season!.week++
  state.screen = 'hub'
}

export function rejectTransfer(state: GameState): void {
  pushLog(state, 'Odrzuciłeś ofertę transferową.')
  state.pendingTransfer = null
  state.player!.morale = clamp(state.player!.morale - 1, 1, 100)
  state.season!.week++
  state.screen = 'hub'
}

export function finishSeason(state: GameState): void {
  const player = state.player!
  const season = state.season!
  const league = getLeague(season.leagueId)
  const table = sortedStandings(season)
  const place = playerTablePosition(season)
  const club = getClub(season.clubId)

  let summary = `Sezon ${season.year} w ${league.name} zakończony. ${club.name} — ${place}. miejsce. `
  summary += `Twoje statystyki: ${season.playerAppearances} występów, ${season.playerGoals} goli, ${season.playerAssists} asyst, średnia ocena ${season.avgRating || '—'}.`

  player.age += 1
  player.money += getClub(season.clubId).wage * 2

  // promotion / relegation club movement for next season
  let nextLeagueId = season.leagueId
  let nextClubId = season.clubId

  if (place === 1 && league.tier > 1) {
    const up = leagueByTier(league.tier - 1)!
    nextLeagueId = up.id
    // take player to a mid club in higher league if current club wouldn't promote as entity — simplify: promote with club into a slot
    const weakest = [...up.clubIds].sort((a, b) => CLUBS[a]!.strength - CLUBS[b]!.strength)[0]!
    nextClubId = weakest
    summary += ` Awans! Od nowego sezonu grasz w ${up.name} (${getClub(nextClubId).name}).`
    player.reputation = clamp(player.reputation + 8, 0, 100)
  } else if (place >= table.length - 1 && league.tier < 3) {
    const down = leagueByTier(league.tier + 1)!
    nextLeagueId = down.id
    const strongest = [...down.clubIds].sort((a, b) => CLUBS[b]!.strength - CLUBS[a]!.strength)[0]!
    nextClubId = strongest
    summary += ` Spadek. Nowy sezon: ${down.name} (${getClub(nextClubId).name}).`
    player.morale = clamp(player.morale - 5, 1, 100)
  } else if (place <= 3 && player.reputation >= 45 && league.tier > 1) {
    const up = leagueByTier(league.tier - 1)!
    const target = up.clubIds[Math.floor(Math.random() * up.clubIds.length)]!
    nextLeagueId = up.id
    nextClubId = target
    summary += ` Mocny sezon przyciągnął ${getClub(target).name} z ${up.name}.`
    player.money += 2000
  } else {
    summary += ' Zostajesz w klubie na kolejny sezon.'
  }

  state.seasonSummary = summary
  pushLog(state, summary)

  // prepare next season data but stay on seasonEnd screen
  state.season = createSeason(nextClubId, nextLeagueId, season.year + 1)
  state.lastMatch = null
  state.pendingTransfer = null
  state.screen = 'seasonEnd'
}

export function startNextSeason(state: GameState): void {
  state.seasonSummary = null
  state.screen = 'hub'
  pushLog(state, `Nowy sezon ${state.season!.year} w ${getClub(state.season!.clubId).name}.`)
}
