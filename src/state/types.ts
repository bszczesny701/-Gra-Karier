export type Position = 'NP' | 'POM' | 'ŚO' | 'OB'

/** Dokładna pozycja na boisku (skrót jak w FIFA). */
export type PitchRole =
  | 'BR'
  | 'LO'
  | 'ŚOL'
  | 'ŚO'
  | 'ŚOP'
  | 'PO'
  | 'LP'
  | 'DP'
  | 'ŚP'
  | 'PP'
  | 'OP'
  | 'LN'
  | 'ŚN'
  | 'PN'

export const ROLE_FULL: Record<PitchRole, string> = {
  BR: 'Bramkarz',
  LO: 'Lewy obrońca',
  ŚOL: 'Środkowy obrońca',
  ŚO: 'Środkowy obrońca',
  ŚOP: 'Środkowy obrońca',
  PO: 'Prawy obrońca',
  LP: 'Lewy pomocnik',
  DP: 'Defensywny pomocnik',
  ŚP: 'Środkowy pomocnik',
  PP: 'Prawy pomocnik',
  OP: 'Ofensywny pomocnik',
  LN: 'Lewy napastnik',
  ŚN: 'Środkowy napastnik',
  PN: 'Prawy napastnik',
}

export function roleBase(role: PitchRole): Position {
  if (role === 'BR') return 'OB'
  if (role === 'LN' || role === 'ŚN' || role === 'PN') return 'NP'
  if (role === 'LP' || role === 'PP' || role === 'OP' || role === 'ŚP') return 'POM'
  if (role === 'DP') return 'ŚO'
  return 'OB'
}

export type MatchAction = 'shoot' | 'pass' | 'tackle' | 'clear'
export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '4-2-3-1' | '5-3-2' | '4-1-4-1'
/** Legacy — mapowane w normalizeTactics */
export type TacticalStyle = 'attack' | 'balanced' | 'defend'
/** Plan gry (główny styl) */
export type GamePlan = 'possession' | 'balanced' | 'counter' | 'press' | 'direct'
/** 1 = nisko/wąsko/wolno, 2 = średnio, 3 = wysoko/szeroko/szybko */
export type TacticAxis = 1 | 2 | 3
/** Mentalność: 1 bardzo def. … 5 bardzo ofens. */
export type Mentality = 1 | 2 | 3 | 4 | 5

export type Screen =
  | 'home'
  | 'createManager'
  | 'pickClub'
  | 'hub'
  | 'lineup'
  | 'tactics'
  | 'liveMatch'
  | 'halfTime'
  | 'matchMoment'
  | 'matchResult'
  | 'pressConference'
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
  /** Zaufanie zarządu 0–100 */
  boardTrust: number
  /** Zaufanie kibiców 0–100 */
  fanTrust: number
  seasonsManaged: number
  clubId: string
  /** Ostatnia kolejka ligowa z przeglądem zarządu */
  lastBoardReviewRound?: number
  /** Ostatnia kolejka z ofertą pracy (cooldown) */
  lastJobOfferRound?: number
}

export type BoardGoalId = 'title' | 'podium' | 'europe' | 'mid' | 'survive'

export interface BoardExpectation {
  goal: BoardGoalId
  targetPlace: number
  minAcceptablePlace: number
  label: string
  detail: string
}

export type WorkRate = 'low' | 'med' | 'high'
export type StarRating = 1 | 2 | 3 | 4 | 5
export type TrainingFocus =
  | 'pace'
  | 'shooting'
  | 'passing'
  | 'defending'
  | 'stamina'
  | 'balanced'

