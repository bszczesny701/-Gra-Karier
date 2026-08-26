import { getClub } from '../data/clubs'
import { EKSTRAKLASA_SQUADS, type RealPlayerSeed } from '../data/ekstraklasaSquads'
import type { FormationSlot, PitchRole, Position, SquadPlayer, TeamState } from '../state/types'
import { clamp, defaultTactics, formationPlan, roleBase } from '../state/types'
import { attrsFromOverall, calcOverall } from './playerFactory'

const FIRST = [
  'Jakub', 'Piotr', 'Mateusz', 'Kamil', 'Adam', 'Michał', 'Bartosz', 'Paweł',
  'Tomasz', 'Łukasz', 'Szymon', 'Filip', 'Dawid', 'Krzysztof', 'Marcin', 'Oskar',
  'Igor', 'Antoni', 'Hubert', 'Patryk', 'Sebastian', 'Rafał', 'Maciej', 'Wojciech',
]
const LAST = [
  'Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski',
  'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur',
  'Kwiatkowski', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Nowicki', 'Pawlak', 'Michalski',
  'Adamczyk', 'Dudek', 'Zając', 'Wieczorek', 'Jabłoński', 'Król', 'Majewski', 'Olszewski',
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function playerName(seed: string): string {
  const h = hash(seed)
  return `${FIRST[h % FIRST.length]} ${LAST[Math.floor(h / 19) % LAST.length]}`
}

/** Kadra z dokładnymi rolami (jak w FIFA). */
const SQUAD_ROLES: PitchRole[] = [
  'LO', 'ŚOL', 'ŚOP', 'PO', 'ŚO',
  'LP', 'DP', 'ŚP', 'PP', 'OP',
  'LN', 'ŚN', 'PN',
  'LP', 'PP', 'DP', 'ŚOL', 'ŚN',
]

function stubContract(age: number, overall: number, h: number): {
  contractYears: number
  wage: number
  releaseClause: number | null
} {
  const years = age <= 22 ? 3 + (h % 2) : age >= 32 ? 1 + (h % 2) : 2 + (h % 3)
  const wage = Math.round(800 + overall * overall * 1.8 + (h % 400))
  const clause =
    overall >= 72 ? Math.round(wage * 52 * (2.2 + (h % 10) / 10)) : h % 3 === 0 ? Math.round(wage * 40) : null
  return { contractYears: clamp(years, 1, 4), wage, releaseClause: clause }
}

export function normalizeSquadPlayer(p: SquadPlayer): SquadPlayer {
  const h = hash(p.id)
  const stub = stubContract(p.age, p.overall, h)
  p.contractYears = p.contractYears ?? stub.contractYears
  p.wage = p.wage ?? stub.wage
  p.seasonApps = p.seasonApps ?? 0
  p.seasonGoals = p.seasonGoals ?? 0
  p.wantsToLeave = p.wantsToLeave ?? false
  p.injuryMatchesLeft = p.injuryMatchesLeft ?? 0
  p.suspensionMatchesLeft = p.suspensionMatchesLeft ?? 0
  if (p.releaseClause === undefined) p.releaseClause = stub.releaseClause
  return p
}

export function normalizeTeamSquad(team: TeamState): void {
  for (const p of team.squad) normalizeSquadPlayer(p)
}

/** Aktualizuje flagę „chce odejść” wg morale / gry / kontuzji. */
export function updateWantsToLeave(team: TeamState, leagueRoundsPlayed: number): void {
  for (const p of team.squad) {
    normalizeSquadPlayer(p)
    const longInjury = (p.injuryMatchesLeft ?? 0) >= 3 && p.morale < 45
    const unusedStar = p.seasonApps === 0 && p.overall >= 70 && leagueRoundsPlayed >= 8
    const lowMorale = p.morale < 35
    p.wantsToLeave = lowMorale || unusedStar || longInjury
  }
}

function makePlayer(
  clubId: string,
  index: number,
  role: PitchRole,
  baseStrength: number,
): SquadPlayer {
  const position = roleBase(role)
  const seed = `${clubId}-${index}-${role}`
  const h = hash(seed)
  const age = 18 + (h % 16)
  const variance = ((h % 13) - 6) + (age <= 21 ? -2 : age >= 32 ? -1 : 1)
  const overall = clamp(baseStrength + variance, 32, 92)
  const attrs = attrsFromOverall(position, overall)
  const keys = ['pace', 'shooting', 'passing', 'defending', 'stamina'] as const
  const jitter = keys[h % keys.length]!
  attrs[jitter] = clamp(attrs[jitter] + ((h % 5) - 2))
  const finalOvr = calcOverall(attrs, position)
  const contract = stubContract(age, finalOvr, h)
  return {
    id: `${clubId}-p${index}`,
    name: playerName(seed),
    position,
    role,
    age,
    overall: finalOvr,
    attrs,
    form: 48 + (h % 20),
    fitness: 78 + (h % 18),
    morale: 50 + (h % 25),
    injuryMatchesLeft: 0,
    suspensionMatchesLeft: 0,
    contractYears: contract.contractYears,
    wage: contract.wage,
    seasonApps: 0,
    seasonGoals: 0,
    wantsToLeave: false,
    releaseClause: contract.releaseClause,
  }
}

function makeFromSeed(clubId: string, index: number, seed: RealPlayerSeed): SquadPlayer {
  const position = roleBase(seed.role)
  const attrs = attrsFromOverall(position, seed.overall)
  const h = hash(`${clubId}-${seed.name}-${index}`)
  const contract = stubContract(seed.age, seed.overall, h)
  return {
    id: `${clubId}-r${index}`,
    name: seed.name,
    position,
    role: seed.role,
    age: seed.age,
    overall: seed.overall,
    attrs,
    form: 48 + (h % 20),
    fitness: 78 + (h % 18),
    morale: 50 + (h % 25),
    injuryMatchesLeft: 0,
    suspensionMatchesLeft: 0,
    contractYears: contract.contractYears,
    wage: contract.wage,
    seasonApps: 0,
    seasonGoals: 0,
    wantsToLeave: false,
    releaseClause: contract.releaseClause,
  }
}

export function generateSquad(clubId: string): SquadPlayer[] {
  const real = EKSTRAKLASA_SQUADS[clubId]
  if (real?.length) {
    return real.map((seed, i) => makeFromSeed(clubId, i, seed))
  }
  const club = getClub(clubId)
  return SQUAD_ROLES.map((role, i) => makePlayer(clubId, i, role, club.strength))
}

function relatedPos(a: Position, b: Position): boolean {
  if (a === b) return true
  if ((a === 'POM' || a === 'ŚO') && (b === 'POM' || b === 'ŚO')) return true
  return false
}

function fitScore(p: SquadPlayer, slot: FormationSlot): number {
  if ((p.injuryMatchesLeft ?? 0) > 0 || (p.suspensionMatchesLeft ?? 0) > 0) return -999
  if (slot.role === 'BR') {
    if (p.role !== 'BR') return -999
    return p.overall + (p.form - 50) / 5 + (p.fitness - 70) / 8 + 20
  }
  if (p.role === 'BR') return -999
  let s = p.overall + (p.form - 50) / 5 + (p.fitness - 70) / 8
  const cb = (r: string) => r === 'ŚO' || r === 'ŚOL' || r === 'ŚOP'
  if (p.role === slot.role || (cb(p.role) && cb(slot.role))) s += 14
  else if (p.position === slot.base) s += 7
  else if (relatedPos(p.position, slot.base)) s += 2
  else s -= 14
  if (p.fitness < 50) s -= 8
  return s
}

/** Domyślna „11” — najlepsi dopasowani do ról formacji. */
export function pickDefaultLineup(
  squad: SquadPlayer[],
  plan: FormationSlot[],
): { startingIds: string[]; benchIds: string[] } {
  const used = new Set<string>()
  const startingIds: string[] = []

  for (const slot of plan) {
    const candidates = squad
      .filter(
        (p) =>
          !used.has(p.id) &&
          (p.injuryMatchesLeft ?? 0) === 0 &&
          (p.suspensionMatchesLeft ?? 0) === 0,
      )
      .map((p) => ({ p, score: fitScore(p, slot) }))
      .sort((a, b) => b.score - a.score)
    const pick = candidates[0]?.p
    if (pick) {
      used.add(pick.id)
      startingIds.push(pick.id)
    }
  }

  const benchIds = squad
    .filter(
      (p) =>
        !used.has(p.id) &&
        (p.injuryMatchesLeft ?? 0) === 0 &&
        (p.suspensionMatchesLeft ?? 0) === 0,
    )
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 7)
    .map((p) => p.id)

  return { startingIds, benchIds }
}

export function createTeamState(clubId: string): TeamState {
  const squad = generateSquad(clubId)
  const plan = formationPlan('4-4-2')
  const { startingIds, benchIds } = pickDefaultLineup(squad, plan)
  return {
    clubId,
    squad,
    tactics: defaultTactics('4-4-2'),
    teamChemistry: 52,
    budget: Math.round(getClub(clubId).wage * 40 + getClub(clubId).strength * 80),
    seasonIncome: 0,
    seasonExpense: 0,
    startingIds,
    benchIds,
  }
}

export function squadById(team: TeamState): Map<string, SquadPlayer> {
  return new Map(team.squad.map((p) => [p.id, p]))
}

export function starters(team: TeamState): SquadPlayer[] {
  const map = squadById(team)
  return team.startingIds.map((id) => map.get(id)!).filter(Boolean)
}

export function averageStarterOvr(team: TeamState): number {
  const xi = starters(team)
  if (!xi.length) return 40
  return xi.reduce((s, p) => s + p.overall, 0) / xi.length
}
