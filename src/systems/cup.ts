import { getClub, getEffectiveStrength } from '../data/clubs'
import type {
  CupPathStep,
  CupState,
  GameState,
  ScheduledMatch,
  SeasonState,
} from '../state/types'
import { aiClubPower, chance, simulateAiMatch } from './leagueSim'

export function cupEligibleLeague(leagueId: string): boolean {
  return leagueId === 'liga-1' || leagueId === 'liga-2'
}

export function cupEntrants(state: GameState): string[] {
  return Object.entries(state.clubLeagueIds)
    .filter(([, lid]) => cupEligibleLeague(lid))
    .map(([id]) => id)
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function cupRoundNames(totalRounds: number): string[] {
  const names: string[] = []
  for (let i = 0; i < totalRounds; i++) {
    const remaining = totalRounds - i
    if (remaining === 1) names.push('Finał')
    else if (remaining === 2) names.push('Półfinał')
    else if (remaining === 3) names.push('Ćwierćfinał')
    else if (remaining === 4) names.push('1/8 finału')
    else if (remaining === 5) names.push('1/16 finału')
    else names.push(`Runda ${i + 1}`)
  }
  return names
}

function sortByStrength(ids: string[]): string[] {
  return [...ids].sort((a, b) => getEffectiveStrength(b) - getEffectiveStrength(a))
}

/** Wynik pucharowy bez remisu (dogrywka / karne). */
export function simulateCupScore(
  homeId: string,
  awayId: string,
  state?: GameState | null,
): { homeGoals: number; awayGoals: number; pens: boolean } {
  let { homeGoals, awayGoals } = simulateAiMatch(homeId, awayId, {}, state)
  if (homeGoals !== awayGoals) return { homeGoals, awayGoals, pens: false }
  const homeEdge = aiClubPower(homeId, {}, state) >= aiClubPower(awayId, {}, state)
  if (homeEdge) homeGoals += 1
  else awayGoals += 1
  return { homeGoals, awayGoals, pens: true }
}

export function createCupState(
  state: GameState,
  playerClubId: string,
  matches: Record<string, ScheduledMatch>,
): CupState | null {
  const entrants = cupEntrants(state)
  if (entrants.length < 4 || !entrants.includes(playerClubId)) return null

  const target = nextPow2(entrants.length)
  const byeCount = target - entrants.length
  const ranked = sortByStrength(entrants)
  const byeTeams = ranked.slice(0, byeCount)
  const playing = shuffle(ranked.slice(byeCount))

  const r1: string[] = []
  for (let i = 0; i + 1 < playing.length; i += 2) {
    const id = `cup-r0-m${i / 2}`
    const flip = chance(0.5)
    const homeId = flip ? playing[i]! : playing[i + 1]!
    const awayId = flip ? playing[i + 1]! : playing[i]!
    matches[id] = {
      id,
      competition: 'cup',
      homeId,
      awayId,
      homeGoals: null,
      awayGoals: null,
      cupRound: 0,
    }
    r1.push(id)
  }
  if (playing.length % 2 === 1) {
    byeTeams.push(playing[playing.length - 1]!)
  }

  const totalRounds = Math.log2(target)
  const names = cupRoundNames(totalRounds)
  const yourPath: CupPathStep[] = names.map((roundName) => ({
    roundName,
    opponentId: null,
    result: 'pending',
  }))

  if (byeTeams.includes(playerClubId)) {
    yourPath[0] = { roundName: names[0]!, opponentId: null, result: 'bye' }
  } else {
    const my = r1.map((id) => matches[id]!).find((m) => m.homeId === playerClubId || m.awayId === playerClubId)
    if (my) {
      yourPath[0]!.opponentId = my.homeId === playerClubId ? my.awayId : my.homeId
    }
  }

  return {
    entrantIds: entrants,
    rounds: [r1],
    roundIndex: 0,
    eliminated: false,
    championId: null,
    yourPath,
    advancedIds: [...byeTeams],
    totalRounds,
    calendarWeekForRound: [],
  }
}

function winnerOf(m: ScheduledMatch): string | null {
  if (m.homeGoals == null || m.awayGoals == null) return null
  if (m.homeGoals === m.awayGoals) return null
  return m.homeGoals > m.awayGoals ? m.homeId : m.awayId
}

export function applyCupMatchResult(
  season: SeasonState,
  matchId: string,
  homeGoals: number,
  awayGoals: number,
): void {
  const cup = season.cup
  const m = season.matches[matchId]
  if (!cup || !m || m.competition !== 'cup') return

  m.homeGoals = homeGoals
  m.awayGoals = awayGoals
  const winId = winnerOf(m)
  if (!winId) return

  if (!cup.advancedIds.includes(winId)) cup.advancedIds.push(winId)

  const clubId = season.clubId
  const youPlayed = m.homeId === clubId || m.awayId === clubId
  if (youPlayed) {
    const step = cup.yourPath[m.cupRound ?? cup.roundIndex]
    if (step) {
      step.opponentId = m.homeId === clubId ? m.awayId : m.homeId
      step.result = winId === clubId ? 'won' : 'lost'
    }
    if (winId !== clubId) cup.eliminated = true
  }

  const roundMatches = cup.rounds[cup.roundIndex] ?? []
  const allDone = roundMatches.every((id) => {
    const x = season.matches[id]
    return x && x.homeGoals != null && x.awayGoals != null
  })
  if (allDone) advanceCupBracket(season)
}

function advanceCupBracket(season: SeasonState): void {
  const cup = season.cup
  if (!cup) return

  const winners = [...cup.advancedIds]
  cup.advancedIds = []

  if (winners.length <= 1) {
    cup.championId = winners[0] ?? null
    if (cup.championId === season.clubId) {
      const last = cup.yourPath[cup.yourPath.length - 1]
      if (last && last.result === 'pending') last.result = 'won'
    }
    return
  }

  const nextRound = cup.roundIndex + 1
  const paired = shuffle(winners)
  const matchIds: string[] = []

  for (let i = 0; i + 1 < paired.length; i += 2) {
    const id = `cup-r${nextRound}-m${i / 2}`
    const flip = chance(0.5)
    const homeId = flip ? paired[i]! : paired[i + 1]!
    const awayId = flip ? paired[i + 1]! : paired[i]!
    season.matches[id] = {
      id,
      competition: 'cup',
      homeId,
      awayId,
      homeGoals: null,
      awayGoals: null,
      cupRound: nextRound,
    }
    matchIds.push(id)
  }
  if (paired.length % 2 === 1) {
    cup.advancedIds.push(paired[paired.length - 1]!)
  }

  cup.rounds.push(matchIds)
  cup.roundIndex = nextRound

  const clubId = season.clubId
  const step = cup.yourPath[nextRound]
  if (step && !cup.eliminated) {
    const my = matchIds.map((id) => season.matches[id]!).find((m) => m.homeId === clubId || m.awayId === clubId)
    if (my) {
      step.opponentId = my.homeId === clubId ? my.awayId : my.homeId
      step.result = 'pending'
    } else if (cup.advancedIds.includes(clubId)) {
      step.opponentId = null
      step.result = 'bye'
    }
  }

  const weekIdx = cup.calendarWeekForRound[nextRound]
  if (weekIdx != null) {
    const week = season.calendar.weeks[weekIdx]
    if (week) {
      for (const id of matchIds) {
        if (!week.matchIds.includes(id)) week.matchIds.push(id)
      }
      const your = matchIds
        .map((id) => season.matches[id]!)
        .find((m) => m.homeId === clubId || m.awayId === clubId)
      if (your) {
        week.days[2] = { weekday: 2, activity: 'match', matchId: your.id }
      }
    }
  }
}

export function cupSummaryText(season: SeasonState): string | null {
  const cup = season.cup
  if (!cup) return null
  if (cup.championId === season.clubId) return 'Zdobywasz Puchar Polski!'
  if (cup.eliminated) {
    const lost = [...cup.yourPath].reverse().find((s) => s.result === 'lost')
    if (lost) {
      const opp = lost.opponentId ? getClub(lost.opponentId).name : 'rywalem'
      return `Odpadasz z Pucharu Polski w rundzie: ${lost.roundName} (vs ${opp}).`
    }
    return 'Odpadasz z Pucharu Polski.'
  }
  if (cup.championId) {
    return `Puchar Polski zdobywa ${getClub(cup.championId).name}.`
  }
  return 'Puchar Polski w toku.'
}
