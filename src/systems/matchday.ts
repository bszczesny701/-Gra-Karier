import { getClub, getEffectiveStrength } from '../data/clubs'
import type {
  LiveSeasonStats,
  MatchDayResult,
  PendingGoalMoment,
  Player,
  ScorerEntry,
  SeasonReport,
  SeasonState,
  WinterBreakSnapshot,
} from '../state/types'
import { clamp } from '../state/types'
import { playerTablePosition, sortedStandings } from './standings'
import {
  bumpScorer,
  buildSeasonFixtures,
  chance,
  describeRival,
  distributeClubGoals,
  ensureClubScorers,
  finalizeSeasonReport,
  matchAppearanceChance,
  rngInt,
  scoreline,
  scorerMapFromEntries,
  tweakRivalForm,
  updateStanding,
  type FixtureBatchState,
} from './seasonSim'

export type MatchdayOutcome =
  | { kind: 'goalMoment' }
  | { kind: 'matchResult'; match: MatchDayResult }
  | { kind: 'winter'; snapshot: WinterBreakSnapshot }
  | { kind: 'seasonDone'; report: SeasonReport }

export function createEmptyLiveStats(
  overallBefore: number,
  fixturesForPlayer: number,
): LiveSeasonStats {
  return {
    appearances: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
    matchesMissedInjury: 0,
    injuryLabels: [],
    appsThisSeason: 0,
    injuryAtApp: -1,
    overallBefore,
    fixturesForPlayer,
    scorerEntries: [],
  }
}

export function initSeasonMatchdayFields(season: SeasonState, playerOverall: number): void {
  const clubIds = season.standings.map((s) => s.clubId)
  season.fixtures = buildSeasonFixtures(clubIds)
  season.fixtureIndex = 0
  season.matchMood = clamp(50 + (Math.random() * 12 - 4), 38, 62)
  season.lastMatch = null
  season.pendingGoalMoment = null
  season.winterBreakTaken = false
  season.phase = 'playing'
  season.halfStats = null
  const fixturesForPlayer = season.fixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  ).length
  const care = clamp(season.injuryCare ?? 0, 0, 5)
  const seasonInjuryP = Math.max(0.06, 0.2 * (1 - care * 0.14))
  const willGetInjured = Math.random() < seasonInjuryP
  const injuryAtApp = willGetInjured
    ? 1 + rngInt(Math.max(1, Math.floor(fixturesForPlayer * 0.85)))
    : -1
  const scorerMap = new Map<string, ScorerEntry>()
  for (const clubId of clubIds) ensureClubScorers(scorerMap, clubId, season.year)
  season.liveStats = createEmptyLiveStats(playerOverall, fixturesForPlayer)
  season.liveStats.injuryAtApp = injuryAtApp
  season.liveStats.scorerEntries = [...scorerMap.values()].map((e) => ({ ...e }))
}

export function startSeasonCalendar(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number> = {},
  opts?: { preserveLive?: LiveSeasonStats; fixtureIndex?: number; winterTaken?: boolean },
): void {
  void strengthMods
  void player
  const clubIds = season.standings.map((s) => s.clubId)
  season.fixtures = buildSeasonFixtures(clubIds)
  season.fixtureIndex = opts?.fixtureIndex ?? 0
  season.matchMood = clamp(50 + (Math.random() * 12 - 4), 38, 62)
  season.lastMatch = null
  season.pendingGoalMoment = null
  season.winterBreakTaken = opts?.winterTaken ?? false
  season.phase = 'playing'
  season.halfStats = null

  const fixturesForPlayer = season.fixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  ).length

  if (opts?.preserveLive) {
    season.liveStats = {
      ...opts.preserveLive,
      fixturesForPlayer: Math.max(opts.preserveLive.fixturesForPlayer, fixturesForPlayer),
      scorerEntries: opts.preserveLive.scorerEntries.map((e) => ({ ...e })),
    }
  } else {
    initSeasonMatchdayFields(season, player.overall)
    if (opts?.fixtureIndex != null) season.fixtureIndex = opts.fixtureIndex
    if (opts?.winterTaken != null) season.winterBreakTaken = opts.winterTaken
  }
}

