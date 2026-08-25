export type Position = 'NP' | 'POM' | 'ŚO' | 'OB'
export type MatchAction = 'shoot' | 'pass' | 'tackle' | 'clear'
export type Formation = '4-4-2' | '4-3-3' | '3-5-2'
export type TacticalStyle = 'attack' | 'balanced' | 'defend'

export type Screen =
  | 'home'
  | 'createManager'
  | 'pickClub'
  | 'hub'
  | 'lineup'
  | 'matchMoment'
  | 'matchResult'
  | 'seasonReport'

export type SeasonPhase = 'playing' | 'done'

export interface Attributes {
  pace: number
  shooting: number
  passing: number
  defending: number
  stamina: number
}

export interface Manager {
  name: string
  reputation: number
  seasonsManaged: number
  clubId: string
}

export interface SquadPlayer {
  id: string
  name: string
  position: Position
  age: number
  overall: number
  attrs: Attributes
  form: number
  fitness: number
  morale: number
}

export interface Tactics {
  formation: Formation
  style: TacticalStyle
}

export interface TeamState {
  clubId: string
  squad: SquadPlayer[]
  tactics: Tactics
  teamChemistry: number
  budget: number
  /** 11 id startujących (kolejność: wg slotów formacji) */
  startingIds: string[]
  benchIds: string[]
}

export interface LeagueFixture {
  homeId: string
  awayId: string
}

export interface ClubStanding {
  clubId: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface ManagerMatchResult {
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  opponentId: string
  narrative: string
  yourGoals: number
  theirGoals: number
  won: boolean
  drawn: boolean
  keyRatings: Array<{ name: string; rating: number }>
  chemistryAfter: number
}

export interface PendingMatchMoment {
  homeId: string
  awayId: string
  opponentId: string
  homeGoals: number
  awayGoals: number
  kind: 'minigame' | 'choice'
  action?: MatchAction
  label: string
  description: string
  choices?: Array<{ id: string; label: string; hint: string }>
}

export interface SeasonRecord {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
}

export interface SeasonState {
  year: number
  leagueId: string
  clubId: string
  /** Skład ligi w tym sezonie (może się różnić po awansach) */
  clubIds: string[]
  standings: ClubStanding[]
  fixtures: LeagueFixture[]
  /** Indeks kolejki (grupy meczów); każdy „round” to N/2 meczów */
  roundIndex: number
  rounds: LeagueFixture[][]
  phase: SeasonPhase
  lastMatch: ManagerMatchResult | null
  pendingMoment: PendingMatchMoment | null
  record: SeasonRecord
  teamChemistry: number
}

export interface SeasonReport {
  year: number
  leagueId: string
  clubId: string
  place: number
  points: number
  record: SeasonRecord
  promotion: boolean
  relegation: boolean
  narrative: string
  nextLeagueId: string | null
}

export interface GameState {
  version: number
  screen: Screen
  manager: Manager | null
  /** Draft przy tworzeniu kariery */
  draftManagerName: string
  team: TeamState | null
  season: SeasonState | null
  seasonReport: SeasonReport | null
  /** clubId → leagueId (ruchome awanse/spadki) */
  clubLeagueIds: Record<string, string>
  log: string[]
}

export const SAVE_KEY = 'gra-karier-manager-v1'
export const SAVE_VERSION = 100

export function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function clampFloat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function createEmptyState(): GameState {
  return {
    version: SAVE_VERSION,
    screen: 'home',
    manager: null,
    draftManagerName: '',
    team: null,
    season: null,
    seasonReport: null,
    clubLeagueIds: {},
    log: [],
  }
}

export function positionLabel(pos: Position): string {
  if (pos === 'NP') return 'Napastnik'
  if (pos === 'POM') return 'Pomocnik of.'
  if (pos === 'ŚO') return 'Pomocnik def.'
  return 'Obrońca'
}

export function styleLabel(style: TacticalStyle): string {
  if (style === 'attack') return 'Ofensywa'
  if (style === 'defend') return 'Defensywa'
  return 'Zbalansowana'
}

export function formationSlots(formation: Formation): Position[] {
  if (formation === '4-3-3') {
    // 4 DEF · 4 MID · 3 ATT
    return ['OB', 'OB', 'OB', 'OB', 'ŚO', 'POM', 'POM', 'ŚO', 'NP', 'NP', 'NP']
  }
  if (formation === '3-5-2') {
    // 3 DEF · 5 MID · 2 ATT · CAM
    return ['OB', 'OB', 'OB', 'ŚO', 'POM', 'ŚO', 'POM', 'POM', 'NP', 'NP', 'POM']
  }
  // 4-4-2: 4 DEF · 4 MID · 2 ATT · CAM
  return ['OB', 'OB', 'OB', 'OB', 'POM', 'ŚO', 'ŚO', 'POM', 'NP', 'NP', 'POM']
}

/** Współrzędne na boisku (x/y 0–100), atak u góry. */
export function formationPitchLayout(formation: Formation): Array<{ x: number; y: number }> {
  const row = (ys: number, xs: number[]) => xs.map((x) => ({ x, y: ys }))
  if (formation === '4-3-3') {
    return [
      ...row(84, [14, 38, 62, 86]),
      ...row(54, [18, 40, 60, 82]),
      ...row(22, [22, 50, 78]),
    ]
  }
  if (formation === '3-5-2') {
    return [
      ...row(84, [22, 50, 78]),
      ...row(56, [8, 28, 50, 72, 92]),
      ...row(22, [36, 64]),
      { x: 50, y: 36 },
    ]
  }
  return [
    ...row(84, [14, 38, 62, 86]),
    ...row(56, [14, 38, 62, 86]),
    ...row(22, [36, 64]),
    { x: 50, y: 36 },
  ]
}

/** Strzałka formy zamiast liczby. */
export function formArrow(form: number): { symbol: string; cls: string; title: string } {
  if (form >= 70) return { symbol: '▲▲', cls: 'form-up-strong', title: 'Świetna forma' }
  if (form >= 58) return { symbol: '▲', cls: 'form-up', title: 'Dobra forma' }
  if (form >= 45) return { symbol: '●', cls: 'form-flat', title: 'Przeciętna forma' }
  if (form >= 32) return { symbol: '▼', cls: 'form-down', title: 'Słaba forma' }
  return { symbol: '▼▼', cls: 'form-down-strong', title: 'Fatalna forma' }
}

export function formArrowHtml(form: number): string {
  const a = formArrow(form)
  return `<span class="form-arrow ${a.cls}" title="${a.title}">${a.symbol}</span>`
}

