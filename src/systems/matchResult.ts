import { getClub, getEffectiveStrength } from '../data/clubs'
import type {
  Difficulty,
  GameState,
  LiveMatchState,
  MatchSideStats,
  PitchRole,
  SquadPlayer,
  TeamState,
} from '../state/types'
import { clamp, clampFloat, normalizeTactics, roleBase } from '../state/types'
import { formationFit } from './tactics'

const MATCH_MINUTES = 92
/** Średnie xG na strzał — kalibracja volume */
const XG_PER_SHOT = 0.11

function chance(p: number): boolean {
  return Math.random() < p
}

export function emptyMatchSideStats(): MatchSideStats {
  return { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0 }
}

/** Bieżące % posiadania z minut (bez clampu 25–75 — do LIVE). */
export function possessionPctNow(
  you: MatchSideStats,
  them: MatchSideStats,
): { you: number; them: number } {
  const total = you.possession + them.possession
  if (total <= 0) return { you: 50, them: 50 }
  const youPct = Math.round((you.possession / total) * 100)
  return { you: youPct, them: 100 - youPct }
}

/** Kopia stats z % posiadania (przerwa / raport). */
export function snapshotSideStats(
  you: MatchSideStats,
  them: MatchSideStats,
): { you: MatchSideStats; them: MatchSideStats } {
  return finalizePossessionPercents(
    { ...you, xg: you.xg, corners: you.corners ?? 0, fouls: you.fouls ?? 0 },
    { ...them, xg: them.xg, corners: them.corners ?? 0, fouls: them.fouls ?? 0 },
  )
}

export function finalizePossessionPercents(
  you: MatchSideStats,
  them: MatchSideStats,
): { you: MatchSideStats; them: MatchSideStats } {
  const total = you.possession + them.possession
  if (total <= 0) {
    return {
      you: { ...you, possession: 50 },
      them: { ...them, possession: 50 },
    }
  }
  const youPct = Math.round((you.possession / total) * 100)
  return {
    you: { ...you, possession: clamp(youPct, 25, 75) },
    them: { ...them, possession: clamp(100 - youPct, 25, 75) },
  }
}

function clubSquadPowerLocal(state: GameState | null | undefined, clubId: string): number {
  let squad = state?.team?.clubId === clubId ? state.team.squad : state?.market?.aiSquads?.[clubId]
  if (!squad?.length) return getEffectiveStrength(clubId)
  const top = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11)
  if (!top.length) return getEffectiveStrength(clubId)
  const avg = top.reduce((s, p) => s + p.overall, 0) / top.length
  return avg * 0.92 + getClub(clubId).strength * 0.08
}

export interface ExpectedGoalsCtx {
  isHome?: boolean
  menDownAtt?: number
  menDownDef?: number
  difficulty?: Difficulty
  forPlayerSide?: boolean
}

/** Bonusy XI jak w lineupPower (instrukcje + stałe fragmenty). */
export function squadInstructionBonus(team: TeamState, playerIds: string[]): number {
  let bias = 0
  for (const id of playerIds) {
    const instr = team.playerInstructions?.[id]
    if (!instr) continue
    if (instr.attacking === 'stayForward') bias += 0.35
    if (instr.attacking === 'cutInside') bias += 0.25
    if (instr.attacking === 'comeShort') bias += 0.15
    if (instr.defending === 'stayBack') bias += 0.3
    if (instr.defending === 'manMark') bias += 0.2
  }
  const setPieceBonus =
    [team.setPieces?.corners, team.setPieces?.freeKicks, team.setPieces?.penalties].filter(
      (id) => id && playerIds.includes(id),
    ).length * 0.25
  return bias / Math.max(1, playerIds.length) + setPieceBonus
}

function effectiveOvr(p: SquadPlayer, fatigue: number): number {
  const f = clampFloat(fatigue, 0, 100)
  const sharp = ((p.sharpness ?? 70) - 70) * 0.06
  return p.overall * (0.55 + 0.45 * (f / 100)) + (p.form - 50) * 0.08 + sharp
}

