export type Position = 'NP' | 'POM' | 'ŚO' | 'OB'
export type PreferredFoot = 'left' | 'right' | 'both'
export type KeyMatchReason = 'promotion' | 'title' | 'relegation' | 'cup' | 'finale'
export type MatchAction = 'shoot' | 'pass'
export type FormLabel = 'świetna' | 'dobra' | 'przyzwoita' | 'słaba' | 'fatalna'
export type CupStage =
  | 'out'
  | 'r32'
  | 'r16'
  | 'qf'
  | 'sf'
  | 'final'
  | 'winner'

export type Screen =
  | 'home'
  | 'create'
  | 'hub'
  | 'decision'
  | 'keyMatch'
  | 'seasonReport'
  | 'transferChoice'
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

export interface ScorerEntry {
  name: string
  clubId: string
  goals: number
  isPlayer: boolean
}

export interface SeasonState {
  year: number
  leagueId: string
  clubId: string
  standings: ClubStanding[]
  /** Czy decyzja przed sezonem już podjęta */
  preseasonDone: boolean
}

export interface PendingKeyMatch {
  homeId: string
  awayId: string
  opponentId: string
  reason: KeyMatchReason
  label: string
  description: string
  /** Jak wpływa na raport po sukcesie/porażce akcji */
  stake: 'leaguePoints' | 'cupProgress'
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
  leagueId: string
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

export interface SeasonReport {
  year: number
  leagueId: string
  clubId: string
  place: number
  points: number
  played: number
  appearances: number
  possibleAppearances: number
  goals: number
  assists: number
  avgRating: number
  avgForm: number
  formLabel: FormLabel
  overallBefore: number
  overallAfter: number
  overallDelta: number
  cupStage: CupStage
  cupLabel: string
  scorers: ScorerEntry[]
  playerScorerRank: number | null
  standings: ClubStanding[]
  narrative: string
  keyMatchesPending: PendingKeyMatch[]
  keyMatchesDone: number
  promotion: boolean
  relegation: boolean
  title: boolean
  /** Czy klub chce przedłużyć kontrakt */
  contractRenewed: boolean
  contractNote: string
}

export interface GameState {
  version: number
  screen: Screen
  player: Player | null
  season: SeasonState | null
  pendingDecision: PendingDecision | null
  pendingKeyMatch: PendingKeyMatch | null
  pendingKeyQueue: PendingKeyMatch[]
  seasonReport: SeasonReport | null
  transferOffers: TransferOffer[]
  seasonSummary: string | null
  log: string[]
}

export const SAVE_KEY = 'gra-karier-save-v6'
export const SAVE_VERSION = 6

export function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function footLabel(foot: PreferredFoot): string {
  if (foot === 'left') return 'Lewa'
  if (foot === 'right') return 'Prawa'
  return 'Obunożny'
}

export function formLabelFromAvg(avg: number): FormLabel {
  if (avg >= 78) return 'świetna'
  if (avg >= 62) return 'dobra'
  if (avg >= 48) return 'przyzwoita'
  if (avg >= 32) return 'słaba'
  return 'fatalna'
}

export function cupStageLabel(stage: CupStage): string {
  switch (stage) {
    case 'winner':
      return 'Zdobywca Pucharu Polski'
    case 'final':
      return 'Finał Pucharu Polski'
    case 'sf':
      return 'Półfinał PP'
    case 'qf':
      return 'Ćwierćfinał PP'
    case 'r16':
      return '1/8 PP'
    case 'r32':
      return '1/16 PP'
    case 'out':
      return 'Odpadnięcie z PP'
    default:
      return 'Puchar Polski'
  }
}

export function createEmptyState(): GameState {
  return {
    version: SAVE_VERSION,
    screen: 'home',
    player: null,
    season: null,
    pendingDecision: null,
    pendingKeyMatch: null,
    pendingKeyQueue: [],
    seasonReport: null,
    transferOffers: [],
    seasonSummary: null,
    log: [],
  }
}
