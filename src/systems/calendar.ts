import type {
  CalendarDay,
  GameState,
  ScheduledMatch,
  SeasonCalendar,
  SeasonState,
  SeasonWeek,
  TransferWindow,
} from '../state/types'
import { createCupState } from './cup'

const WEEKDAY_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] as const

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_SHORT[weekday] ?? '?'
}

function makeDays(
  patch: Partial<Record<number, CalendarDay>> = {},
): CalendarDay[] {
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => {
    if (patch[weekday]) return patch[weekday]!
    if (weekday === 1 || weekday === 3) {
      return { weekday, activity: 'training' }
    }
    return { weekday, activity: 'rest' }
  })
}

function makeWeek(
  index: number,
  label: string,
  transferWindow: TransferWindow,
  days: CalendarDay[],
  matchIds: string[] = [],
  leagueRoundIndex?: number,
): SeasonWeek {
  return { index, label, transferWindow, days, matchIds, leagueRoundIndex }
}

/** Unikalne, rosnące indeksy kolejek ligowych pod rundy pucharu. */
function planCupLeagueRounds(leagueRoundCount: number, cupRounds: number): number[] {
  if (cupRounds <= 0 || leagueRoundCount <= 0) return []
  const slots: number[] = []
  for (let c = 0; c < cupRounds; c++) {
    const lr = Math.min(
      leagueRoundCount - 1,
      Math.max(0, Math.floor(((c + 1) * leagueRoundCount) / (cupRounds + 1))),
    )
    slots.push(lr)
  }
  for (let i = 1; i < slots.length; i++) {
    if (slots[i]! <= slots[i - 1]!) {
      slots[i] = Math.min(leagueRoundCount - 1, slots[i - 1]! + 1)
    }
  }
  return slots
}

/**
 * Buduje kalendarz + mecze + opcjonalny puchar i dokleja do SeasonState.
 * Wołać zaraz po utworzeniu podstawowego sezonu ligowego.
 */
export function buildSeasonSchedule(state: GameState, season: SeasonState): void {
  const matches: Record<string, ScheduledMatch> = {}
  const cup = createCupState(state, season.clubId, matches)
  const weeks: SeasonWeek[] = []
  let wi = 0

  weeks.push(makeWeek(wi++, 'Przygotowania 1', 'summer', makeDays()))
  weeks.push(makeWeek(wi++, 'Przygotowania 2', 'summer', makeDays()))

  const leagueRounds = season.rounds
  const mid = Math.floor(leagueRounds.length / 2)
  const cupAtLeague = cup ? planCupLeagueRounds(leagueRounds.length, cup.totalRounds) : []
  if (cup) {
    cup.calendarWeekForRound = Array(cup.totalRounds).fill(-1)
  }

  for (let li = 0; li < leagueRounds.length; li++) {
    if (li === mid) {
      weeks.push(makeWeek(wi++, 'Przerwa zimowa 1', 'winter', makeDays()))
      weeks.push(makeWeek(wi++, 'Przerwa zimowa 2', 'winter', makeDays()))
    }

    const round = leagueRounds[li]!
    const weekMatchIds: string[] = []
    const dayPatch: Partial<Record<number, CalendarDay>> = {}

    for (let fi = 0; fi < round.length; fi++) {
      const f = round[fi]!
      const id = `league-r${li}-f${fi}`
      matches[id] = {
        id,
        competition: 'league',
        homeId: f.homeId,
        awayId: f.awayId,
        homeGoals: null,
        awayGoals: null,
        leagueRound: li,
      }
      weekMatchIds.push(id)
    }

    const yourLeague = round.find((f) => f.homeId === season.clubId || f.awayId === season.clubId)
    if (yourLeague) {
      const midId = weekMatchIds.find((id) => {
        const m = matches[id]!
        return m.homeId === yourLeague.homeId && m.awayId === yourLeague.awayId
      })
      if (midId) {
        dayPatch[5] = { weekday: 5, activity: 'match', matchId: midId }
      }
    }

    const cupRoundIdx = cupAtLeague.indexOf(li)
    if (cup && cupRoundIdx >= 0) {
      cup.calendarWeekForRound[cupRoundIdx] = wi
      if (cupRoundIdx === 0) {
        for (const id of cup.rounds[0] ?? []) {
          if (!weekMatchIds.includes(id)) weekMatchIds.push(id)
        }
        const yourCup = (cup.rounds[0] ?? [])
          .map((id) => matches[id]!)
          .find((m) => m.homeId === season.clubId || m.awayId === season.clubId)
        if (yourCup) {
          dayPatch[2] = { weekday: 2, activity: 'match', matchId: yourCup.id }
        }
      }
    }

    weeks.push(
      makeWeek(wi++, `Kolejka ${li + 1}`, null, makeDays(dayPatch), weekMatchIds, li),
    )
  }

  const calendar: SeasonCalendar = { weekIndex: 0, weeks }
  season.matches = matches
  season.calendar = calendar
  season.cup = cup
}

export function currentWeek(season: SeasonState): SeasonWeek | null {
  return season.calendar?.weeks[season.calendar.weekIndex] ?? null
}

function dayOrderForMatch(season: SeasonState, matchId: string): number {
  const week = currentWeek(season)
  if (!week) return 99
  const day = week.days.find((d) => d.matchId === matchId)
  return day?.weekday ?? 50
}

/** Najbliższy nierozgrany mecz użytkownika w bieżącym tygodniu. */
export function nextUserMatch(season: SeasonState): ScheduledMatch | null {
  const week = currentWeek(season)
  if (!week || !season.matches) return null
  const clubId = season.clubId
  const pending = week.matchIds
    .map((id) => season.matches[id])
    .filter(
      (m): m is ScheduledMatch =>
        Boolean(m) && m.homeGoals == null && (m.homeId === clubId || m.awayId === clubId),
    )
  if (!pending.length) return null
  pending.sort((a, b) => dayOrderForMatch(season, a.id) - dayOrderForMatch(season, b.id))
  return pending[0] ?? null
}

export function canAdvanceWeek(season: SeasonState): boolean {
  if (season.phase !== 'playing') return false
  if (!season.calendar?.weeks?.length) return false
  if (season.calendar.weekIndex >= season.calendar.weeks.length) return false
  return !nextUserMatch(season)
}

export function transferWindowLabel(w: TransferWindow): string {
  if (w === 'summer') return 'Okienko letnie'
  if (w === 'winter') return 'Okienko zimowe'
  return 'Okienko zamknięte'
}

export function dayActivityLabel(activity: CalendarDay['activity']): string {
  if (activity === 'training') return 'Trening'
  if (activity === 'match') return 'Mecz'
  return 'Wolne'
}
