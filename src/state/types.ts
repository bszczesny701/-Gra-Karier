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
    return ['OB', 'OB', 'OB', 'OB', 'ŚO', 'POM', 'POM', 'NP', 'NP', 'NP', 'ŚO']
  }
  if (formation === '3-5-2') {
    return ['OB', 'OB', 'OB', 'ŚO', 'ŚO', 'POM', 'POM', 'POM', 'NP', 'NP', 'ŚO']
  }
  return ['OB', 'OB', 'OB', 'OB', 'POM', 'POM', 'ŚO', 'ŚO', 'NP', 'NP', 'POM']
}
