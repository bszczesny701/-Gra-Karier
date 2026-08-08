import { getClub } from '../data/clubs'
import type { MatchResult, Player, Position } from '../state/types'

function rand(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function chance(rng: () => number, p: number): boolean {
  return rng() < p
}

function positionScore(player: Player): number {
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

export function simulateMatch(
  homeId: string,
  awayId: string,
  player: Player,
  playerClubId: string,
  rng: () => number = Math.random,
): MatchResult {
  const skill = positionScore(player)
  const readiness = (player.form + player.morale + player.attrs.stamina) / 3
  const startChance = Math.min(0.92, 0.35 + readiness / 180 + player.reputation / 200)
  const playerStarted = chance(rng, startChance)

  const boost = playerStarted ? (skill - 45) * 0.12 + (player.form - 50) * 0.05 : 0
  const homePower =
    teamPower(homeId, homeId === playerClubId ? boost : 0) + rand(rng, -4, 4)
  const awayPower =
    teamPower(awayId, awayId === playerClubId ? boost : 0) + rand(rng, -4, 4)

  const homeGoals = scoreGoals(homePower, awayPower * 0.9, rng)
  const awayGoals = scoreGoals(awayPower, homePower * 0.9, rng)

  let playerGoals = 0
  let playerAssists = 0
  let playerRating = 5.5

  if (playerStarted) {
    const teamGoals = playerClubId === homeId ? homeGoals : awayGoals
    const oppGoals = playerClubId === homeId ? awayGoals : homeGoals
    const isWin = teamGoals > oppGoals
    const isDraw = teamGoals === oppGoals

    playerRating = 5.2 + readiness / 50 + (skill - 40) / 40 + rand(rng, -0.6, 0.8)
    if (isWin) playerRating += 0.6
    if (isDraw) playerRating += 0.15
    if (!isWin && !isDraw) playerRating -= 0.5

    const goalChance =
      player.position === 'NP'
        ? 0.22 + skill / 400
        : player.position === 'POM'
          ? 0.1
          : player.position === 'ŚO'
            ? 0.06
            : 0.03

    if (teamGoals > 0 && chance(rng, Math.min(0.55, goalChance * teamGoals))) {
      playerGoals = chance(rng, 0.15) ? 2 : 1
      playerGoals = Math.min(playerGoals, teamGoals)
      playerRating += playerGoals * 0.9
    }

    const assistChance = player.position === 'POM' || player.position === 'NP' ? 0.18 : 0.08
    if (teamGoals - playerGoals > 0 && chance(rng, assistChance)) {
      playerAssists = 1
      playerRating += 0.5
    }

    playerRating = Math.max(3, Math.min(9.8, playerRating))
  } else {
    playerRating = 0
  }

  const home = getClub(homeId)
  const away = getClub(awayId)
  let narrative: string
  if (!playerStarted) {
    narrative = `Siedzisz na ławce. ${home.short} ${homeGoals}:${awayGoals} ${away.short}. Trener nie dał szansy — podnieś formę.`
  } else if (playerGoals > 0) {
    narrative = `Rozpoczynasz mecz i strzelasz ${playerGoals === 1 ? 'gola' : `${playerGoals} gole`}! ${home.short} ${homeGoals}:${awayGoals} ${away.short}.`
  } else if (playerAssists > 0) {
    narrative = `Asysta i solidna gra. Wynik: ${home.short} ${homeGoals}:${awayGoals} ${away.short}.`
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
  }
}

export function pickOpponent(clubIds: string[], ownId: string, week: number): string {
  const others = clubIds.filter((id) => id !== ownId)
  return others[(week - 1) % others.length]!
}

export function isHomeWeek(week: number): boolean {
  return week % 2 === 1
}
