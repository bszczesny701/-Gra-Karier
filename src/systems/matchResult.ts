import { getClub, getEffectiveStrength } from '../data/clubs'
import type { Difficulty, GameState, LiveMatchState, SquadPlayer, TeamState } from '../state/types'
import { clamp, clampFloat, normalizeTactics } from '../state/types'
import { formationFit } from './tactics'

const MATCH_MINUTES = 92

function chance(p: number): boolean {
  return Math.random() < p
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
  /** true = atakująca strona gra u siebie */
  isHome?: boolean
  /** Liczba braków w XI atakującego (czerwone/kontuzje) */
  menDownAtt?: number
  /** Liczba braków w XI broniącego */
  menDownDef?: number
  difficulty?: Difficulty
  /** +1 atakujący to Ty (easy pomaga), -1 atakujący to rywal */
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

/** Siła ataku Twojego XI w LIVE (łączy liveTeamPower + instrukcje/set pieces). */
export function liveSideAttackPower(state: GameState, live: LiveMatchState): number {
  const team = state.team!
  const map = new Map(team.squad.map((p) => [p.id, p]))
  const ids = live.onPitchIds.filter((id): id is string => Boolean(id))
  const xs = ids.map((id) => map.get(id)).filter(Boolean) as SquadPlayer[]
  if (!xs.length) return 28
  const avg =
    xs.reduce((s, p) => s + effectiveOvr(p, live.fatigue[p.id] ?? 50), 0) / xs.length
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
  return avg + fit + chem + captBonus + styleBias + planBias + morale + instr - menDown
}

/** Stabilna moc rywala z kadry AI (lekki noise opcjonalny). */
export function opponentAttackPower(
  state: GameState,
  opponentId: string,
  withNoise = true,
): number {
  const base = clubSquadPowerLocal(state, opponentId)
  return withNoise ? base + (Math.random() * 3 - 1.5) : base
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
  // hard
  return forPlayerSide ? { attMul: 0.9, defMul: 1.08 } : { attMul: 1.1, defMul: 0.94 }
}

/**
 * Oczekiwane gole strony atakującej vs obrona.
 * Skala mocy ~40–80 jak OVR/club power.
 */
export function expectedGoals(att: number, def: number, ctx: ExpectedGoalsCtx = {}): number {
  const home = ctx.isHome ? 1.15 : 0
  const menAtt = Math.max(0, ctx.menDownAtt ?? 0)
  const menDef = Math.max(0, ctx.menDownDef ?? 0)
  const attAdj = att + home - menAtt * 3.2
  const defAdj = def - menDef * 2.8
  let lambda = Math.max(0.12, (attAdj - defAdj) / 38 + 1.05)
  // Osłabienie broniącego → więcej xG ataku
  lambda *= 1 + menDef * 0.28
  // Osłabienie ataku → mniej xG
  lambda *= Math.max(0.45, 1 - menAtt * 0.16)
  const df = difficultyLambdaFactor(ctx.difficulty, ctx.forPlayerSide)
  lambda *= df.attMul / df.defMul
  return clampFloat(lambda, 0.12, 4.2)
}

/** Poisson-ish sampling, cap 0–5. */
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

/** Prawdopodobieństwo gola w jednej minucie przy danym λ na cały mecz. */
export function minuteGoalProb(lambda: number, minutes = MATCH_MINUTES): number {
  const p = 1 - Math.exp(-Math.max(0, lambda) / minutes)
  return clampFloat(p, 0.0015, 0.055)
}

/** Mnożniki chance z taktyki (jak tacticAttackMods chance*). */
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

/** Wynik AI↔AI wspólnym modelem λ. */
export function simulateScoreFromPowers(
  homePow: number,
  awayPow: number,
  difficulty?: Difficulty,
): { homeGoals: number; awayGoals: number; homeXg: number; awayXg: number } {
  let hp = homePow
  let ap = awayPow
  if (difficulty === 'easy') {
    hp += 0.9
    ap -= 0.7
  } else if (difficulty === 'hard') {
    hp -= 0.4
    ap += 1.1
  }
  const homeXg = expectedGoals(hp, ap * 0.92, { isHome: true, difficulty })
  const awayXg = expectedGoals(ap, hp * 0.92, { isHome: false, difficulty })
  return {
    homeGoals: sampleGoals(homeXg),
    awayGoals: sampleGoals(awayXg),
    homeXg,
    awayXg,
  }
}

export function ratingsFromMatchEvents(
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
    const goals = events.filter((e) => e.kind === 'goal' && e.side === 'you' && e.playerId === p.id).length
    r += goals * 0.85
    if (events.some((e) => e.kind === 'red' && e.playerId === p.id)) r -= 1.4
    if (events.some((e) => e.kind === 'yellow' && e.playerId === p.id)) r -= 0.25
    if (won) r += 0.25
    else if (!drawn) r -= 0.2
    r += (Math.random() - 0.5) * 0.6
    return { name: p.name, rating: Math.round(clamp(r, 4.5, 9.5) * 10) / 10, _raw: r }
  })
  return scores
    .sort((a, b) => b._raw - a._raw)
    .slice(0, 3)
    .map(({ name, rating }) => ({ name, rating }))
}

export function clubShortLabel(clubId: string): string {
  return getClub(clubId).short
}
