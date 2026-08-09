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

/** Okno tabeli wokół Ciebie (nie tylko top 5). */
export function standingsAroundPlayer(
  season: Pick<SeasonState, 'standings' | 'clubId'>,
  radius = 3,
): { rows: ClubStanding[]; from: number; showTopEllipsis: boolean; showBottomEllipsis: boolean } {
  const sorted = sortedStandings(season)
  const idx = sorted.findIndex((s) => s.clubId === season.clubId)
  if (idx < 0) {
    return {
      rows: sorted.slice(0, Math.min(7, sorted.length)),
      from: 0,
      showTopEllipsis: false,
      showBottomEllipsis: sorted.length > 7,
    }
  }
  const window = radius * 2 + 1
  let from = Math.max(0, idx - radius)
  let to = Math.min(sorted.length, from + window)
  from = Math.max(0, to - window)
  return {
    rows: sorted.slice(from, to),
    from,
    showTopEllipsis: from > 0,
    showBottomEllipsis: to < sorted.length,
  }
}
