export type Position = 'NP' | 'POM' | 'ŚO' | 'OB'
export type PreferredFoot = 'left' | 'right' | 'both'
export type KeyMatchReason = 'promotion' | 'title' | 'relegation' | 'cup' | 'finale'
export type MatchAction = 'shoot' | 'pass' | 'tackle' | 'clear'
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
  | 'matchResult'
  | 'seasonReport'
  | 'transferChoice'
  | 'seasonEnd'
  | 'winterBreak'
  | 'careerEnd'

/** playing = w trakcie, winterDone = po zimie, done = sezon domknięty */
export type SeasonPhase = 'playing' | 'winterDone' | 'done' | 'ready' | 'firstHalfDone' | 'secondHalf'

export interface LeagueFixture {
  homeId: string
  awayId: string
}

export interface MatchDayResult {
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  opponentId: string
  played: boolean
  playerGoals: number
  playerAssists: number
  rating: number | null
  moodBefore: number
  moodAfter: number
  narrative: string
}

export interface PendingGoalMoment {
  fixtureIndex: number
  homeId: string
  awayId: string
  opponentId: string
  boost: number
  matchAssists: number
  moodBefore: number
  baseHomeGoals: number
  baseAwayGoals: number
  label: string
  description: string
  /** Akcja minigierki zależna od pozycji */
  action: MatchAction
  /** Co daje sukces: gol / asysta / zatrzymanie akcji rywala */
  reward: 'goal' | 'assist' | 'stop'
}

export interface LiveSeasonStats {
  appearances: number
  goals: number
  assists: number
  ratingSum: number
  matchesMissedInjury: number
  injuryLabels: string[]
  appsThisSeason: number
  injuryAtApp: number
  overallBefore: number
  fixturesForPlayer: number
  scorerEntries: ScorerEntry[]
}

export interface Attributes {
  pace: number
  shooting: number
  passing: number
  defending: number
  stamina: number
}

export interface PlayerContract {
  clubId: string
  yearsLeft: number
  wage: number
}

export interface PlayerLoan {
  parentClubId: string
  parentLeagueId: string
  /** Po 2. połowie / końcu sezonu wracasz do rodzica */
  returnAfterSeason: boolean
}

export interface PositionalRival {
  name: string
  overall: number
  form: number
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
  injury: PlayerInjury | null
  contract: PlayerContract
  loan: PlayerLoan | null
  peakOverall: number
  clubsPlayed: string[]
  seasonsPlayed: number
  titles: number
  retired: boolean
}

export interface PlayerInjury {
  matchesLeft: number
  label: string
  seasonEnding: boolean
}

