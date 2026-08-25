import { getClub } from '../data/clubs'
import type {
  GameState,
  LeagueFixture,
  ManagerMatchResult,
  MatchAction,
  PendingMatchMoment,
} from '../state/types'
import { clamp } from '../state/types'
import {
  applyResultToStandings,
  chance,
  keyPlayerRatings,
  nextRoundFixtures,
  simulateAiMatch,
  simulateYourMatchBase,
  tickSquadAfterMatch,
  yourFixtureInRound,
} from './leagueSim'
import { starters } from './squadGen'

function shouldTriggerMoment(
  homeGoals: number,
  awayGoals: number,
  yourPower: number,
  oppPower: number,
): boolean {
  const close = Math.abs(homeGoals - awayGoals) <= 1
  const even = Math.abs(yourPower - oppPower) < 5
  let p = 0.18
  if (close) p += 0.1
  if (even) p += 0.08
  return chance(p)
}

function pickMoment(
  fixture: LeagueFixture,
  opponentId: string,
  homeGoals: number,
  awayGoals: number,
  _isHome: boolean,
  yourGoals: number,
  theirGoals: number,
): PendingMatchMoment {
  const trailing = yourGoals < theirGoals
  const leading = yourGoals > theirGoals
  const useChoice = chance(0.4)

  if (useChoice) {
    return {
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      opponentId,
      homeGoals,
      awayGoals,
      kind: 'choice',
      label: trailing ? 'Trzeba coś zmienić' : leading ? 'Domknąć mecz' : 'Kluczowa faza',
      description: trailing
        ? 'Przegrywasz. Co robisz z ławki?'
        : leading
          ? 'Prowadzisz. Jak domykasz spotkanie?'
          : 'Remisowa walka. Decydująca decyzja.',
      choices: trailing
        ? [
            { id: 'press', label: 'Pełny pressing', hint: 'Szansa na gola, ryzyko kontry' },
            { id: 'sub', label: 'Świeży napastnik', hint: 'Bezpieczniejszy atak' },
            { id: 'hold', label: 'Trzymamy kształt', hint: 'Mniejsza zmiana' },
          ]
        : leading
          ? [
              { id: 'park', label: 'Cofnij linię', hint: 'Bronisz wyniku' },
              { id: 'kill', label: 'Gra na czas', hint: 'Kontrola tempa' },
              { id: 'hunt', label: 'Dobijamy', hint: 'Ryzyko kolejnego gola obu stron' },
            ]
          : [
              { id: 'press', label: 'Pressing', hint: 'Idziemy po trzy punkty' },
              { id: 'park', label: 'Bezpiecznie', hint: 'Remis OK' },
              { id: 'hunt', label: 'Ryzykowna zmiana', hint: 'Wszystko albo nic' },
            ],
    }
  }

  const attack = !trailing || chance(0.55)
  const action: MatchAction = attack
    ? chance(0.55)
      ? 'shoot'
      : 'pass'
    : chance(0.55)
      ? 'tackle'
      : 'clear'

  return {
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    opponentId,
    homeGoals,
    awayGoals,
    kind: 'minigame',
    action,
    label: attack ? 'Okazja ofensywna' : 'Kryzys w obronie',
    description: attack
      ? `Moment przy ${getClub(opponentId).short} — rozegraj akcję.`
      : `Musisz zatrzymać atak ${getClub(opponentId).short}.`,
  }
}

function yourClubGoals(
  fixture: LeagueFixture,
  clubId: string,
  hg: number,
  ag: number,
): { yourGoals: number; theirGoals: number } {
  if (fixture.homeId === clubId) return { yourGoals: hg, theirGoals: ag }
  return { yourGoals: ag, theirGoals: hg }
}

function adjustGoalsForClub(
  fixture: LeagueFixture,
  clubId: string,
  hg: number,
  ag: number,
  deltaYour: number,
  deltaTheir: number,
): { homeGoals: number; awayGoals: number } {
  if (fixture.homeId === clubId) {
    return {
      homeGoals: Math.max(0, hg + deltaYour),
      awayGoals: Math.max(0, ag + deltaTheir),
    }
  }
  return {
    homeGoals: Math.max(0, hg + deltaTheir),
    awayGoals: Math.max(0, ag + deltaYour),
  }
}

export function beginMatchday(state: GameState): void {
  const season = state.season!
  const round = nextRoundFixtures(season)
  if (!round) {
    state.screen = 'hub'
    return
  }

  // Najpierw mecze AI w kolejce (bez Twojego)
  const yourFix = yourFixtureInRound(season, round)
  for (const f of round) {
    if (yourFix && f.homeId === yourFix.homeId && f.awayId === yourFix.awayId) continue
    const { homeGoals, awayGoals } = simulateAiMatch(f.homeId, f.awayId)
    applyResultToStandings(season.standings, f.homeId, f.awayId, homeGoals, awayGoals)
  }

  if (!yourFix) {
    season.roundIndex += 1
    if (season.roundIndex >= season.rounds.length) season.phase = 'done'
    state.screen = 'hub'
    return
  }

  const base = simulateYourMatchBase(state, yourFix)
  const opponentId =
    yourFix.homeId === season.clubId ? yourFix.awayId : yourFix.homeId
  const { yourGoals, theirGoals } = yourClubGoals(
    yourFix,
    season.clubId,
    base.homeGoals,
    base.awayGoals,
  )

  if (
    shouldTriggerMoment(base.homeGoals, base.awayGoals, base.yourPower, base.oppPower)
  ) {
    season.pendingMoment = pickMoment(
      yourFix,
      opponentId,
      base.homeGoals,
      base.awayGoals,
      yourFix.homeId === season.clubId,
      yourGoals,
      theirGoals,
    )
    state.screen = 'matchMoment'
    return
  }

  finishMatch(state, yourFix, base.homeGoals, base.awayGoals, base.narrativeBits)
}