function attrBlend(p: SquadPlayer, fatigue: number, role: PitchRole, kind: 'att' | 'def'): number {
  const a = p.attrs
  const ovr = effectiveOvr(p, fatigue)
  const base = roleBase(role)
  if (kind === 'att') {
    if (base === 'NP') return a.shooting * 0.45 + a.pace * 0.25 + a.passing * 0.15 + ovr * 0.15
    if (base === 'POM') return a.passing * 0.35 + a.shooting * 0.2 + a.pace * 0.15 + ovr * 0.3
    if (role === 'BR') return ovr * 0.5 + a.passing * 0.2 + a.pace * 0.1
    return a.passing * 0.2 + a.pace * 0.2 + a.shooting * 0.1 + ovr * 0.5
  }
  // def
  if (role === 'BR') return a.defending * 0.55 + ovr * 0.35 + a.pace * 0.1
  if (base === 'OB' || base === 'ŚO') return a.defending * 0.5 + ovr * 0.35 + a.pace * 0.15
  if (base === 'POM') return a.defending * 0.35 + a.passing * 0.2 + ovr * 0.35 + a.pace * 0.1
  return a.defending * 0.25 + ovr * 0.5 + a.pace * 0.15 + a.passing * 0.1
}

export interface SidePowers {
  att: number
  def: number
  gk: number
}

/** Atak / obrona / GK z atrybutów ról (Twój XI). */
export function liveSidePowers(state: GameState, live: LiveMatchState): SidePowers {
  const team = state.team!
  const map = new Map(team.squad.map((p) => [p.id, p]))
  const ids = live.onPitchIds.filter((id): id is string => Boolean(id))
  const xs = ids.map((id) => map.get(id)).filter(Boolean) as SquadPlayer[]
  if (!xs.length) return { att: 28, def: 28, gk: 50 }

  const attAvg =
    xs.filter((p) => p.role !== 'BR').reduce((s, p) => s + attrBlend(p, live.fatigue[p.id] ?? 50, p.role, 'att'), 0) /
      Math.max(1, xs.filter((p) => p.role !== 'BR').length) || 40
  const defAvg =
    xs.reduce((s, p) => s + attrBlend(p, live.fatigue[p.id] ?? 50, p.role, 'def'), 0) / xs.length
  const gkP = xs.find((p) => p.role === 'BR')
  const gk = gkP
    ? attrBlend(gkP, live.fatigue[gkP.id] ?? 50, 'BR', 'def')
    : defAvg

  const fit =
    ids.length === 11
      ? (formationFit({ ...team, startingIds: ids }) - 0.65) * 6
      : (ids.length / 11 - 0.65) * 6
  const t = normalizeTactics(team.tactics)
  const chem = (team.teamChemistry - 50) * 0.05
  const captBonus = team.captainId && ids.includes(team.captainId) ? 0.7 : 0
  const styleBias = (t.mentality - 3) * 0.45
  const planBias =
    t.plan === 'press' ? 0.5 : t.plan === 'direct' ? 0.4 : t.plan === 'possession' ? -0.15 : 0.2
  const morale = live.moraleBoost * 1.4
  const menDown = (11 - xs.length) * 3.8
  const instr = squadInstructionBonus(team, ids)
  const common = fit + chem + captBonus + morale + instr - menDown
  return {
    att: attAvg + common + styleBias + planBias,
    def: defAvg + common - styleBias * 0.4 + (t.plan === 'press' ? -0.2 : 0.15),
    gk: gk + chem * 0.5 + captBonus * 0.3 - menDown * 0.4,
  }
}

/** Legacy: sama wartość ataku. */
export function liveSideAttackPower(state: GameState, live: LiveMatchState): number {
  return liveSidePowers(state, live).att
}

export function opponentSidePowers(
  state: GameState,
  opponentId: string,
  withNoise = true,
): SidePowers {
  const base = clubSquadPowerLocal(state, opponentId)
  const noise = withNoise ? Math.random() * 3 - 1.5 : 0
  const p = base + noise
  return { att: p, def: p * 0.98, gk: p * 0.95 + 2 }
}

