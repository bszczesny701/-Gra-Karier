import { getClub } from '../data/clubs'
import type {
  KeyMatchReason,
  MatchMomentResult,
  MatchResult,
  Player,
  Position,
  SeasonState,
} from '../state/types'
import { playerTablePosition, sortedStandings } from './standings'

function rand(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function chance(rng: () => number, p: number): boolean {
  return rng() < p
}

export function positionScore(player: Player): number {
  const { attrs, position } = player
  const weights: Record<Position, Record<keyof typeof attrs, number>> = {
    NP: { pace: 0.25, shooting: 0.4, passing: 0.15, defending: 0.05, stamina: 0.15 },
    POM: { pace: 0.15, shooting: 0.2, passing: 0.35, defending: 0.1, stamina: 0.2 },
    ŚO: { pace: 0.15, shooting: 0.1, passing: 0.25, defending: 0.3, stamina: 0.2 },
    OB: { pace: 0.2, shooting: 0.05, passing: 0.15, defending: 0.4, stamina: 0.2 },
  }
  const w = weights[position]
  return (
    attrs.pace * w.pace +
    attrs.shooting * w.shooting +
    attrs.passing * w.passing +
    attrs.defending * w.defending +
    attrs.stamina * w.stamina
  )
}

function teamPower(clubId: string, playerBoost = 0): number {
  return getClub(clubId).strength + playerBoost
}

function scoreGoals(attack: number, defense: number, rng: () => number): number {
  const expected = Math.max(0.2, (attack - defense) / 28 + 1.2)
  let goals = 0
  for (let i = 0; i < 5; i++) {
    if (chance(rng, expected / 5)) goals++
  }
  if (chance(rng, 0.08)) goals++
  return goals
}

/** Pary derby w każdej lidze (id klubów). */
const DERBIES: Array<[string, string]> = [
  ['wisla-mala', 'cracovia-noc'],
  ['legia-dolna', 'lech-pole'],
  ['gornik-las', 'slask-rzeka'],
  ['pogon-wiatr', 'jagiellonia-most'],
  ['rakow-miasto', 'widzew-tor'],
  ['piast-brzeg', 'korona-stolica'],
  ['zaglebie-kopalnia', 'gks-huta'],
  ['stal-mosty', 'ardia-park'],
  ['fc-europa', 'palace-side'],
  ['nordic-united', 'metro-stars'],
  ['river-capital', 'atlantic-city'],
  ['golden-gate', 'harbor-club'],
]

export function isDerby(a: string, b: string): boolean {
  return DERBIES.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  )
}

export function classifyKeyMatch(
  season: SeasonState,
  opponentId: string,
): { key: boolean; reason: KeyMatchReason; label: string; description: string } | null {
  const place = playerTablePosition(season)
  const table = sortedStandings(season)
  const week = season.week
  const max = season.maxWeeks
  const opp = getClub(opponentId)
  const own = getClub(season.clubId)

  if (isDerby(season.clubId, opponentId)) {
    return {
      key: true,
      reason: 'derby',
      label: 'Derby',
      description: `Derby: ${own.name} vs ${opp.name}. Kibice czekają — Ty rozgrywasz kluczową akcję.`,
    }
  }

  // Puchar: wybrane kolejki
  if (week === 4 || week === 8) {
    return {
      key: true,
      reason: 'cup',
      label: 'Puchar',
      description: `Mecz pucharowy z ${opp.name}. Jedna dobra akcja może przechylić szalę.`,
    }
  }

  if (week === max) {
    if (place <= 2) {
      return {
        key: true,
        reason: 'finale',
        label: 'Decydujące o mistrzostwie',
        description: `Ostatnia kolejka — walka o tytuł z ${opp.name}.`,
      }
    }
    if (place >= table.length - 1) {
      return {
        key: true,
        reason: 'finale',
        label: 'Decydujące o utrzymanie',
        description: `Ostatnia kolejka — walka o utrzymanie przeciwko ${opp.name}.`,
      }
    }
  }

  if (week >= max - 2 && place <= 2) {
    return {
      key: true,
      reason: 'title',
      label: 'Walka o mistrza',
      description: `Jesteś w czołówce tabeli. Mecz z ${opp.name} liczy się podwójnie.`,
    }
  }

  if (week >= max - 2 && place >= table.length - 1) {
    return {
      key: true,
      reason: 'relegation',
      label: 'Walka o utrzymanie',
      description: `Strefa spadkowa. Mecz z ${opp.name} może zdecydować o sezonie.`,
    }
  }

  return null
}

