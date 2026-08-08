export type Position = 'NP' | 'POM' | 'ŚO' | 'OB'
export type PreferredFoot = 'left' | 'right' | 'both'

export type Screen =
  | 'home'
  | 'create'
  | 'hub'
  | 'decision'
  | 'match'
  | 'transfer'
  | 'seasonEnd'
  | 'ballTrain'

export interface Attributes {
  pace: number
  shooting: number
  passing: number
  defending: number
  stamina: number
}

export interface Player {
  name: string
  age: number
  position: Position
  preferredFoot: PreferredFoot
  overall: number
  attrs: Attributes
  morale: number
  form: number
  reputation: number
  money: number
}

export interface CreateCareerOptions {
  name: string
  position: Position
  preferredFoot: PreferredFoot
  age: number
  overall: number
  clubId: string
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

export interface SeasonState {
  year: number
  week: number
  maxWeeks: number
  leagueId: string
  clubId: string
  standings: ClubStanding[]
  playerAppearances: number
  playerGoals: number
  playerAssists: number
  avgRating: number
  ratingSum: number
  ballTrainedWeek: number
}

export interface MatchResult {
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  playerStarted: boolean
  playerRating: number
  playerGoals: number
  playerAssists: number
  narrative: string
}

export interface TransferOffer {
  clubId: string
  wage: number
  signingBonus: number
  message: string
}

export interface PendingDecision {
  eventId: string
  title: string
  description: string
  choices: Array<{
    id: string
    label: string
    hint: string
  }>
}

export interface BallTrainResult {
  attempts: number
  bestScore: number
  avgScore: number
}

export interface GameState {
  version: number
  screen: Screen
  player: Player | null
  season: SeasonState | null
  lastMatch: MatchResult | null
  pendingDecision: PendingDecision | null
  pendingTransfer: TransferOffer | null
  seasonSummary: string | null
  log: string[]
}

export const SAVE_KEY = 'gra-karier-save-v2'
export const SAVE_VERSION = 2

export const WEEKS_PER_SEASON = 12

export function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function footLabel(foot: PreferredFoot): string {
  if (foot === 'left') return 'Lewa'
  if (foot === 'right') return 'Prawa'
  return 'Obunożny'
}

export function createEmptyState(): GameState {
  return {
    version: SAVE_VERSION,
    screen: 'home',
    player: null,
    season: null,
    lastMatch: null,
    pendingDecision: null,
    pendingTransfer: null,
    seasonSummary: null,
    log: [],
  }
}