export function opponentAttackPower(
  state: GameState,
  opponentId: string,
  withNoise = true,
): number {
  return opponentSidePowers(state, opponentId, withNoise).att
}

function difficultyLambdaFactor(
  difficulty: Difficulty | undefined,
  forPlayerSide: boolean | undefined,
): { attMul: number; defMul: number } {
  const d = difficulty ?? 'normal'
  if (d === 'normal' || forPlayerSide == null) return { attMul: 1, defMul: 1 }
  if (d === 'easy') {
    return forPlayerSide ? { attMul: 1.08, defMul: 0.92 } : { attMul: 0.9, defMul: 1.06 }
  }
  return forPlayerSide ? { attMul: 0.9, defMul: 1.08 } : { attMul: 1.1, defMul: 0.94 }
}

export function expectedGoals(att: number, def: number, ctx: ExpectedGoalsCtx = {}): number {
  const home = ctx.isHome ? 1.15 : 0
  const menAtt = Math.max(0, ctx.menDownAtt ?? 0)
  const menDef = Math.max(0, ctx.menDownDef ?? 0)
  const attAdj = att + home - menAtt * 3.2
  const defAdj = def - menDef * 2.8
  let lambda = Math.max(0.12, (attAdj - defAdj) / 38 + 1.05)
  lambda *= 1 + menDef * 0.28
  lambda *= Math.max(0.45, 1 - menAtt * 0.16)
  const df = difficultyLambdaFactor(ctx.difficulty, ctx.forPlayerSide)
  lambda *= df.attMul / df.defMul
  return clampFloat(lambda, 0.12, 4.2)
}

export function sampleGoals(lambda: number): number {
  const L = Math.exp(-Math.max(0, lambda))
  let k = 0
  let p = 1
  do {
    k++
    p *= Math.random()
  } while (p > L && k < 12)
  const g = k - 1
  if (chance(0.035) && g < 5) return g + 1
  return Math.min(5, Math.max(0, g))
}

export function minuteGoalProb(lambda: number, minutes = MATCH_MINUTES): number {
  const p = 1 - Math.exp(-Math.max(0, lambda) / minutes)
  return clampFloat(p, 0.0015, 0.055)
}

export function tacticChanceMultipliers(state: GameState): { you: number; them: number } {
  const t = normalizeTactics(state.team!.tactics)
  let chanceYou = 1 + (t.tempo - 2) * 0.08 + (t.width - 2) * 0.05 + (t.press - 2) * 0.04
  let chanceThem = 1 + (t.press - 2) * 0.09 + (t.width - 2) * 0.04 - (t.tempo - 2) * 0.02
  if (t.plan === 'possession') {
    chanceYou *= 0.95
    chanceThem *= 0.9
  } else if (t.plan === 'press') {
    chanceYou *= 1.08
    chanceThem *= 1.06
  } else if (t.plan === 'counter') {
    chanceYou *= 1.04
    chanceThem *= 0.97
  } else if (t.plan === 'direct') {
    chanceYou *= 1.06
  }
  if (t.buildUp === 1) {
    chanceYou *= 0.96
    chanceThem *= 0.94
  } else if (t.buildUp === 3) {
    chanceYou *= 1.05
  }
  return { you: chanceYou, them: chanceThem }
}

export function powerOffsetFromTactics(state: GameState): { you: number; them: number } {
  const t = normalizeTactics(state.team!.tactics)
  const ment = t.mentality - 3
  let you = (t.width - 2) * 0.7 + (t.tempo - 2) * 0.55 + (t.press - 2) * 0.25 + ment * 0.5
  let them = (t.width - 2) * 0.4 + (t.press - 2) * 0.55 - (t.tempo - 2) * 0.15 - ment * 0.35
  if (t.plan === 'possession') {
    you -= 0.2
    them -= 0.35
  } else if (t.plan === 'press') {
    you += 0.35
    them += 0.45
  } else if (t.plan === 'counter') {
    you += 0.25
    them -= 0.2
  } else if (t.plan === 'direct') {
    you += 0.4
  }
  you += (t.defLine - 2) * -0.25
  them += (t.defLine - 2) * 0.35
  you += (t.buildUp - 2) * 0.15
  return { you, them }
}