export interface CreateCareerOptions {
  name: string
  position: Position
  preferredFoot: PreferredFoot
  age: number
  overall: number
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

/** Postęp 1. połowy — kontynuacja w 2. połowie */
export interface SeasonHalfProgress {
  appearances: number
  goals: number
  assists: number
  ratingSum: number
  matchesMissedInjury: number
  injuryLabels: string[]
  matchMood: number
  appsThisSeason: number
  injuryAtApp: number
  overallBefore: number
  fixturesForPlayer: number
  scorerEntries: ScorerEntry[]
}

export interface SeasonState {
  year: number
  leagueId: string
  clubId: string
  standings: ClubStanding[]
  preseasonDone: boolean
  midTransferDone: boolean
  injuryCare: number
  rival: PositionalRival
  rivalPressure: number
  phase: SeasonPhase
  /** Legacy half-season — nieużywane w v11 */
  halfStats: SeasonHalfProgress | null
  /** Terminarz ligowy (budowany raz) */
  fixtures: LeagueFixture[]
  fixtureIndex: number
  matchMood: number
  liveStats: LiveSeasonStats
  lastMatch: MatchDayResult | null
  pendingGoalMoment: PendingGoalMoment | null
  winterBreakTaken: boolean
}

export interface PendingKeyMatch {
  homeId: string
  awayId: string
  opponentId: string
  reason: KeyMatchReason
  label: string
  description: string
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
  playChance?: number
  kind?: 'transfer' | 'loan'
  /** Lata kontraktu przy transferze (1–3) */
  contractYears?: number
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
  contractRenewed: boolean
  contractNote: string
  /** Propozycja nowego kontraktu gdy kończy się stary */
  proposedContractYears: number
  injuryNote: string | null
  matchesMissedInjury: number
  rivalNote: string | null
}

export interface WinterBreakSnapshot {
  year: number
  leagueId: string
  clubId: string
  place: number
  points: number
  appearances: number
  goals: number
  assists: number
  avgRating: number
  rivalNote: string
  narrative: string
}

export interface CareerSummary {
  name: string
  seasonsPlayed: number
  peakOverall: number
  clubsCount: number
  titles: number
  finalAge: number
  finalOverall: number
  narrative: string
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
  winterSnapshot: WinterBreakSnapshot | null
  careerSummary: CareerSummary | null
  log: string[]
  clubStrengthMods: Record<string, number>
}

export const SAVE_KEY = 'gra-karier-save-v11'
export const SAVE_VERSION = 11

export function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Limity zmiany OVR po sezonie (kotwica ±5 na starcie kariery). */
export function clampSeasonOvrDelta(age: number, raw: number, overall = 55): number {
  const maxDown = age <= 28 ? -2 : age <= 33 ? -3 : -4
  const maxUp =
    age <= 21 && overall <= 55 ? 5 : age <= 25 && overall < 60 ? 4 : age <= 25 ? 3 : age <= 28 ? 2 : 1
  return Math.max(maxDown, Math.min(maxUp, Math.round(raw)))
}

export function footLabel(foot: PreferredFoot): string {
  if (foot === 'left') return 'Lewa'
  if (foot === 'right') return 'Prawa'
  return 'Obunożny'
}

export function formLabelFromAvg(avg: number, overall = 55): FormLabel {
  const świetnaMin = clamp(Math.round(70 + (overall - 45) * 0.4), 68, 86)
  const dobraMin = clamp(Math.round(56 + (overall - 45) * 0.25), 52, 70)
  const przyzwoitaMin = clamp(Math.round(44 + (overall - 45) * 0.12), 40, 52)
  const slabaMin = clamp(Math.round(32 + (overall - 45) * 0.08), 28, 40)
  if (avg >= świetnaMin) return 'świetna'
  if (avg >= dobraMin) return 'dobra'
  if (avg >= przyzwoitaMin) return 'przyzwoita'
  if (avg >= slabaMin) return 'słaba'
  return 'fatalna'
}

export function formPotentialBias(overall: number): number {
  // Start ~45: dużo łatwiej o dobrą/świetną formę
  if (overall <= 48) return clamp(18 + Math.round((48 - overall) * 1.2), 14, 26)
  if (overall <= 55) return Math.round(16 - (overall - 48) * 1.5)
  if (overall <= 65) return Math.round(5 - (overall - 55) * 0.9)
  if (overall <= 75) return Math.round(-4 - (overall - 65) * 0.8)
  return clamp(Math.round(-12 - (overall - 75) * 1.0), -20, -8)
}

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

  let score = 52
  score += clamp((outRatio - 1) * 18, -16, 24)
  score += clamp((avgRating - 6.15) * 7, -12, 14)
  score += formPotentialBias(overall)

  if (apps === 0) score -= 10
  else if (appRate >= 0.65) score += 5
  else if (appRate >= 0.45) score += 2
  else if (appRate < 0.22) score -= 3

  const softFloorCap = overall >= 68 ? 62 : overall >= 60 ? 66 : 72
  if (position === 'NP') {
    if (goals >= 12) score = Math.max(score, Math.min(68, softFloorCap + 6))
    else if (goals >= 8) score = Math.max(score, Math.min(58, softFloorCap))
    else if (goals >= 5) score = Math.max(score, 50)
    if (goals === 0 && apps >= 10) score = Math.min(score, 38)
  } else if (position === 'POM') {
    const contrib = goals + assists
    if (contrib >= 12) score = Math.max(score, Math.min(68, softFloorCap + 6))
    else if (contrib >= 7) score = Math.max(score, Math.min(56, softFloorCap))
    if (contrib === 0 && apps >= 12) score = Math.min(score, 40)
  } else if (avgRating >= 7.0 && appRate >= 0.55) {
    score = Math.max(score, Math.min(60, softFloorCap))
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
    winterSnapshot: null,
    careerSummary: null,
    log: [],
    clubStrengthMods: {},
  }
}

export function shouldRetire(player: Player): boolean {
  if (player.retired) return true
  if (player.age >= 37) return true
  if (player.age >= 35 && player.overall <= 58) return true
  if (player.age >= 34 && player.overall <= 52) return true
  return false
}
