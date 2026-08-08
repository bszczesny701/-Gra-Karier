import type { ClubStanding, SeasonState } from '../state/types'

export function sortedStandings(season: Pick<SeasonState, 'standings'>): ClubStanding[] {
  return [...season.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst
    const gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.goalsFor - a.goalsFor
  })
}

export function playerTablePosition(
  season: Pick<SeasonState, 'standings' | 'clubId'>,
): number {
  return sortedStandings(season).findIndex((s) => s.clubId === season.clubId) + 1
}
