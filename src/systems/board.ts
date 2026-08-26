import { getClub, getLeague, LEAGUES } from '../data/clubs'
import type { BoardExpectation, BoardGoalId, GameState, SeasonState } from '../state/types'
import { clamp } from '../state/types'

const GOAL_META: Record<
  BoardGoalId,
  { label: string; detail: (target: number, ok: number) => string }
> = {
  title: {
    label: 'Walka o mistrzostwo',
    detail: (t, ok) => `Cel: top ${t}. Akceptowalne: do ${ok}. miejsca.`,
  },
  podium: {
    label: 'Podium / europejskie puchary',
    detail: (t, ok) => `Cel: top ${t}. Akceptowalne: do ${ok}. miejsca.`,
  },
  europe: {
    label: 'Górna ósemka',
    detail: (t, ok) => `Cel: top ${t}. Akceptowalne: do ${ok}. miejsca.`,
  },
  mid: {
    label: 'Spokojny środek tabeli',
    detail: (t, ok) => `Cel: do ${t}. miejsca. Akceptowalne: do ${ok}.`,
  },
  survive: {
    label: 'Uniknąć spadku',
    detail: (t, ok) => `Cel: bezpieczne miejsce (do ${t}.). Granica: ${ok}.`,
  },
}

function leagueForClub(clubId: string): string {
  for (const league of LEAGUES) {
    if (league.clubIds.includes(clubId)) return league.id
  }
  return 'liga-1'
}

/** Ranking siły w lidze (1 = najsilniejszy). */
export function clubStrengthRank(clubId: string, leagueId?: string): number {
  const lid = leagueId ?? leagueForClub(clubId)
  const league = getLeague(lid)
  const sorted = [...league.clubIds].sort(
    (a, b) => getClub(b).strength - getClub(a).strength || a.localeCompare(b),
  )
  const idx = sorted.indexOf(clubId)
  return idx >= 0 ? idx + 1 : Math.ceil(league.clubIds.length / 2)
}

export function boardExpectationForClub(clubId: string, leagueId?: string): BoardExpectation {
  const lid = leagueId ?? leagueForClub(clubId)
  const n = getLeague(lid).clubIds.length
  const rank = clubStrengthRank(clubId, lid)

  let goal: BoardGoalId
  let targetPlace: number
  let minAcceptablePlace: number

  if (rank <= 3) {
    goal = 'title'
    targetPlace = 2
    minAcceptablePlace = 3
  } else if (rank <= 6) {
    goal = 'podium'
    targetPlace = 3
    minAcceptablePlace = 5
  } else if (rank <= 10) {
    goal = 'europe'
    targetPlace = Math.min(6, Math.max(4, Math.ceil(n * 0.35)))
    minAcceptablePlace = Math.min(9, Math.max(6, Math.ceil(n * 0.5)))
  } else if (rank <= Math.ceil(n * 0.75)) {
    goal = 'mid'
    targetPlace = Math.ceil(n * 0.55)
    minAcceptablePlace = Math.ceil(n * 0.72)
  } else {
    goal = 'survive'
    targetPlace = Math.max(1, n - 3)
    minAcceptablePlace = n - 1
  }

  const meta = GOAL_META[goal]
  return {
    goal,
    targetPlace,
    minAcceptablePlace,
    label: meta.label,
    detail: meta.detail(targetPlace, minAcceptablePlace),
  }
}

/** Startowe zaufanie — top kluby są mniej cierpliwe. */
export function initialBoardTrust(clubId: string, leagueId?: string): number {
  const exp = boardExpectationForClub(clubId, leagueId)
  if (exp.goal === 'title') return 52
  if (exp.goal === 'podium') return 58
  if (exp.goal === 'europe') return 62
  if (exp.goal === 'mid') return 66
  return 70
}

export type BoardVerdict = 'exceeded' | 'met' | 'missed' | 'failed'

export function boardVerdict(place: number, exp: BoardExpectation, relegated: boolean): BoardVerdict {
  if (relegated && exp.goal !== 'survive') return 'failed'
  if (relegated && exp.goal === 'survive') return 'failed'
  if (place <= exp.targetPlace) return 'exceeded'
  if (place <= exp.minAcceptablePlace) return 'met'
  if (place >= exp.minAcceptablePlace + 4) return 'failed'
  return 'missed'
}