/** Udział posiadania Twojej strony 0–1. */
export function possessionShare(
  yourAtt: number,
  themAtt: number,
  opts: {
    isHomeYou?: boolean
    momentum?: number
    tactics?: ReturnType<typeof normalizeTactics>
    noise?: boolean
  } = {},
): number {
  const t = opts.tactics
  let share = 0.5 + (yourAtt - themAtt) / 90
  if (opts.isHomeYou) share += 0.03
  else share -= 0.02
  share += (opts.momentum ?? 0) / 400
  if (t) {
    share += (t.press - 2) * 0.015 + (t.tempo - 2) * 0.01 + (t.buildUp - 2) * 0.012
    if (t.plan === 'possession') share += 0.04
    if (t.plan === 'press') share += 0.02
    if (t.plan === 'counter') share -= 0.025
    if (t.plan === 'direct') share -= 0.015
  }
  if (opts.noise !== false) share += (Math.random() - 0.5) * 0.06
  return clampFloat(share, 0.32, 0.68)
}

export type PipelineSide = 'you' | 'them'

export type MinutePipelineEvent =
  | { kind: 'shot'; side: PipelineSide; onTarget: false; xgAdd: number }
  | { kind: 'shot'; side: PipelineSide; onTarget: true; saved: true; xgAdd: number }
  | { kind: 'goal'; side: PipelineSide; xgAdd: number }

export interface MinutePipelineCtx {
  yourAtt: number
  yourDef: number
  yourGk: number
  themAtt: number
  themDef: number
  themGk: number
  isHomeYou: boolean
  menDownYou: number
  menDownThem: number
  difficulty?: Difficulty
  momentum: number
  volumeYou: number
  volumeThem: number
  targetXgYou: number
  targetXgThem: number
  tactics?: ReturnType<typeof normalizeTactics>
}

export interface MinutePipelineResult {
  possessionYou: boolean
  events: MinutePipelineEvent[]
  momentumAfter: number
}

function decayMomentum(m: number): number {
  const decay = Math.sign(m) * Math.min(Math.abs(m), 1.4)
  return clamp(m - decay, -100, 100)
}

export function applyMomentumDelta(current: number, delta: number): number {
  return clamp(current + delta, -100, 100)
}

function trySideAttack(
  side: PipelineSide,
  att: number,
  def: number,
  gk: number,
  targetXg: number,
  possShare: number,
  volume: number,
  momentumFavor: number,
): MinutePipelineEvent | null {
  const expectedShots = Math.max(4, targetXg / XG_PER_SHOT)
  const pShot = clampFloat(
    (expectedShots / (MATCH_MINUTES * Math.max(0.34, possShare))) * volume * (1 + momentumFavor * 0.004),
    0.035,
    0.28,
  )
  if (!chance(pShot)) return null

  const pSot = clampFloat(0.3 + (att - def) / 180 + momentumFavor * 0.001, 0.18, 0.58)
  const pGoal = clampFloat(0.26 + (att - gk) / 160 + momentumFavor * 0.0012, 0.1, 0.48)
  const xgAdd = clampFloat(pSot * pGoal, 0.02, 0.55)

  if (!chance(pSot)) {
    return { kind: 'shot', side, onTarget: false, xgAdd: xgAdd * 0.25 }
  }
  if (chance(pGoal)) {
    return { kind: 'goal', side, xgAdd }
  }
  return { kind: 'shot', side, onTarget: true, saved: true, xgAdd }
}

/**
 * Jedna minuta: posiadanie → strzał → SoT → gol.
 * Max jeden „atak kończący” na minutę (posiadająca strona).
 */
