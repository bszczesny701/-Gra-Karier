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
  | 'startOffers'
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
  /** Aktualna kontuzja — mecze do opuszczenia */
  injury: PlayerInjury | null
}

export interface PlayerInjury {
  matchesLeft: number
  label: string
  /** Kontuzja sezonowa — praktycznie koniec sezonu */
  seasonEnding: boolean
}

export interface CreateCareerOptions {
  name: string
  position: Position
  preferredFoot: PreferredFoot
  age: number
  overall: number
  /** Uzupełniane po wyborze oferty startowej */
  clubId?: string
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
  /** Czy wykorzystano okno transferowe w trakcie sezonu */
  midTransferDone: boolean
  /** Opieka / ostrożność — obniża ryzyko kontuzji (0–5) */
  injuryCare: number
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
  /** Szansa na regularną grę (0–100), głównie oferty startowe */
  playChance?: number
}

export interface PendingDecision {
  eventId: string
  title: string
  speaker: string
  speakerRole: string
  messages: string[]
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
  /** Opis kontuzji w sezonie (jeśli była) */
  injuryNote: string | null
  matchesMissedInjury: number
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
  /** Trwałe modyfikatory siły klubów (np. + po awansie) */
  clubStrengthMods: Record<string, number>
}

export const SAVE_KEY = 'gra-karier-save-v9'
export const SAVE_VERSION = 9

export function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Sufit kariery — nawet mega dobra ścieżka ~80 OVR (top Ekstraklasa). */
export const CAREER_OVR_CAP = 80

/** Limity zmiany OVR po sezonie wg wieku. */
export function clampSeasonOvrDelta(age: number, raw: number): number {
  const maxDown = age <= 28 ? -2 : age <= 33 ? -3 : -4
  // Wolniejszy rozwój: młody talent +2–3 max, nie +4/+5 co sezon
  const maxUp = age <= 21 ? 3 : age <= 25 ? 2 : 2
  let delta = Math.max(maxDown, Math.min(maxUp, Math.round(raw)))

  // +3 u juniorów rzadkie
  if (age <= 21 && delta >= 3) {
    if (Math.random() > 0.28) delta = 2
  }
  // Po 25. +2 też nie co sezon
  if (age > 25 && delta >= 2) {
    if (Math.random() > 0.4) delta = 1
  }
  // Po 30. wzrost wyjątkowy
  if (age >= 30 && delta > 1) delta = 1
  if (age >= 32 && delta > 0 && Math.random() > 0.35) delta = 0
  if (age >= 35 && delta > 0) delta = 0

  return delta
}

export function footLabel(foot: PreferredFoot): string {
  if (foot === 'left') return 'Lewa'
  if (foot === 'right') return 'Prawa'
  return 'Obunożny'
}

export function formLabelFromAvg(avg: number): FormLabel {
  if (avg >= 76) return 'świetna'
  if (avg >= 63) return 'dobra'
  if (avg >= 47) return 'przyzwoita'
  if (avg >= 34) return 'słaba'
  return 'fatalna'
}

/**
 * Forma sezonu względem oczekiwań pozycji.
 * Spełnienie normy ≈ 52 (przyzwoita). Fatalna tylko przy wyraźnie pustym sezonie.
 */
export function performanceFormScore(
  position: Position,
  goals: number,
  assists: number,
  leagueApps: number,
  fixtures: number,
  avgRating: number,
  overall = 55,
): number {
  const apps = Math.max(leagueApps, 0)
  const appRate = fixtures > 0 ? apps / fixtures : 0
  const ovrBit = (overall - 50) * 0.004

  let expectedGoals: number
  let expectedAssists: number
  if (position === 'NP') {
    expectedGoals = Math.max(1.2, apps * (0.2 + ovrBit))
    expectedAssists = Math.max(0.4, apps * 0.07)
  } else if (position === 'POM') {
    expectedGoals = Math.max(0.6, apps * (0.08 + ovrBit * 0.5))
    expectedAssists = Math.max(0.8, apps * (0.12 + ovrBit * 0.5))
  } else {
    expectedGoals = Math.max(0.2, apps * 0.03)
    expectedAssists = Math.max(0.3, apps * 0.05)
  }

  const produced = goals + assists * 0.75
  const expected = expectedGoals + expectedAssists * 0.75
  const outRatio = produced / Math.max(0.8, expected)

  // Baza = przyzwoita; wynik względem normy
  let score = 52
  score += clamp((outRatio - 1) * 18, -16, 24)
  score += clamp((avgRating - 6.15) * 7, -12, 14)

  if (apps === 0) score -= 10
  else if (appRate >= 0.65) score += 5
  else if (appRate >= 0.45) score += 2
  else if (appRate < 0.22) score -= 3

  // Podłogi / sufity miękkie (nagradzają dorobek, nie tylko karzą)
  if (position === 'NP') {
    if (goals >= 12) score = Math.max(score, 68)
    else if (goals >= 8) score = Math.max(score, 58)
    else if (goals >= 5) score = Math.max(score, 50)
    if (goals === 0 && apps >= 10) score = Math.min(score, 38)
  } else if (position === 'POM') {
    const contrib = goals + assists
    if (contrib >= 12) score = Math.max(score, 68)
    else if (contrib >= 7) score = Math.max(score, 56)
    if (contrib === 0 && apps >= 12) score = Math.min(score, 40)
  } else if (avgRating >= 7.0 && appRate >= 0.55) {
    score = Math.max(score, 60)
  }

  return clamp(score, 20, 94)
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
    clubStrengthMods: {},
  }
}