export interface SquadPlayer {
  id: string
  name: string
  /** Grupa atrybutów (OB/POM/ŚO/NP) */
  position: Position
  /** Dokładna pozycja FIFA-style: LP, ŚN, LO… */
  role: PitchRole
  age: number
  overall: number
  /** Sufit rozwoju (zawsze >= overall) */
  potential: number
  attrs: Attributes
  form: number
  fitness: number
  morale: number
  /** Świeżość meczowa 0–100 */
  sharpness: number
  weakFoot: StarRating
  skillMoves: StarRating
  workRateAtk: WorkRate
  workRateDef: WorkRate
  nationality: string
  /** Mecze do opuszczenia przez kontuzję (0 = zdrowy) */
  injuryMatchesLeft: number
  /** Mecze zawieszenia po czerwonej (0 = dostępny) */
  suspensionMatchesLeft: number
  /** Pozostałe sezony kontraktu */
  contractYears: number
  /** Pensja tygodniowa */
  wage: number
  seasonApps: number
  seasonGoals: number
  seasonAssists: number
  seasonMinutes: number
  wantsToLeave: boolean
  /** Klauzula odstępnego (null = brak) */
  releaseClause: number | null
  /** Wypożyczony DO Twojego klubu z… */
  loanFromClubId?: string
  /** Wypożyczony OD Ciebie do… */
  loanToClubId?: string
  loanWeeksLeft?: number
  loanBuyOption?: number | null
}

export interface Tactics {
  formation: Formation
  /** Plan gry */
  plan: GamePlan
  /** Mentalność 1–5 */
  mentality: Mentality
  /** Szerokość gry */
  width: TacticAxis
  /** Intensywność pressingu */
  press: TacticAxis
  /** Tempo gry */
  tempo: TacticAxis
  /** Linia obrony */
  defLine: TacticAxis
  /** Budowa akcji: krótkie / mieszane / długie */
  buildUp: TacticAxis
  /** Legacy — utrzymywane dla starych zapisów / UI hub */
  style?: TacticalStyle
}

export type AttackInstruction = 'default' | 'stayForward' | 'comeShort' | 'cutInside'
export type DefendInstruction = 'default' | 'stayBack' | 'manMark'

export interface PlayerInstruction {
  attacking: AttackInstruction
  defending: DefendInstruction
}

export interface SetPieceTakers {
  corners: string | null
  freeKicks: string | null
  penalties: string | null
}