export function nextPlayerFixture(
  season: SeasonState,
): { index: number; homeId: string; awayId: string } | null {
  for (let i = season.fixtureIndex; i < season.fixtures.length; i++) {
    const f = season.fixtures[i]!
    if (f.homeId === season.clubId || f.awayId === season.clubId) {
      return { index: i, homeId: f.homeId, awayId: f.awayId }
    }
  }
  return null
}

function liveScorerMap(season: SeasonState): Map<string, ScorerEntry> {
  return scorerMapFromEntries(season.liveStats.scorerEntries)
}

function persistScorers(season: SeasonState, map: Map<string, ScorerEntry>): void {
  season.liveStats.scorerEntries = [...map.values()].map((e) => ({ ...e }))
}

function simulateNpcFixture(
  homeId: string,
  awayId: string,
  season: SeasonState,
  strengthMods: Record<string, number>,
  scorerMap: Map<string, ScorerEntry>,
): void {
  const homePow = getEffectiveStrength(homeId, strengthMods) + Math.random() * 6 - 3
  const awayPow = getEffectiveStrength(awayId, strengthMods) + Math.random() * 6 - 3
  const hg = scoreline(homePow, awayPow * 0.9)
  const ag = scoreline(awayPow, homePow * 0.9)
  updateStanding(season.standings.find((s) => s.clubId === homeId)!, hg, ag)
  updateStanding(season.standings.find((s) => s.clubId === awayId)!, ag, hg)
  distributeClubGoals(scorerMap, homeId, season.year, hg)
  distributeClubGoals(scorerMap, awayId, season.year, ag)
}

function goalMomentChance(player: Player, matchMood: number): number {
  const base = player.position === 'NP' ? 0.36 : player.position === 'POM' ? 0.28 : 0.2
  const ovrBit = (player.overall - 48) / 220
  const moodBit = (matchMood - 50) / 280
  return Math.max(0.18, Math.min(0.42, base + ovrBit + moodBit))
}