export function simulateMatch(
  homeId: string,
  awayId: string,
  player: Player,
  playerClubId: string,
  options: {
    rng?: () => number
    interactive?: boolean
    moment?: MatchMomentResult | null
    keyReason?: KeyMatchReason | null
    keyLabel?: string | null
    autoBasedOnForm?: boolean
  } = {},
): MatchResult {
  const rng = options.rng ?? Math.random
  const skill = positionScore(player)
  const readiness = (player.form + player.morale + player.attrs.stamina) / 3

  // Auto: większa waga formy i OVR; interaktywne: zawsze grasz
  const interactive = Boolean(options.interactive)
  const startChance = interactive
    ? 1
    : Math.min(0.95, 0.4 + readiness / 160 + player.overall / 220 + player.reputation / 250)
  const playerStarted = interactive || chance(rng, startChance)

  let momentBoost = 0
  if (options.moment) {
    const m = options.moment
    const skillGate =
      m.action === 'shoot' ? player.attrs.shooting : player.attrs.passing
    momentBoost = ((m.score - 50) / 50) * 4 + (skillGate - 50) * 0.04
  }

  const formFactor = (player.form - 50) * 0.08
  const ovrFactor = (player.overall - 50) * 0.1
  const boost = playerStarted
    ? (skill - 45) * 0.12 + formFactor + ovrFactor + momentBoost
    : 0

  const homePower =
    teamPower(homeId, homeId === playerClubId ? boost : 0) + rand(rng, -3, 3)
  const awayPower =
    teamPower(awayId, awayId === playerClubId ? boost : 0) + rand(rng, -3, 3)

  let homeGoals = scoreGoals(homePower, awayPower * 0.9, rng)
  let awayGoals = scoreGoals(awayPower, homePower * 0.9, rng)

  let playerGoals = 0
  let playerAssists = 0
  let playerRating = 5.5

  if (playerStarted) {
    let teamGoals = playerClubId === homeId ? homeGoals : awayGoals

    playerRating =
      5.0 +
      readiness / 55 +
      (skill - 40) / 45 +
      (player.overall - 50) / 40 +
      rand(rng, -0.4, 0.5)

    if (options.moment) {
      playerRating += (options.moment.score - 50) / 35
      if (options.moment.action === 'shoot' && options.moment.score >= 70) {
        playerGoals = options.moment.score >= 88 ? 2 : 1
        // ensure team scored at least player goals
        if (teamGoals < playerGoals) {
          if (playerClubId === homeId) homeGoals = playerGoals
          else awayGoals = playerGoals
          teamGoals = playerGoals
        }
        playerRating += 0.8 * playerGoals
      } else if (options.moment.action === 'pass' && options.moment.score >= 70) {
        playerAssists = 1
        if (teamGoals < 1) {
          if (playerClubId === homeId) homeGoals = 1
          else awayGoals = 1
          teamGoals = 1
        }
        playerRating += 0.6
      } else if (options.moment.score < 40) {
        playerRating -= 0.8
      }
    } else {
      // auto: gole/asysty zależne mocno od formy i OVR
      const formOvr = (player.form + player.overall) / 2
      const goalChance =
        (player.position === 'NP' ? 0.18 : player.position === 'POM' ? 0.09 : 0.04) *
        (formOvr / 55)
      if (teamGoals > 0 && chance(rng, Math.min(0.5, goalChance * teamGoals))) {
        playerGoals = 1
        playerRating += 0.8
      }
      const assistChance = (player.attrs.passing / 100) * (formOvr / 70)
      if (teamGoals - playerGoals > 0 && chance(rng, Math.min(0.35, assistChance))) {
        playerAssists = 1
        playerRating += 0.45
      }
    }

    const finalTeam = playerClubId === homeId ? homeGoals : awayGoals
    const finalOpp = playerClubId === homeId ? awayGoals : homeGoals
    if (finalTeam > finalOpp) playerRating += 0.5
    else if (finalTeam < finalOpp) playerRating -= 0.45

    playerRating = Math.max(3, Math.min(9.8, playerRating))
  } else {
    playerRating = 0
  }

  const home = getClub(homeId)
  const away = getClub(awayId)
  let narrative: string

  if (options.autoBasedOnForm) {
    const avgFormNote = `Forma ${player.form}, OVR ${player.overall}`
    if (!playerStarted) {
      narrative = `Mecz automatyczny (${avgFormNote}). Ławka — ${home.short} ${homeGoals}:${awayGoals} ${away.short}.`
    } else if (playerGoals || playerAssists) {
      narrative = `Mecz automatyczny (${avgFormNote}). ${home.short} ${homeGoals}:${awayGoals} ${away.short}. Wkład: ${playerGoals}G ${playerAssists}A, ocena ${playerRating.toFixed(1)}.`
    } else {
      narrative = `Mecz automatyczny (${avgFormNote}). ${home.short} ${homeGoals}:${awayGoals} ${away.short}. Ocena ${playerRating.toFixed(1)}.`
    }
  } else if (options.moment) {
    const act =
      options.moment.action === 'shoot'
        ? `Strzał (${Math.round(options.moment.score)}%)`
        : `Podanie (${Math.round(options.moment.score)}%)`
    narrative = `Kluczowa akcja: ${act}. ${home.short} ${homeGoals}:${awayGoals} ${away.short}. Ocena ${playerRating.toFixed(1)}.`
  } else if (!playerStarted) {
    narrative = `Siedzisz na ławce. ${home.short} ${homeGoals}:${awayGoals} ${away.short}.`
  } else {
    narrative = `Grasz od pierwszej minuty. ${home.short} ${homeGoals}:${awayGoals} ${away.short}. Ocena: ${playerRating.toFixed(1)}.`
  }

  return {
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    playerStarted,
    playerRating: Math.round(playerRating * 10) / 10,
    playerGoals,
    playerAssists,
    narrative,
    interactive,
    keyReason: options.keyReason ?? null,
    keyLabel: options.keyLabel ?? null,
    autoBasedOnForm: Boolean(options.autoBasedOnForm),
  }
}

export function pickOpponent(clubIds: string[], ownId: string, week: number): string {
  const others = clubIds.filter((id) => id !== ownId)
  return others[(week - 1) % others.length]!
}

/** W wybranych kolejkach forsuje rywala derby, jeśli istnieje. */
export function pickFixtureOpponent(clubIds: string[], ownId: string, week: number): string {
  if (week === 2 || week === 6) {
    for (const [a, b] of DERBIES) {
      if (a === ownId && clubIds.includes(b)) return b
      if (b === ownId && clubIds.includes(a)) return a
    }
  }
  return pickOpponent(clubIds, ownId, week)
}

export function isHomeWeek(week: number): boolean {
  return week % 2 === 1
}
