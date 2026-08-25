import { getClub, getLeague, LEAGUES, formatStars, starsLabel } from '../data/clubs'
import type {
  Formation,
  GameState,
  SeasonReport,
  TacticalStyle,
} from '../state/types'
import { formationPlan } from '../state/types'
import { pushLog } from '../state/gameState'
import {
  applyPromotionRelegation,
  createManagerSeason,
  initClubLeagueMap,
} from './leagueSim'
import { beginMatchday, resolveMomentChoice, resolveMomentMinigame } from './matchEngine'
import { createTeamState, pickDefaultLineup } from './squadGen'
import { applyFormationDefaultOrder, validateLineup } from './tactics'
import { playerTablePosition, sortedStandings, standingsAroundPlayer } from './standings'

export { playerTablePosition, sortedStandings, standingsAroundPlayer }
export { beginMatchday, resolveMomentChoice, resolveMomentMinigame }

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
  const year = new Date().getFullYear()
  state.manager = {
    name: state.draftManagerName || 'Trener',
    reputation: 35,
    seasonsManaged: 0,
    clubId,
  }
  state.team = createTeamState(clubId)
  state.season = createManagerSeason(state, clubId, year)
  state.season.teamChemistry = state.team.teamChemistry
  state.seasonReport = null
  state.screen = 'hub'
  pushLog(
    state,
    `${state.manager.name} obejmuje ${club.name} (${formatStars(club.stars)} ${starsLabel(club.stars)}).`,
  )
}

export function openLineup(state: GameState): void {
  if (!state.team || !state.season || state.season.phase !== 'playing') return
  state.screen = 'lineup'
}

export function setFormation(state: GameState, formation: Formation): void {
  if (!state.team) return
  state.team.tactics.formation = formation
  applyFormationDefaultOrder(state.team)
}

export function setStyle(state: GameState, style: TacticalStyle): void {
  if (!state.team) return
  state.team.tactics.style = style
}

/** Ustaw konkretnego zawodnika na slot XI (0–10). */
export function assignSlot(state: GameState, slotIndex: number, playerId: string): void {
  const team = state.team
  if (!team || slotIndex < 0 || slotIndex > 10) return
  const prev = team.startingIds[slotIndex]
  if (prev === playerId) return

  const benchIdx = team.benchIds.indexOf(playerId)
  const otherSlot = team.startingIds.indexOf(playerId)

  if (otherSlot >= 0) {
    // swap w XI
    team.startingIds[otherSlot] = prev!
    team.startingIds[slotIndex] = playerId
    return
  }

  if (benchIdx >= 0) {
    team.startingIds[slotIndex] = playerId
    team.benchIds[benchIdx] = prev!
    return
  }

  // spoza 11+ławki — zamień
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
  manager.reputation = Math.max(
    10,
    Math.min(
      99,
      manager.reputation +
        (place <= 2 ? 8 : place <= 6 ? 3 : place >= season.clubIds.length - 2 ? -5 : 1),
    ),
  )

  const league = getLeague(season.leagueId)
  let narrative = `Sezon ${season.year}: ${place}. miejsce w ${league.name} (${row?.points ?? 0} pkt). `
  if (promotion) narrative += 'Awans!'
  else if (relegation) narrative += 'Spadek.'
  else narrative += 'Zostajesz w lidze.'

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
  }
  state.seasonReport = report
  state.screen = 'seasonReport'
  pushLog(state, narrative)
}

export function startNextSeason(state: GameState): void {
  const manager = state.manager!
  const team = state.team!
  const prev = state.season!
  const year = prev.year + 1

  // Regeneracja lekka: fitness/form reset, lekki rozwój młodych
  for (const p of team.squad) {
    p.fitness = 80 + Math.floor(Math.random() * 15)
    p.form = 48 + Math.floor(Math.random() * 16)
    if (p.age <= 24 && Math.random() < 0.45) {
      p.overall = Math.min(92, p.overall + 1)
    } else if (p.age >= 33 && Math.random() < 0.4) {
      p.overall = Math.max(32, p.overall - 1)
    }
    p.age += 1
  }
  team.teamChemistry = Math.max(40, Math.min(70, team.teamChemistry))
  const plan = formationPlan(team.tactics.formation)
  const picked = pickDefaultLineup(team.squad, plan)
  team.startingIds = picked.startingIds
  team.benchIds = picked.benchIds

  state.season = createManagerSeason(state, manager.clubId, year)
  state.season.teamChemistry = team.teamChemistry
  state.seasonReport = null
  state.screen = 'hub'
  const league = getLeague(state.season.leagueId)
  pushLog(state, `Nowy sezon ${year} — ${getClub(manager.clubId).name} w ${league.name}.`)
}

export function playNextMatchFromHub(state: GameState): string | null {
  if (!state.season || state.season.phase !== 'playing') return 'Sezon zakończony'
  state.screen = 'lineup'
  return null
}
