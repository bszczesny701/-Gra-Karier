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

/**
 * Forma „zasłużona” wynikami — napastnik z 4 golami nie dostanie świetnej formy.
 * Skala 0–100.
 */
export function performanceFormScore(
  position: Position,
  goals: number,
  assists: number,
  leagueApps: number,
  fixtures: number,
  avgRating: number,
): number {
  const appRate = fixtures > 0 ? leagueApps / fixtures : 0
  const ratingBit = (avgRating - 6) * 4

  if (position === 'NP') {
    // Oczekiwania: 0–3 fatalna/słaba, 4–6 słaba/przyzwoita, 7–10 dobra, 11+ świetna
    let score: number
    if (goals <= 2) score = 14 + goals * 5
    else if (goals <= 4) score = 26 + (goals - 2) * 5 // 4 gole ≈ 36 → słaba
    else if (goals <= 6) score = 38 + (goals - 4) * 5 // max ~48 przyzwoita
    else if (goals <= 9) score = 52 + (goals - 6) * 4 // dobra
    else if (goals <= 14) score = 66 + (goals - 9) * 3 // dobra/świetna
    else score = 82 + Math.min(12, goals - 14)

    score += assists * 2
    score += (appRate - 0.55) * 18
    score += ratingBit
    if (goals < 5 && avgRating < 6.5) score -= 6
    return clamp(score, 8, 94)
  }

  if (position === 'POM') {
    const contrib = goals + assists
    let score: number
    if (contrib <= 2) score = 18 + contrib * 6
    else if (contrib <= 5) score = 32 + (contrib - 2) * 5
    else if (contrib <= 9) score = 50 + (contrib - 5) * 4
    else score = 68 + Math.min(18, (contrib - 9) * 3)
    score += (appRate - 0.55) * 20
    score += ratingBit
    return clamp(score, 8, 94)
  }

  // ŚO / OB — mniej goli, więcej ocen i minut
  let score = 30 + leagueApps * 1.2 + (avgRating - 5.5) * 10 + assists * 3 + goals * 4
  score += (appRate - 0.5) * 22
  if (appRate < 0.3) score -= 15
  return clamp(score, 8, 94)
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
