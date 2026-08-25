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
  ŚOL: 'Lewy środkowy obrońca',
  ŚO: 'Środkowy obrońca',
  ŚOP: 'Prawy środkowy obrońca',
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
export type Formation = '4-4-2' | '4-3-3' | '3-5-2'
export type TacticalStyle = 'attack' | 'balanced' | 'defend'
/** 1 = nisko/wąsko/wolno, 2 = średnio, 3 = wysoko/szeroko/szybko */
export type TacticAxis = 1 | 2 | 3

export type Screen =
  | 'home'
  | 'createManager'
  | 'pickClub'
  | 'hub'
  | 'lineup'
  | 'liveMatch'
  | 'halfTime'
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
  /** Grupa atrybutów (OB/POM/ŚO/NP) */
  position: Position
  /** Dokładna pozycja FIFA-style: LP, ŚN, LO… */
  role: PitchRole
  age: number
  overall: number
  attrs: Attributes
  form: number
  fitness: number
  morale: number
  /** Mecze do opuszczenia przez kontuzję (0 = zdrowy) */
  injuryMatchesLeft: number
  /** Mecze zawieszenia po czerwonej (0 = dostępny) */
  suspensionMatchesLeft: number
}

export interface Tactics {
  formation: Formation
  style: TacticalStyle
  /** Szerokość gry */
  width: TacticAxis
  /** Intensywność pressingu */
  press: TacticAxis
  /** Tempo gry */
  tempo: TacticAxis
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
  liveMatch: LiveMatchState | null
  /** clubId → leagueId (ruchome awanse/spadki) */
  clubLeagueIds: Record<string, string>
  log: string[]
}

export const SAVE_KEY = 'gra-karier-manager-v1'
export const SAVE_VERSION = 105

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
    liveMatch: null,
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

export function defaultTactics(formation: Formation = '4-4-2'): Tactics {
  return { formation, style: 'balanced', width: 2, press: 2, tempo: 2 }
}

export function normalizeTactics(t: Partial<Tactics> & Pick<Tactics, 'formation' | 'style'>): Tactics {
  const axis = (v: unknown): TacticAxis => (v === 1 || v === 3 ? v : 2)
  return {
    formation: t.formation,
    style: t.style,
    width: axis(t.width),
    press: axis(t.press),
    tempo: axis(t.tempo),
  }
}

export interface FormationSlot {
  role: PitchRole
  base: Position
  x: number
  y: number
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
      s('LO', 12, 84),
      s('ŚOL', 36, 86),
      s('ŚOP', 64, 86),
      s('PO', 88, 84),
      s('LP', 18, 54),
      s('DP', 42, 58),
      s('ŚP', 58, 52),
      s('PP', 82, 54),
      s('LN', 20, 22),
      s('ŚN', 50, 18),
      s('PN', 80, 22),
    ]
  }
  if (formation === '3-5-2') {
    return [
      s('ŚOL', 28, 86),
      s('ŚO', 50, 88),
      s('ŚOP', 72, 86),
      s('LP', 8, 54),
      s('DP', 32, 58),
      s('ŚP', 50, 56),
      s('PP', 92, 54),
      s('PO', 78, 58),
      s('OP', 50, 36),
      s('LN', 36, 20),
      s('PN', 64, 20),
    ]
  }
  // 4-4-2
  return [
    s('LO', 12, 84),
    s('ŚOL', 36, 86),
    s('ŚOP', 64, 86),
    s('PO', 88, 84),
    s('LP', 14, 54),
    s('DP', 38, 56),
    s('ŚP', 62, 56),
    s('PP', 86, 54),
    s('LN', 36, 20),
    s('PN', 64, 20),
    s('OP', 50, 34),
  ]
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