export function tickChancePipeline(ctx: MinutePipelineCtx): MinutePipelineResult {
  let mom = decayMomentum(ctx.momentum)
  const share = possessionShare(ctx.yourAtt, ctx.themAtt, {
    isHomeYou: ctx.isHomeYou,
    momentum: mom,
    tactics: ctx.tactics,
  })
  const possessionYou = chance(share)
  const events: MinutePipelineEvent[] = []

  if (possessionYou) {
    const ev = trySideAttack(
      'you',
      ctx.yourAtt,
      ctx.themDef,
      ctx.themGk,
      ctx.targetXgYou,
      share,
      ctx.volumeYou,
      mom,
    )
    if (ev) {
      events.push(ev)
      if (ev.kind === 'goal') mom = applyMomentumDelta(mom, 14 + Math.random() * 4)
      else if (ev.kind === 'shot' && ev.onTarget) mom = applyMomentumDelta(mom, 3.5)
      else if (ev.kind === 'shot') mom = applyMomentumDelta(mom, 0.8)
    }
  } else {
    const ev = trySideAttack(
      'them',
      ctx.themAtt,
      ctx.yourDef,
      ctx.yourGk,
      ctx.targetXgThem,
      1 - share,
      ctx.volumeThem,
      -mom,
    )
    if (ev) {
      events.push(ev)
      if (ev.kind === 'goal') mom = applyMomentumDelta(mom, -(14 + Math.random() * 4))
      else if (ev.kind === 'shot' && ev.onTarget) mom = applyMomentumDelta(mom, -3.5)
      else if (ev.kind === 'shot') mom = applyMomentumDelta(mom, -0.8)
    }
  }

  return { possessionYou, events, momentumAfter: mom }
}

export function applyPipelineEventToStats(
  statsYou: MatchSideStats,
  statsThem: MatchSideStats,
  possessionYou: boolean,
  events: MinutePipelineEvent[],
): void {
  if (possessionYou) statsYou.possession += 1
  else statsThem.possession += 1

  for (const ev of events) {
    const st = ev.side === 'you' ? statsYou : statsThem
    if (ev.kind === 'goal' || ev.kind === 'shot') {
      st.shots += 1
      st.xg += ev.xgAdd
      if (ev.kind === 'goal' || (ev.kind === 'shot' && ev.onTarget)) {
        st.shotsOnTarget += 1
      }
    }
  }
}

/** AI / instant: ~92 minuty tego samego pipeline. */
export function sampleMatchFromPowers(
  homePow: number,
  awayPow: number,
  difficulty?: Difficulty,
): {
  homeGoals: number
  awayGoals: number
  homeXg: number
  awayXg: number
  homeStats: MatchSideStats
  awayStats: MatchSideStats
} {
  let hp = homePow
  let ap = awayPow
  if (difficulty === 'easy') {
    hp += 0.9
    ap -= 0.7
  } else if (difficulty === 'hard') {
    hp -= 0.4
    ap += 1.1
  }

  const homeStats = emptyMatchSideStats()
  const awayStats = emptyMatchSideStats()
  let homeGoals = 0
  let awayGoals = 0
  let momentum = 0

  const targetHome = expectedGoals(hp, ap * 0.92, { isHome: true, difficulty })
  const targetAway = expectedGoals(ap, hp * 0.92, { isHome: false, difficulty })

  for (let m = 0; m < MATCH_MINUTES; m++) {
    const tick = tickChancePipeline({
      yourAtt: hp,
      yourDef: hp * 0.98,
      yourGk: hp * 0.95,
      themAtt: ap,
      themDef: ap * 0.98,
      themGk: ap * 0.95,
      isHomeYou: true,
      menDownYou: 0,
      menDownThem: 0,
      difficulty,
      momentum,
      volumeYou: 1,
      volumeThem: 1,
      targetXgYou: targetHome,
      targetXgThem: targetAway,
      tactics: undefined,
    })
    applyPipelineEventToStats(homeStats, awayStats, tick.possessionYou, tick.events)
    momentum = tick.momentumAfter
    for (const ev of tick.events) {
      if (ev.kind === 'goal') {
        if (ev.side === 'you') homeGoals++
        else awayGoals++
      }
    }
  }

  homeGoals = Math.min(5, homeGoals)
  awayGoals = Math.min(5, awayGoals)
  const fin = finalizePossessionPercents(homeStats, awayStats)
  return {
    homeGoals,
    awayGoals,
    homeXg: Math.round(fin.you.xg * 10) / 10,
    awayXg: Math.round(fin.them.xg * 10) / 10,
    homeStats: fin.you,
    awayStats: fin.them,
  }
}

