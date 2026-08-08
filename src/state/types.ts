export type Position = 'NP' | 'POM' | 'ŚO' | 'OB'
export type PreferredFoot = 'left' | 'right' | 'both'
export type KeyMatchReason = 'derby' | 'title' | 'relegation' | 'cup' | 'finale'
export type MatchAction = 'shoot' | 'pass'

export type Screen =
  | 'home'
  | 'create'
  | 'hub'
  | 'decision'
  | 'keyMatch'
  | 'match'
  | 'transfer'
  | 'seasonEnd'

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
  formSum: number
  formSamples: number
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
  interactive: boolean
  keyReason: KeyMatchReason | null
  keyLabel: string | null
  autoBasedOnForm: boolean
}

export interface PendingKeyMatch {
  homeId: string
  awayId: string
  opponentId: string
  reason: KeyMatchReason
  label: string
  description: string
}

export interface MatchMomentResult {
  action: MatchAction
  score: number
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

export interface GameState {
  version: number
  screen: Screen
  player: Player | null
  season: SeasonState | null
  lastMatch: MatchResult | null
  pendingDecision: PendingDecision | null
  pendingKeyMatch: PendingKeyMatch | null
  pendingTransfer: TransferOffer | null
  seasonSummary: string | null
  log: string[]
}

export const SAVE_KEY = 'gra-karier-save-v3'
export const SAVE_VERSION = 3

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
    pendingKeyMatch: null,
    pendingTransfer: null,
    seasonSummary: null,
    log: [],
  }
}