export interface TeamState {
  clubId: string
  squad: SquadPlayer[]
  tactics: Tactics
  teamChemistry: number
  budget: number
  seasonIncome: number
  seasonExpense: number
  /** 11 id startujących (kolejność: wg slotów formacji) */
  startingIds: string[]
  benchIds: string[]
  trainingFocus: TrainingFocus
  captainId: string | null
  /** Absolutny dzień ostatniej sesji treningowej (cooldown 5 dni) */
  lastTrainingDay: number | null
  playerInstructions: Record<string, PlayerInstruction>
  setPieces: SetPieceTakers
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
  /** Ostatnie wyniki (najnowszy na końcu), max 5 */
  form: Array<'W' | 'D' | 'L'>
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

export type MatchEventKind =
  | 'goal'
  | 'sub'
  | 'fatigue'
  | 'kickoff'
  | 'ht'
  | 'ft'
  | 'motivation'
  | 'chance'
  | 'yellow'
  | 'red'
  | 'injury'

export interface MatchEvent {
  minute: number
  kind: MatchEventKind
  text: string
  side?: 'you' | 'them'
  playerName?: string
  playerId?: string
}

export type LiveHalf = '1' | 'ht' | '2' | 'done'
export type MatchSpeed = 1 | 2 | 4
export type CompetitionId = 'league' | 'cup'

/** Slot boiska w meczu — null = pusty (czerwona / kontuzja bez zmiany). */
export type LivePitchSlot = string | null

export interface LiveMatchState {
  homeId: string
  awayId: string
  opponentId: string
  minute: number
  half: LiveHalf
  homeGoals: number
  awayGoals: number
  onPitchIds: LivePitchSlot[]
  benchIds: string[]
  /** Max 3 */
  subsUsed: number
  fatigue: Record<string, number>
  /** Żółte w tym meczu (Twoi) */
  yellows: Record<string, number>
  /** Slot zablokowany po czerwonej (nie wolno uzupełnić) */
  redLockedSlots: boolean[]
  /** Po motywacji: -1 bronić, 0 plan, +1 atak */
  moraleBoost: number
  /** Mnożnik zmęczenia w 2. połowie */
  drainMod: number
  motivationDone: boolean
  events: MatchEvent[]
  paused: boolean
  speed: MatchSpeed
  /** Wszyscy, którzy wyszli na boisko */
  playedIds: string[]
  /** Koniec doliczonego czasu (null = normalna gra) */
  stoppageUntil: number | null
  /** Id ScheduledMatch w sezonie */
  matchId: string | null
  competition: CompetitionId
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

export type DayActivity = 'rest' | 'training' | 'match'
export type TransferWindow = 'summer' | 'winter' | null

export interface ScheduledMatch {
  id: string
  competition: CompetitionId
  homeId: string
  awayId: string
  homeGoals: number | null
  awayGoals: number | null
  /** Indeks kolejki ligowej (tylko liga) */
  leagueRound?: number
  /** Indeks rundy pucharowej (tylko puchar) */
  cupRound?: number
}

export interface CalendarDay {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  activity: DayActivity
  matchId?: string
}

export interface SeasonWeek {
  index: number
  label: string
  transferWindow: TransferWindow
  days: CalendarDay[]
  matchIds: string[]
  /** Powiązana kolejka ligowa, jeśli tydzień ją zawiera */
  leagueRoundIndex?: number
}

export interface SeasonCalendar {
  weekIndex: number
  weeks: SeasonWeek[]
}

export type CupPathResult = 'pending' | 'won' | 'lost' | 'bye'

export interface CupPathStep {
  roundName: string
  opponentId: string | null
  result: CupPathResult
}

export interface CupState {
  entrantIds: string[]
  /** Id meczów w season.matches, per runda */
  rounds: string[][]
  roundIndex: number
  eliminated: boolean
  championId: string | null
  yourPath: CupPathStep[]
  /** Awansowani do następnej rundy (bye + zwycięzcy bieżącej) */
  advancedIds: string[]
  totalRounds: number
  /** Indeks tygodnia kalendarza dla każdej rundy pucharu */
  calendarWeekForRound: number[]
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
  calendar: SeasonCalendar
  matches: Record<string, ScheduledMatch>
  cup: CupState | null
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
  /** Ocena zarządu po sezonie */
  boardSummary?: string
  boardTrustBefore?: number
  boardTrustAfter?: number
  boardTrustDelta?: number
  boardGoalLabel?: string
  sacked?: boolean
  /** Podsumowanie Pucharu Polski */
  cupSummary?: string
  financeSummary?: string
}

export type MailKind = 'discipline' | 'medical' | 'board' | 'system' | 'press' | 'job'

export type NewsKind = 'match' | 'form' | 'club' | 'transfer' | 'league' | 'press'

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface GameSettings {
  difficulty: Difficulty
}

export type PressTone = 'aggressive' | 'calm' | 'diplomatic'

export interface PressQuestion {
  id: string
  text: string
  answers: Array<{ id: PressTone; label: string }>
}

export interface PressSession {
  questions: PressQuestion[]
  /** Indeks bieżącego pytania */
  index: number
  answered: Array<{ questionId: string; tone: PressTone }>
  context: 'win' | 'draw' | 'loss'
}

export interface JobOffer {
  id: string
  clubId: string
  leagueId: string
  message: string
  createdAt: number
}

export interface MailMessage {
  id: string
  kind: MailKind
  from: string
  subject: string
  body: string
  round?: number
  year?: number
  read: boolean
  createdAt: number
}

export interface NewsItem {
  id: string
  kind: NewsKind
  headline: string
  body: string
  round?: number
  year?: number
  createdAt: number
}

export type TransferOfferKind = 'buy' | 'sell' | 'loan' | 'renew'
export type TransferOfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'withdrawn'

export interface TransferListing {
  playerId: string
  clubId: string
  askingPrice: number
  listedAtWeek: number
}

export interface TransferOfferCounter {
  fee: number
  wage: number
  years: number
}

export interface TransferOffer {
  id: string
  kind: TransferOfferKind
  playerId: string
  fromClubId: string
  toClubId: string
  fee: number
  wageOffer: number
  yearsOffer: number
  releaseClauseOffer?: number | null
  loanWeeks?: number
  loanBuyOption?: number | null
  status: TransferOfferStatus
  counter?: TransferOfferCounter
  /** true = oferta od AI do gracza */
  fromAi?: boolean
}

export interface TransferMarketState {
  listings: TransferListing[]
  offers: TransferOffer[]
  /** Kadry AI klubów PL (poza graczem) */
  aiSquads: Record<string, SquadPlayer[]>
  seededWeek?: number
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
  liveMatch: LiveMatchState | null
  /** clubId → leagueId (ruchome awanse/spadki) */
  clubLeagueIds: Record<string, string>
  log: string[]
  /** Skrzynka pocztowa w Biurze */
  mailbox: MailMessage[]
  /** Wiadomości / gazeta na ekranie Główny */
  news: NewsItem[]
  market: TransferMarketState
  settings: GameSettings
  pendingPress: PressSession | null
  pendingJobOffer: JobOffer | null
}

export const SAVE_KEY = 'gra-karier-manager-v1'
export const SAVE_VERSION = 117

export function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function clampFloat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function emptyMarket(): TransferMarketState {
  return { listings: [], offers: [], aiSquads: {} }
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
    liveMatch: null,
    clubLeagueIds: {},
    log: [],
    mailbox: [],
    news: [],
    market: emptyMarket(),
    settings: { difficulty: 'normal' },
    pendingPress: null,
    pendingJobOffer: null,
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

export function planLabel(plan: GamePlan): string {
  if (plan === 'possession') return 'Posiadanie'
  if (plan === 'counter') return 'Kontry'
  if (plan === 'press') return 'Wysoki press'
  if (plan === 'direct') return 'Gra bezpośrednia'
  return 'Zbalansowany'
}

export function mentalityLabel(v: Mentality): string {
  if (v === 1) return 'Bardzo def.'
  if (v === 2) return 'Defensywa'
  if (v === 4) return 'Ofensywa'
  if (v === 5) return 'Bardzo ofens.'
  return 'Zbalansowana'
}

export function widthLabel(v: TacticAxis): string {
  if (v === 1) return 'Wąsko'
  if (v === 3) return 'Szeroko'
  return 'Normalnie'
}

export function pressLabel(v: TacticAxis): string {
  if (v === 1) return 'Niski'
  if (v === 3) return 'Wysoki'
  return 'Średni'
}

export function tempoLabel(v: TacticAxis): string {
  if (v === 1) return 'Wolne'
  if (v === 3) return 'Szybkie'
  return 'Normalne'
}

export function defLineLabel(v: TacticAxis): string {
  if (v === 1) return 'Niska'
  if (v === 3) return 'Wysoka'
  return 'Średnia'
}

export function buildUpLabel(v: TacticAxis): string {
  if (v === 1) return 'Krótkie'
  if (v === 3) return 'Długie'
  return 'Mieszane'
}

export function defaultTactics(formation: Formation = '4-4-2'): Tactics {
  return {
    formation,
    plan: 'balanced',
    mentality: 3,
    width: 2,
    press: 2,
    tempo: 2,
    defLine: 2,
    buildUp: 2,
    style: 'balanced',
  }
}

export function normalizeTactics(
  t: Partial<Tactics> & Pick<Tactics, 'formation'> & { style?: TacticalStyle },
): Tactics {
  const axis = (v: unknown): TacticAxis => (v === 1 || v === 3 ? v : 2)
  const ment = (v: unknown): Mentality =>
    v === 1 || v === 2 || v === 4 || v === 5 ? v : 3

  let plan: GamePlan = 'balanced'
  if (
    t.plan === 'possession' ||
    t.plan === 'counter' ||
    t.plan === 'press' ||
    t.plan === 'direct' ||
    t.plan === 'balanced'
  ) {
    plan = t.plan
  } else if (t.style === 'attack') plan = 'direct'
  else if (t.style === 'defend') plan = 'counter'

  let mentality: Mentality = ment(t.mentality)
  if (t.mentality == null && t.style === 'attack') mentality = 4
  if (t.mentality == null && t.style === 'defend') mentality = 2

  const style: TacticalStyle =
    mentality >= 4 ? 'attack' : mentality <= 2 ? 'defend' : 'balanced'

  return {
    formation: t.formation,
    plan,
    mentality,
    width: axis(t.width),
    press: axis(t.press),
    tempo: axis(t.tempo),
    defLine: axis(t.defLine),
    buildUp: axis(t.buildUp),
    style,
  }
}

export interface FormationSlot {
  role: PitchRole
  base: Position
  x: number
  y: number
}

function clampCoord(n: number): number {
  return Math.max(8, Math.min(92, n))
}

export function formationPlan(formation: Formation): FormationSlot[] {
  const s = (role: PitchRole, x: number, y: number): FormationSlot => ({
    role,
    base: roleBase(role),
    x,
    y,
  })
  if (formation === '4-3-3') {
    return [
      s('BR', 50, 94),
      s('LO', 12, 80),
      s('ŚO', 36, 82),
      s('ŚO', 64, 82),
      s('PO', 88, 80),
      s('DP', 38, 56),
      s('ŚP', 50, 50),
      s('ŚP', 62, 56),
      s('LN', 18, 22),
      s('ŚN', 50, 16),
      s('PN', 82, 22),
    ]
  }
  if (formation === '3-5-2') {
    return [
      s('BR', 50, 94),
      s('ŚO', 28, 82),
      s('ŚO', 50, 84),
      s('ŚO', 72, 82),
      s('LP', 8, 52),
      s('DP', 32, 56),
      s('ŚP', 50, 54),
      s('PP', 92, 52),
      s('OP', 50, 34),
      s('LN', 36, 18),
      s('PN', 64, 18),
    ]
  }
  if (formation === '4-2-3-1') {
    return [
      s('BR', 50, 94),
      s('LO', 12, 80),
      s('ŚO', 36, 82),
      s('ŚO', 64, 82),
      s('PO', 88, 80),
      s('DP', 38, 58),
      s('DP', 62, 58),
      s('LP', 14, 36),
      s('OP', 50, 32),
      s('PP', 86, 36),
      s('ŚN', 50, 14),
    ]
  }
  if (formation === '5-3-2') {
    return [
      s('BR', 50, 94),
      s('LO', 10, 78),
      s('ŚO', 30, 84),
      s('ŚO', 50, 86),
      s('ŚO', 70, 84),
      s('PO', 90, 78),
      s('DP', 32, 54),
      s('ŚP', 50, 52),
      s('PP', 68, 54),
      s('LN', 38, 18),
      s('PN', 62, 18),
    ]
  }
  if (formation === '4-1-4-1') {
    return [
      s('BR', 50, 94),
      s('LO', 12, 80),
      s('ŚO', 36, 82),
      s('ŚO', 64, 82),
      s('PO', 88, 80),
      s('DP', 50, 62),
      s('LP', 14, 42),
      s('ŚP', 38, 44),
      s('ŚP', 62, 44),
      s('PP', 86, 42),
      s('ŚN', 50, 14),
    ]
  }
  // 4-4-2
  return [
    s('BR', 50, 94),
    s('LO', 12, 80),
    s('ŚO', 36, 82),
    s('ŚO', 64, 82),
    s('PO', 88, 80),
    s('LP', 14, 52),
    s('DP', 38, 54),
    s('ŚP', 62, 54),
    s('PP', 86, 52),
    s('LN', 36, 18),
    s('PN', 64, 18),
  ]
}

/** Formacja z wizualną szerokością (i lekkim przesunięciem linii). */
export function visualFormationPlan(
  formation: Formation,
  width: TacticAxis = 2,
  defLine: TacticAxis = 2,
): FormationSlot[] {
  const scale = width === 1 ? 0.62 : width === 3 ? 1.22 : 1
  const yShift = defLine === 1 ? 4 : defLine === 3 ? -5 : 0
  return formationPlan(formation).map((slot) => {
    if (slot.role === 'BR') {
      return { ...slot, x: clampCoord(slot.x), y: clampCoord(slot.y + yShift * 0.15) }
    }
    const isBack =
      slot.role === 'ŚO' ||
      slot.role === 'ŚOL' ||
      slot.role === 'ŚOP' ||
      slot.role === 'LO' ||
      slot.role === 'PO'
    const x = clampCoord(50 + (slot.x - 50) * scale)
    const y = clampCoord(slot.y + (isBack ? yShift : yShift * 0.35))
    return { ...slot, x, y }
  })
}

export function formationSlots(formation: Formation): Position[] {
  return formationPlan(formation).map((p) => p.base)
}

/** Współrzędne na boisku (x/y 0–100), atak u góry. */
export function formationPitchLayout(formation: Formation): Array<{ x: number; y: number }> {
  return formationPlan(formation).map((p) => ({ x: p.x, y: p.y }))
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