export function boardTrustDelta(
  place: number,
  exp: BoardExpectation,
  relegated: boolean,
): { delta: number; verdict: BoardVerdict; summary: string } {
  const verdict = boardVerdict(place, exp, relegated)
  let delta = 0
  let summary = ''

  if (verdict === 'exceeded') {
    delta = exp.goal === 'title' && place === 1 ? 28 : 18
    summary = `Zarząd zachwycony — cel „${exp.label}” przebity (${place}. miejsce).`
  } else if (verdict === 'met') {
    delta = 7
    summary = `Zarząd zadowolony — wynik w granicach oczekiwań (${place}.).`
  } else if (verdict === 'missed') {
    delta = -14
    summary = `Zarząd zawiedziony — poniżej oczekiwań (${place}., cel top ${exp.targetPlace}).`
  } else {
    delta = relegated ? -32 : -22
    summary = relegated
      ? `Katastrofa — spadek. Zaufanie zarządu runęło.`
      : `Zarząd wściekły — daleko od celu „${exp.label}” (${place}.).`
  }

  return { delta, verdict, summary }
}

export function applyBoardTrust(current: number, delta: number): number {
  return clamp(current + delta, 0, 100)
}

export const SACK_TRUST_THRESHOLD = 28
export const WARN_TRUST_THRESHOLD = 40

export function shouldSack(trust: number): boolean {
  return trust < SACK_TRUST_THRESHOLD
}

export function trustLabel(trust: number): string {
  if (trust >= 75) return 'Bardzo wysokie'
  if (trust >= 55) return 'Stabilne'
  if (trust >= WARN_TRUST_THRESHOLD) return 'Napięte'
  if (trust >= SACK_TRUST_THRESHOLD) return 'Krytyczne'
  return 'Koniec cierpliwości'
}

export function seasonGoalProgress(season: SeasonState): {
  place: number
  exp: BoardExpectation
  onTrack: boolean
  statusText: string
} {
  const sorted = [...season.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst
    const gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.goalsFor - a.goalsFor
  })
  const place = sorted.findIndex((r) => r.clubId === season.clubId) + 1 || season.clubIds.length
  const exp = boardExpectationForClub(season.clubId, season.leagueId)
  const onTrack = place <= exp.minAcceptablePlace
  const statusText = onTrack
    ? place <= exp.targetPlace
      ? `Na kursie celu (${place}. / cel ${exp.targetPlace}.)`
      : `W strefie akceptowalnej (${place}. / max ${exp.minAcceptablePlace}.)`
    : `Poniżej oczekiwań (${place}. — cel top ${exp.targetPlace})`
  return { place, exp, onTrack, statusText }
}

/** Przegląd zarządu mid-season: ±trust + mail. Nie zwalnia. */
export function maybeBoardReview(state: GameState): BoardReviewResult | null {
  const season = state.season
  const manager = state.manager
  if (!season || !manager) return null

  const round = season.roundIndex
  if (round <= 0) return null
  if (manager.lastBoardReviewRound === round) return null

  const row = season.standings.find((r) => r.clubId === season.clubId)
  const form = row?.form ?? []
  const last3 = form.slice(-3)
  const prog = seasonGoalProgress(season)
  const crisis = last3.length >= 3 && last3.every((x) => x === 'L') && !prog.onTrack
  const checkpoint = round > 0 && round % 5 === 0
  if (!checkpoint && !crisis) return null

  const recent = form.slice(-5)
  const wins = recent.filter((x) => x === 'W').length
  const losses = recent.filter((x) => x === 'L').length

  let delta = 0
  let summary = ''

  if (crisis) {
    delta = -(10 + Math.min(5, losses))
    summary = `Kryzys formy (3 porażki z rzędu) przy ${prog.place}. miejscu — poniżej celu „${prog.exp.label}”.`
  } else if (prog.onTrack && wins >= 2 && losses <= 1) {
    delta = 4 + Math.min(4, wins)
    summary = `Dobra passa i kurs na cel „${prog.exp.label}” (${prog.place}.).`
  } else if (prog.onTrack) {
    delta = wins > losses ? 2 : 0
    summary = `Sytuacja akceptowalna — ${prog.place}. miejsce, cel „${prog.exp.label}”.`
  } else if (losses >= 3) {
    delta = -(8 + Math.min(4, losses))
    summary = `Słaba seria i pozycja ${prog.place}. poniżej oczekiwań (cel top ${prog.exp.targetPlace}).`
  } else {
    delta = -(6 + Math.min(4, Math.max(0, prog.place - prog.exp.minAcceptablePlace)))
    summary = `Poniżej oczekiwań zarządu (${prog.place}. / cel top ${prog.exp.targetPlace}).`
  }

  const before = manager.boardTrust
  manager.boardTrust = applyBoardTrust(before, delta)
  manager.lastBoardReviewRound = round

  return {
    delta,
    before,
    after: manager.boardTrust,
    summary,
    crisis,
    place: prog.place,
    goalLabel: prog.exp.label,
  }
}

export interface BoardReviewResult {
  delta: number
  before: number
  after: number
  summary: string
  crisis: boolean
  place: number
  goalLabel: string
}