function finishPlayerMatchCore(
  player: Player,
  season: SeasonState,
  scorerMap: Map<string, ScorerEntry>,
  args: {
    homeId: string
    awayId: string
    starts: boolean
    matchGoals: number
    matchAssists: number
    moodBefore: number
    homeGoals: number
    awayGoals: number
    narrativeExtra?: string
  },
): MatchDayResult {
  const { homeId, awayId, starts, matchGoals, matchAssists, moodBefore } = args
  let hg = args.homeGoals
  let ag = args.awayGoals

  if (starts && matchGoals > 0) {
    if (homeId === season.clubId) hg = Math.max(hg, matchGoals)
    else ag = Math.max(ag, matchGoals)
  }

  updateStanding(season.standings.find((s) => s.clubId === homeId)!, hg, ag)
  updateStanding(season.standings.find((s) => s.clubId === awayId)!, ag, hg)

  for (const [clubId, gFor] of [
    [homeId, hg],
    [awayId, ag],
  ] as const) {
    if (clubId === season.clubId) {
      const teammates = Math.max(0, gFor - (starts ? matchGoals : 0))
      distributeClubGoals(scorerMap, clubId, season.year, teammates)
    } else {
      distributeClubGoals(scorerMap, clubId, season.year, gFor)
    }
  }

  const live = season.liveStats
  let rating: number | null = null
  if (starts) {
    live.appearances++
    live.goals += matchGoals
    live.assists += matchAssists
    if (matchGoals > 0) {
      bumpScorer(
        scorerMap,
        'player',
        { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
        matchGoals,
      )
    }
    rating = clamp(
      5.4 +
        season.matchMood / 85 +
        (player.overall - 45) / 40 +
        matchGoals * 0.8 +
        matchAssists * 0.4 +
        (Math.random() * 1.4 - 0.6),
      3.5,
      9.6,
    )
    live.ratingSum += rating
    if (rating >= 7.4) season.matchMood = clamp(season.matchMood + 2 + Math.random() * 2, 28, 88)
    else if (rating < 5.0) season.matchMood = clamp(season.matchMood - (1 + Math.random() * 2), 28, 88)

    live.appsThisSeason++
    if (live.appsThisSeason === live.injuryAtApp && !player.injury) {
      const roll = Math.random()
      if (roll < 0.07) {
        player.injury = {
          matchesLeft: 99,
          label: 'Poważna kontuzja (koniec sezonu)',
          seasonEnding: true,
        }
        live.injuryLabels.push('Poważna kontuzja — praktycznie koniec sezonu')
        season.matchMood = clamp(season.matchMood - 12, 10, 70)
      } else if (roll < 0.45) {
        const n = 3 + rngInt(4)
        player.injury = {
          matchesLeft: n,
          label: `Uraz mięśniowy (${n} meczów)`,
          seasonEnding: false,
        }
        live.injuryLabels.push(`Kontuzja: wypadasz na ${n} meczów`)
        season.matchMood = clamp(season.matchMood - 6, 15, 75)
      } else {
        const n = 1 + rngInt(2)
        player.injury = {
          matchesLeft: n,
          label: `Lekki uraz (${n} meczów)`,
          seasonEnding: false,
        }
        live.injuryLabels.push(`Lekki uraz: ${n} mecz(e) przerwy`)
        season.matchMood = clamp(season.matchMood - 3, 20, 80)
      }
      player.attrs.stamina = clamp(player.attrs.stamina - (1 + rngInt(2)))
    }
  } else if (!player.injury) {
    season.matchMood = clamp(season.matchMood * 0.9 + 48 * 0.1, 28, 88)
  }

  persistScorers(season, scorerMap)

  const opponentId = homeId === season.clubId ? awayId : homeId
  const won =
    (homeId === season.clubId && hg > ag) || (awayId === season.clubId && ag > hg)
  const draw = hg === ag
  let narrative = starts
    ? `Zagrałeś${matchGoals ? ` · ${matchGoals} G` : ''}${matchAssists ? ` · ${matchAssists} A` : ''}${
        rating != null ? ` · ocena ${Math.round(rating * 10) / 10}` : ''
      }.`
    : player.injury
      ? `Nie zagrałeś (kontuzja).`
      : `Zostałeś na ławce.`
  if (won) narrative += ' Zwycięstwo.'
  else if (draw) narrative += ' Remis.'
  else narrative += ' Porażka.'
  if (args.narrativeExtra) narrative += ` ${args.narrativeExtra}`

  return {
    homeId,
    awayId,
    homeGoals: hg,
    awayGoals: ag,
    opponentId,
    played: starts,
    playerGoals: matchGoals,
    playerAssists: matchAssists,
    rating,
    moodBefore,
    moodAfter: season.matchMood,
    narrative,
  }
}

function afterMatchProgress(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number>,
  match: MatchDayResult,
): MatchdayOutcome {
  season.lastMatch = match
  const mid = Math.ceil(season.fixtures.length / 2)
  if (!season.winterBreakTaken && season.fixtureIndex >= mid) {
    season.winterBreakTaken = true
    season.phase = 'winterDone'
    tweakRivalForm(
      season.rival,
      season.liveStats.appearances,
      season.liveStats.goals,
      Math.max(1, Math.floor(season.liveStats.fixturesForPlayer / 2)),
    )
  }

  if (!nextPlayerFixture(season) && season.phase !== 'winterDone') {
    return { kind: 'seasonDone', report: finalizeMatchdaySeason(player, season, strengthMods) }
  }
  return { kind: 'matchResult', match }
}

export function buildWinterSnapshotFromLive(
  player: Player,
  season: SeasonState,
): WinterBreakSnapshot {
  const live = season.liveStats
  const sorted = sortedStandings({ standings: season.standings })
  const place = sorted.findIndex((s) => s.clubId === season.clubId) + 1
  const myRow = season.standings.find((s) => s.clubId === season.clubId)!
  const avgRating = live.appearances
    ? Math.round((live.ratingSum / live.appearances) * 10) / 10
    : 0
  const rivalNote = describeRival(player, season.rival)
  let narrative = `Przerwa zimowa: ${getClub(season.clubId).name} na ${place}. miejscu (${myRow.points} pkt). `
  narrative += `Zagrałeś ${live.appearances} meczów, ${live.goals} G / ${live.assists} A`
  if (avgRating > 0) narrative += `, średnia ${avgRating}`
  narrative += `. ${rivalNote}`
  if (live.injuryLabels.length) {
    narrative += ` Kontuzje: ${live.injuryLabels[live.injuryLabels.length - 1]}.`
  }
  return {
    year: season.year,
    leagueId: season.leagueId,
    clubId: season.clubId,
    place,
    points: myRow.points,
    appearances: live.appearances,
    goals: live.goals,
    assists: live.assists,
    avgRating,
    rivalNote,
    narrative,
  }
}

export function finalizeMatchdaySeason(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number> = {},
): SeasonReport {
  const scorerMap = liveScorerMap(season)
  while (season.fixtureIndex < season.fixtures.length) {
    const f = season.fixtures[season.fixtureIndex]!
    if (f.homeId === season.clubId || f.awayId === season.clubId) {
      season.fixtureIndex++
      continue
    }
    simulateNpcFixture(f.homeId, f.awayId, season, strengthMods, scorerMap)
    season.fixtureIndex++
  }
  persistScorers(season, scorerMap)

  tweakRivalForm(
    season.rival,
    season.liveStats.appearances,
    season.liveStats.goals,
    Math.max(1, Math.floor(season.liveStats.fixturesForPlayer / 2)),
  )

  const live = season.liveStats
  const batch: FixtureBatchState = {
    appearances: live.appearances,
    goals: live.goals,
    assists: live.assists,
    ratingSum: live.ratingSum,
    matchesMissedInjury: live.matchesMissedInjury,
    injuryLabels: [...live.injuryLabels],
    matchMood: season.matchMood,
    appsThisSeason: live.appsThisSeason,
    injuryAtApp: live.injuryAtApp,
  }

  season.phase = 'done'
  season.halfStats = null
  season.pendingGoalMoment = null

  return finalizeSeasonReport(
    player,
    season,
    strengthMods,
    season.standings,
    scorerMap,
    batch,
    live.overallBefore,
    live.fixturesForPlayer,
  )
}

export function playNextMatchday(
  player: Player,
  season: SeasonState,
  strengthMods: Record<string, number> = {},
): MatchdayOutcome {
  if (!season.fixtures.length) {
    startSeasonCalendar(player, season, strengthMods)
  }
  if (season.pendingGoalMoment) return { kind: 'goalMoment' }

  const scorerMap = liveScorerMap(season)
  const next = nextPlayerFixture(season)

  if (!next) {
    return { kind: 'seasonDone', report: finalizeMatchdaySeason(player, season, strengthMods) }
  }

  while (season.fixtureIndex < next.index) {
    const f = season.fixtures[season.fixtureIndex]!
    simulateNpcFixture(f.homeId, f.awayId, season, strengthMods, scorerMap)
    season.fixtureIndex++
  }
  persistScorers(season, scorerMap)

  const { homeId, awayId } = next
  const moodBefore = season.matchMood
  season.matchMood = clamp(
    season.matchMood * 0.82 + 50 * 0.18 + (Math.random() * 10 - 5),
    28,
    88,
  )
  if (chance(0.04)) season.matchMood = clamp(season.matchMood + (4 + Math.random() * 8), 28, 88)
  if (chance(0.03)) season.matchMood = clamp(season.matchMood - (3 + Math.random() * 6), 28, 88)

  const injuredOut =
    player.injury != null && (player.injury.seasonEnding || player.injury.matchesLeft > 0)

  let starts = false
  let boost = 0
  let matchAssists = 0

  if (injuredOut) {
    season.liveStats.matchesMissedInjury++
    if (player.injury && !player.injury.seasonEnding) {
      player.injury.matchesLeft = Math.max(0, player.injury.matchesLeft - 1)
      if (player.injury.matchesLeft === 0) {
        season.liveStats.injuryLabels.push(`Powrót po: ${player.injury.label}`)
        player.injury = null
        season.matchMood = clamp(season.matchMood - 6, 20, 80)
      }
    }
    season.matchMood = clamp(season.matchMood - 2, 15, 80)
  } else {
    starts = chance(
      matchAppearanceChance(
        player,
        season.matchMood,
        season.clubId,
        strengthMods,
        season.rival,
        season.rivalPressure ?? 0,
      ),
    )
    if (starts) {
      boost = (player.overall - 50) * 0.1 + (season.matchMood - 50) * 0.04
      const assistChance =
        (player.position === 'POM' || player.position === 'NP' ? 0.18 : 0.08) *
        (player.attrs.passing / 78) *
        (0.85 + season.matchMood / 250)
      if (chance(Math.min(0.4, assistChance))) matchAssists = 1
    }
  }

  const homePow =
    getEffectiveStrength(homeId, strengthMods) +
    (homeId === season.clubId && starts ? boost : 0) +
    Math.random() * 6 -
    3
  const awayPow =
    getEffectiveStrength(awayId, strengthMods) +
    (awayId === season.clubId && starts ? boost : 0) +
    Math.random() * 6 -
    3
  const baseHg = scoreline(homePow, awayPow * 0.9)
  const baseAg = scoreline(awayPow, homePow * 0.9)

  if (starts && chance(goalMomentChance(player, season.matchMood))) {
    const opponentId = homeId === season.clubId ? awayId : homeId
    const pending: PendingGoalMoment = {
      fixtureIndex: next.index,
      homeId,
      awayId,
      opponentId,
      boost,
      matchAssists,
      moodBefore,
      baseHomeGoals: baseHg,
      baseAwayGoals: baseAg,
      label: 'Okazja bramkowa!',
      description: `Kluczowa okazja przeciwko ${getClub(opponentId).name}. Tylko strzał — wynik akcji decyduje o golu.`,
    }
    season.pendingGoalMoment = pending
    persistScorers(season, scorerMap)
    return { kind: 'goalMoment' }
  }

  const match = finishPlayerMatchCore(player, season, scorerMap, {
    homeId,
    awayId,
    starts,
    matchGoals: 0,
    matchAssists,
    moodBefore,
    homeGoals: baseHg,
    awayGoals: baseAg,
  })
  season.fixtureIndex = next.index + 1
  return afterMatchProgress(player, season, strengthMods, match)
}

export function resolveGoalMoment(
  player: Player,
  season: SeasonState,
  momentScore: number,
  strengthMods: Record<string, number> = {},
): MatchdayOutcome {
  const pending = season.pendingGoalMoment
  if (!pending) {
    const last = season.lastMatch
    if (last) return { kind: 'matchResult', match: last }
    return playNextMatchday(player, season, strengthMods)
  }

  const success = momentScore >= 65
  let matchGoals = 0
  let narrativeExtra = ''
  let hg = pending.baseHomeGoals
  let ag = pending.baseAwayGoals

  if (success) {
    matchGoals = momentScore >= 88 ? 2 : 1
    narrativeExtra = `Okazja wykorzystana (${Math.round(momentScore)}%).`
  } else {
    narrativeExtra = `Okazja zmarnowana (${Math.round(momentScore)}%).`
    if (chance(0.45)) {
      if (pending.homeId === season.clubId) ag += 1
      else hg += 1
      narrativeExtra += ' Rywal domknął kontrę.'
    }
  }

  const scorerMap = liveScorerMap(season)
  const match = finishPlayerMatchCore(player, season, scorerMap, {
    homeId: pending.homeId,
    awayId: pending.awayId,
    starts: true,
    matchGoals,
    matchAssists: pending.matchAssists,
    moodBefore: pending.moodBefore,
    homeGoals: hg,
    awayGoals: ag,
    narrativeExtra,
  })

  season.pendingGoalMoment = null
  season.fixtureIndex = pending.fixtureIndex + 1
  return afterMatchProgress(player, season, strengthMods, match)
}

/** Re-export for callers that used standings helpers via season flow. */
export { playerTablePosition }