/** Wynik AI↔AI — wspólny pipeline CM. */
export function simulateScoreFromPowers(
  homePow: number,
  awayPow: number,
  difficulty?: Difficulty,
): { homeGoals: number; awayGoals: number; homeXg: number; awayXg: number } {
  const r = sampleMatchFromPowers(homePow, awayPow, difficulty)
  return {
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    homeXg: r.homeXg,
    awayXg: r.awayXg,
  }
}

export function computeLiveRatings(
  squad: SquadPlayer[],
  playedIds: string[],
  events: Array<{ kind: string; side?: string; playerId?: string }>,
  onPitchIds: string[],
  minute: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  const played = squad.filter((p) => playedIds.includes(p.id))
  const pool = played.length ? played : squad.slice(0, 11)
  for (const p of pool) {
    let r = 6.2 + (p.overall - 65) * 0.035 + (p.form - 50) * 0.02
    const goals = events.filter((e) => e.kind === 'goal' && e.side === 'you' && e.playerId === p.id)
      .length
    const shots = events.filter(
      (e) =>
        (e.kind === 'shot' || e.kind === 'goal' || e.kind === 'save') &&
        e.side === 'you' &&
        e.playerId === p.id,
    ).length
    r += goals * 0.85
    r += Math.min(0.6, shots * 0.08)
    if (events.some((e) => e.kind === 'red' && e.playerId === p.id)) r -= 1.4
    if (events.some((e) => e.kind === 'yellow' && e.playerId === p.id)) r -= 0.25
    if (onPitchIds.includes(p.id)) r += Math.min(0.35, minute * 0.002)
    out[p.id] = Math.round(clamp(r, 4.5, 9.5) * 10) / 10
  }
  return out
}

export function allRatingsFromMatchEvents(
  squad: SquadPlayer[],
  playedIds: string[],
  events: Array<{ kind: string; side?: string; playerId?: string }>,
  won: boolean,
  drawn: boolean,
): Array<{ name: string; rating: number }> {
  const played = squad.filter((p) => playedIds.includes(p.id))
  const pool = played.length ? played : squad.slice(0, 11)
  const scores = pool.map((p) => {
    let r = 6.2 + (p.overall - 65) * 0.035 + (p.form - 50) * 0.02
    const goals = events.filter((e) => e.kind === 'goal' && e.side === 'you' && e.playerId === p.id)
      .length
    const shots = events.filter(
      (e) =>
        (e.kind === 'shot' || e.kind === 'goal') && e.side === 'you' && e.playerId === p.id,
    ).length
    r += goals * 0.85
    r += Math.min(0.6, shots * 0.08)
    if (events.some((e) => e.kind === 'red' && e.playerId === p.id)) r -= 1.4
    if (events.some((e) => e.kind === 'yellow' && e.playerId === p.id)) r -= 0.25
    if (won) r += 0.25
    else if (!drawn) r -= 0.2
    r += (Math.random() - 0.5) * 0.55
    return { name: p.name, rating: Math.round(clamp(r, 4.5, 9.5) * 10) / 10, _raw: r }
  })
  return scores
    .sort((a, b) => b._raw - a._raw)
    .map(({ name, rating }) => ({ name, rating }))
}

export function ratingsFromMatchEvents(
  squad: SquadPlayer[],
  playedIds: string[],
  events: Array<{ kind: string; side?: string; playerId?: string }>,
  won: boolean,
  drawn: boolean,
): Array<{ name: string; rating: number }> {
  return allRatingsFromMatchEvents(squad, playedIds, events, won, drawn).slice(0, 3)
}

export function clubShortLabel(clubId: string): string {
  return getClub(clubId).short
}