export function resolveMomentMinigame(state: GameState, score: number): void {
  const season = state.season!
  const moment = season.pendingMoment
  if (!moment) return
  const fixture = { homeId: moment.homeId, awayId: moment.awayId }
  let { homeGoals, awayGoals } = moment
  const bits: string[] = []

  if (score >= 70) {
    const adj = adjustGoalsForClub(fixture, season.clubId, homeGoals, awayGoals, 1, 0)
    homeGoals = adj.homeGoals
    awayGoals = adj.awayGoals
    bits.push('Moment zdecydował — zdobywasz gola!')
    state.team!.teamChemistry = clamp(state.team!.teamChemistry + 2, 20, 100)
  } else if (score < 40) {
    const adj = adjustGoalsForClub(fixture, season.clubId, homeGoals, awayGoals, 0, 1)
    homeGoals = adj.homeGoals
    awayGoals = adj.awayGoals
    bits.push('Moment przegrany — rywal karze błąd.')
    state.team!.teamChemistry = clamp(state.team!.teamChemistry - 1, 20, 100)
  } else {
    bits.push('Moment bez zmiany wyniku.')
  }

  season.pendingMoment = null
  finishMatch(state, fixture, homeGoals, awayGoals, bits)
}

export function resolveMomentChoice(state: GameState, choiceId: string): void {
  const season = state.season!
  const moment = season.pendingMoment
  if (!moment) return
  const fixture = { homeId: moment.homeId, awayId: moment.awayId }
  let { homeGoals, awayGoals } = moment
  const bits: string[] = []
  let dY = 0
  let dT = 0

  if (choiceId === 'press' || choiceId === 'hunt') {
    if (chance(0.55)) dY = 1
    else if (chance(0.4)) dT = 1
    bits.push(choiceId === 'press' ? 'Pressing zmienia obraz gry.' : 'Ryzykowna zmiana.')
  } else if (choiceId === 'sub') {
    if (chance(0.45)) dY = 1
    bits.push('Zmiana napastnika.')
  } else if (choiceId === 'park' || choiceId === 'kill' || choiceId === 'hold') {
    if (chance(0.2)) dT = 1
    else if (choiceId === 'hold' && chance(0.2)) dY = 1
    bits.push(
      choiceId === 'park'
        ? 'Cofnięta linia.'
        : choiceId === 'kill'
          ? 'Gra na czas.'
          : 'Trzymacie kształt.',
    )
  }

  const adj = adjustGoalsForClub(fixture, season.clubId, homeGoals, awayGoals, dY, dT)
  homeGoals = adj.homeGoals
  awayGoals = adj.awayGoals
  season.pendingMoment = null
  finishMatch(state, fixture, homeGoals, awayGoals, bits)
}

function finishMatch(
  state: GameState,
  fixture: LeagueFixture,
  homeGoals: number,
  awayGoals: number,
  bits: string[],
): void {
  const season = state.season!
  const team = state.team!
  const opponentId =
    fixture.homeId === season.clubId ? fixture.awayId : fixture.homeId
  const { yourGoals, theirGoals } = yourClubGoals(
    fixture,
    season.clubId,
    homeGoals,
    awayGoals,
  )
  const won = yourGoals > theirGoals
  const drawn = yourGoals === theirGoals

  applyResultToStandings(season.standings, fixture.homeId, fixture.awayId, homeGoals, awayGoals)

  season.record.played += 1
  season.record.goalsFor += yourGoals
  season.record.goalsAgainst += theirGoals
  if (won) season.record.won += 1
  else if (drawn) season.record.drawn += 1
  else season.record.lost += 1

  const ratings = keyPlayerRatings(state)
  const playedIds = starters(team).map((p) => p.id)
  tickSquadAfterMatch(state, playedIds, won, drawn)

  const result: ManagerMatchResult = {
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals,
    awayGoals,
    opponentId,
    yourGoals,
    theirGoals,
    won,
    drawn,
    narrative: '',
    keyRatings: ratings,
    chemistryAfter: team.teamChemistry,
  }

  const home = getClub(fixture.homeId)
  const away = getClub(fixture.awayId)
  let narrative = `${home.short} ${homeGoals}:${awayGoals} ${away.short}. `
  if (won) narrative += 'Wygrana! '
  else if (drawn) narrative += 'Remis. '
  else narrative += 'Porażka. '
  narrative += bits.join(' ')
  if (ratings.length) {
    narrative += ` Noty: ${ratings.map((r) => `${r.name} ${r.rating}`).join(', ')}.`
  }
  result.narrative = narrative
  season.lastMatch = result

  season.roundIndex += 1
  if (season.roundIndex >= season.rounds.length) season.phase = 'done'

  state.screen = 'matchResult'
}
