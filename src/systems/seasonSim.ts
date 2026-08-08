import { CLUBS, getClub, getLeague } from '../data/clubs'
import type {
  ClubStanding,
  CupStage,
  KeyMatchReason,
  PendingKeyMatch,
  Player,
  ScorerEntry,
  SeasonReport,
  SeasonState,
} from '../state/types'
import { clamp, cupStageLabel, formLabelFromAvg } from '../state/types'
import { calcOverall } from './playerFactory'
import { playerTablePosition, sortedStandings } from './standings'

const NPC_FIRST = [
  'Adam', 'Kamil', 'Piotr', 'Michał', 'Jakub', 'Bartosz', 'Tomasz', 'Mateusz', 'Damian', 'Filip',
]
const NPC_LAST = [
  'Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański',
  'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski',
]

function rngInt(n: number): number {
  return Math.floor(Math.random() * n)
}

function chance(p: number): boolean {
  return Math.random() < p
}

function npcName(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `${NPC_FIRST[h % NPC_FIRST.length]} ${NPC_LAST[(h >> 4) % NPC_LAST.length]}`
}

function updateStanding(row: ClubStanding, gf: number, ga: number): void {
  row.played++
  row.goalsFor += gf
  row.goalsAgainst += ga
  if (gf > ga) {
    row.won++
    row.points += 3
  } else if (gf === ga) {
    row.drawn++
    row.points += 1
  } else {
    row.lost++
  }
}

function scoreline(att: number, def: number): number {
  const expected = Math.max(0.15, (att - def) / 30 + 1.15)
  let g = 0
  for (let i = 0; i < 5; i++) if (chance(expected / 5)) g++
  if (chance(0.07)) g++
  return g
}

/** Szansa na występ — nigdy 100% przy słabej formie/OVR. */
export function appearanceChance(player: Player): number {
  const formPart = player.form / 140
  const ovrPart = player.overall / 160
  const repPart = player.reputation / 250
  const moralePart = player.morale / 300
  return Math.max(0.12, Math.min(0.88, 0.18 + formPart + ovrPart + repPart + moralePart))
}

/**
 * Pełny terminarz ligowy — każdy klub gra z każdym.
 * Małe ligi (≤10): dwurundowo. Większe (Ekstraklasa): jedna runda.
 */
function buildSeasonFixtures(
  clubIds: string[],
): Array<{ homeId: string; awayId: string }> {
  const ids = [...clubIds]
  const doubleRound = ids.length <= 10
  const teams: Array<string | null> =
    ids.length % 2 === 0 ? [...ids] : [...ids, null]
  const n = teams.length
  const rounds = n - 1
  const half = n / 2
  const firstHalf: Array<{ homeId: string; awayId: string }> = []

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = teams[i]
      const b = teams[n - 1 - i]
      if (!a || !b) continue
      if ((round + i) % 2 === 0) firstHalf.push({ homeId: a, awayId: b })
      else firstHalf.push({ homeId: b, awayId: a })
    }
    // rotacja „okrężna”
    const fixed = teams[0]
    const movable = teams.slice(1)
    const last = movable.pop()
    if (last !== undefined) movable.unshift(last)
    teams.splice(0, teams.length, fixed!, ...movable)
  }

  if (!doubleRound) return firstHalf
  const secondHalf = firstHalf.map((f) => ({ homeId: f.awayId, awayId: f.homeId }))
  return [...firstHalf, ...secondHalf]
}

function bumpScorer(map: Map<string, ScorerEntry>, key: string, entry: ScorerEntry, goals: number): void {
  const cur = map.get(key)
  if (cur) cur.goals += goals
  else map.set(key, { ...entry, goals })
}

function simulatePolishCup(
  playerClubId: string,
  player: Player,
): { stage: CupStage; playerGoals: number; playerApps: number } {
  const rounds: Array<{ id: CupStage; difficulty: number }> = [
    { id: 'r32', difficulty: 0.92 },
    { id: 'r16', difficulty: 1.0 },
    { id: 'qf', difficulty: 1.08 },
    { id: 'sf', difficulty: 1.15 },
    { id: 'final', difficulty: 1.22 },
  ]

  let furthest: CupStage = 'out'
  let playerGoals = 0
  let playerApps = 0
  const own = getClub(playerClubId)
  const rivalsPool = Object.keys(CLUBS).filter((id) => id !== playerClubId)

  for (const round of rounds) {
    const rivalId = rivalsPool[rngInt(rivalsPool.length)]!
    const rival = getClub(rivalId)
    const played = chance(appearanceChance(player))
    if (played) {
      playerApps++
      const goalP =
        (player.position === 'NP' ? 0.28 : player.position === 'POM' ? 0.14 : 0.06) *
        (player.form / 70) *
        (player.attrs.shooting / 70)
      if (chance(Math.min(0.55, goalP))) playerGoals++
    }

    const boost = played ? (player.overall - 50) * 0.07 + (player.form - 50) * 0.05 : -2
    const ownP = own.strength + boost + Math.random() * 6
    const rivP = rival.strength * round.difficulty + Math.random() * 6
    const win = ownP >= rivP

    if (!win) {
      return { stage: furthest === 'out' ? 'out' : furthest, playerGoals, playerApps }
    }
    furthest = round.id
    if (round.id === 'final') {
      return { stage: 'winner', playerGoals, playerApps }
    }
  }
  return { stage: furthest, playerGoals, playerApps }
}

function buildKeyMatches(
  season: SeasonState,
  place: number,
  clubCount: number,
  cupStage: CupStage,
): PendingKeyMatch[] {
  const keys: PendingKeyMatch[] = []
  const league = getLeague(season.leagueId)
  const own = season.clubId
  const others = league.clubIds.filter((id) => id !== own)
  const opp = (i: number) => others[i % others.length]!

  const push = (
    reason: KeyMatchReason,
    label: string,
    description: string,
    stake: PendingKeyMatch['stake'],
    opponentId: string,
  ) => {
    if (keys.length >= 2) return
    const home = keys.length % 2 === 0
    keys.push({
      homeId: home ? own : opponentId,
      awayId: home ? opponentId : own,
      opponentId,
      reason,
      label,
      description,
      stake,
    })
  }

  if (cupStage === 'final' || cupStage === 'sf') {
    push(
      'cup',
      cupStage === 'final' ? 'Finał Pucharu Polski' : 'Półfinał Pucharu Polski',
      `Kluczowa akcja w Pucharze Polski przeciwko ${getClub(opp(3)).name}.`,
      'cupProgress',
      opp(3),
    )
  }

  if (league.tier > 1 && place <= 2) {
    push(
      'promotion',
      'Mecz o awans',
      `${getClub(own).name} walczy o awans. Jedna akcja może przesądzić sezon.`,
      'leaguePoints',
      opp(1),
    )
  }

  if (league.tier === 1 && place <= 2) {
    push(
      'title',
      'Walka o mistrzostwo',
      `Czołówka Ekstraklasy — starcie z ${getClub(opp(0)).name}.`,
      'leaguePoints',
      opp(0),
    )
  }

  const relegationZone = league.tier === 1 ? clubCount - 2 : clubCount - 1
  if (league.tier < 3 && place >= relegationZone) {
    push(
      'relegation',
      'Walka o utrzymanie',
      `Strefa spadkowa. Musisz pomóc ${getClub(own).name}.`,
      'leaguePoints',
      opp(2),
    )
  }

  // jeśli brak kluczowych, a puchar głęboko — dodaj mecz pucharowy
  if (keys.length === 0 && (cupStage === 'qf' || cupStage === 'r16')) {
    push(
      'cup',
      'Mecz Pucharu Polski',
      `Ważny mecz PP z ${getClub(opp(4)).name}.`,
      'cupProgress',
      opp(4),
    )
  }

  return keys.slice(0, 2)
}

export function simulateFullSeason(player: Player, season: SeasonState): SeasonReport {
  const league = getLeague(season.leagueId)
  const clubCount = league.clubIds.length
  const allFixtures = buildSeasonFixtures(league.clubIds)
  const playerFixtures = allFixtures.filter(
    (f) => f.homeId === season.clubId || f.awayId === season.clubId,
  )
  const fixturesForPlayer = playerFixtures.length
  const overallBefore = player.overall

  const standings: ClubStanding[] = league.clubIds.map((id) => ({
    clubId: id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }))

  const scorerMap = new Map<string, ScorerEntry>()
  for (const clubId of league.clubIds) {
    if (clubId === season.clubId) continue
    bumpScorer(
      scorerMap,
      `npc-${clubId}`,
      {
        name: npcName(clubId + season.year),
        clubId,
        goals: 0,
        isPlayer: false,
      },
      0,
    )
  }

  let appearances = 0
  let goals = 0
  let assists = 0
  let ratingSum = 0
  let formSum = 0
  let formSamples = 0
  let workingForm = player.form

  for (const fixture of allFixtures) {
    const { homeId, awayId } = fixture
    const involvesPlayer = homeId === season.clubId || awayId === season.clubId

    let starts = false
    let boost = 0
    let matchGoals = 0
    let matchAssists = 0

    if (involvesPlayer) {
      workingForm = clamp(workingForm + (Math.random() * 10 - 5), 20, 95)
      formSum += workingForm
      formSamples++
      const tempPlayer = { ...player, form: workingForm }
      starts = chance(appearanceChance(tempPlayer))

      if (starts) {
        appearances++
        boost = (player.overall - 50) * 0.1 + (workingForm - 50) * 0.08
        const goalChance =
          (player.position === 'NP' ? 0.22 : player.position === 'POM' ? 0.1 : 0.04) *
          (workingForm / 65) *
          (player.attrs.shooting / 75)
        if (chance(Math.min(0.48, goalChance))) {
          matchGoals = chance(0.12) ? 2 : 1
          goals += matchGoals
        }
        const assistChance =
          (player.position === 'POM' || player.position === 'NP' ? 0.16 : 0.07) *
          (player.attrs.passing / 80) *
          (workingForm / 70)
        if (chance(Math.min(0.4, assistChance))) {
          matchAssists = 1
          assists++
        }
        const rating = clamp(
          5.2 +
            workingForm / 55 +
            (player.overall - 45) / 40 +
            matchGoals * 0.85 +
            matchAssists * 0.45 +
            (Math.random() * 1.2 - 0.4),
          3,
          9.7,
        )
        ratingSum += rating
        workingForm = clamp(
          workingForm + (rating >= 7 ? 2 : rating < 5.5 ? -3 : 0),
          20,
          95,
        )
      } else {
        workingForm = clamp(workingForm + 1, 20, 95)
      }
    }

    const homePow =
      getClub(homeId).strength +
      (homeId === season.clubId && starts ? boost : 0) +
      Math.random() * 6 -
      3
    const awayPow =
      getClub(awayId).strength +
      (awayId === season.clubId && starts ? boost : 0) +
      Math.random() * 6 -
      3

    let hg = scoreline(homePow, awayPow * 0.9)
    let ag = scoreline(awayPow, homePow * 0.9)

    if (starts && matchGoals > 0) {
      if (homeId === season.clubId) hg = Math.max(hg, matchGoals)
      else ag = Math.max(ag, matchGoals)
    }

    updateStanding(standings.find((s) => s.clubId === homeId)!, hg, ag)
    updateStanding(standings.find((s) => s.clubId === awayId)!, ag, hg)

    // NPC gole — rozdziel między strzelców klubów
    for (const [clubId, gFor] of [
      [homeId, hg],
      [awayId, ag],
    ] as const) {
      if (clubId === season.clubId) continue
      let remaining = gFor
      while (remaining > 0) {
        bumpScorer(
          scorerMap,
          `npc-${clubId}`,
          {
            name: npcName(clubId + season.year),
            clubId,
            goals: 0,
            isPlayer: false,
          },
          1,
        )
        remaining--
      }
    }
  }

  if (goals > 0) {
    bumpScorer(
      scorerMap,
      'player',
      { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
      goals,
    )
  }

  const leagueApps = appearances
  const leagueAvgRating = leagueApps ? ratingSum / leagueApps : 5.5

  const cup = simulatePolishCup(season.clubId, { ...player, form: workingForm })
  goals += cup.playerGoals
  appearances += cup.playerApps
  if (cup.playerGoals > 0) {
    bumpScorer(
      scorerMap,
      'player',
      { name: player.name, clubId: season.clubId, goals: 0, isPlayer: true },
      cup.playerGoals,
    )
  }

  const avgForm = formSamples ? formSum / formSamples : player.form

  let ovrGain = 0
  if (leagueApps >= fixturesForPlayer * 0.55 && avgForm >= 60) ovrGain += 1
  if (leagueApps >= fixturesForPlayer * 0.7 && leagueAvgRating >= 7) ovrGain += 1
  if (goals >= 8) ovrGain += 1
  if (cup.stage === 'winner' || cup.stage === 'final') ovrGain += 1
  if (avgForm < 40 || leagueApps < fixturesForPlayer * 0.25) ovrGain -= 1
  ovrGain = clamp(ovrGain, -1, 3)

  if (ovrGain > 0) {
    const focus =
      player.position === 'NP'
        ? 'shooting'
        : player.position === 'POM'
          ? 'passing'
          : player.position === 'OB'
            ? 'defending'
            : 'pace'
    player.attrs[focus] = clamp(player.attrs[focus] + ovrGain)
    if (ovrGain >= 2) player.attrs.stamina = clamp(player.attrs.stamina + 1)
  } else if (ovrGain < 0) {
    player.attrs.stamina = clamp(player.attrs.stamina - 1)
  }

  player.form = clamp(Math.round(avgForm), 1, 100)
  player.overall = calcOverall(player.attrs, player.position)
  player.morale = clamp(
    player.morale + (leagueAvgRating >= 7 ? 5 : avgForm < 40 ? -5 : 2),
    1,
    100,
  )
  player.reputation = clamp(
    player.reputation +
      Math.floor(goals / 3) +
      (cup.stage === 'winner' ? 5 : cup.stage === 'final' ? 3 : 0) +
      (leagueApps > fixturesForPlayer * 0.6 ? 2 : 0),
    0,
    100,
  )
  player.money += getClub(season.clubId).wage * 8

  const sorted = sortedStandings({ ...season, standings })
  const place = sorted.findIndex((s) => s.clubId === season.clubId) + 1
  const myRow = standings.find((s) => s.clubId === season.clubId)!

  const scorers = [...scorerMap.values()]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 12)
  const playerScorerRank = scorers.findIndex((s) => s.isPlayer)
  const rank = playerScorerRank >= 0 ? playerScorerRank + 1 : null

  const keyMatchesPending = buildKeyMatches(season, place, clubCount, cup.stage)

  // Awans: top 2 z III/I ligi. Spadek: ostatnie 2 w Ekstraklasie / ostatnie 2 w I lidze
  const promotion = league.tier > 1 && place <= 2
  const relegation =
    league.tier === 1
      ? place >= clubCount - 1
      : league.tier === 2
        ? place >= clubCount - 1
        : false
  const title = league.tier === 1 && place === 1

  let narrative = `${getClub(season.clubId).name} kończy sezon na ${place}. miejscu (${myRow.points} pkt, ${myRow.played} meczów). `
  narrative += `Zagrałeś ${leagueApps}/${fixturesForPlayer} meczów ligowych (+ puchar). Forma: ${formLabelFromAvg(avgForm)}. `
  if (ovrGain > 0) narrative += `Overall wzrósł o ${ovrGain} (${overallBefore} → ${player.overall}). `
  else if (ovrGain < 0) narrative += `Overall spadł (${overallBefore} → ${player.overall}). `
  else narrative += `Overall bez dużych zmian (${player.overall}). `
  if (promotion) narrative += 'Awans! '
  if (relegation) narrative += 'Spadek. '
  if (title) narrative += 'Mistrzostwo Polski! '
  narrative += cupStageLabel(cup.stage) + '.'

  return {
    year: season.year,
    leagueId: season.leagueId,
    clubId: season.clubId,
    place,
    points: myRow.points,
    played: myRow.played,
    appearances,
    possibleAppearances: fixturesForPlayer,
    goals,
    assists,
    avgRating: leagueApps ? Math.round(leagueAvgRating * 10) / 10 : 0,
    avgForm: Math.round(avgForm),
    formLabel: formLabelFromAvg(avgForm),
    overallBefore,
    overallAfter: player.overall,
    overallDelta: player.overall - overallBefore,
    cupStage: cup.stage,
    cupLabel: cupStageLabel(cup.stage),
    scorers,
    playerScorerRank: rank,
    standings,
    narrative,
    keyMatchesPending,
    keyMatchesDone: 0,
    promotion,
    relegation,
    title,
  }
}

export function applyKeyMatchToReport(
  report: SeasonReport,
  player: Player,
  momentScore: number,
  action: 'shoot' | 'pass',
  match: PendingKeyMatch,
): void {
  const success = momentScore >= 65
  report.keyMatchesDone++

  if (success) {
    player.morale = clamp(player.morale + 3, 1, 100)
    player.form = clamp(player.form + 2, 1, 100)
    if (action === 'shoot' && momentScore >= 70) {
      report.goals += 1
      const entry = report.scorers.find((s) => s.isPlayer)
      if (entry) entry.goals += 1
      else
        report.scorers.unshift({
          name: player.name,
          clubId: report.clubId,
          goals: 1,
          isPlayer: true,
        })
      report.scorers.sort((a, b) => b.goals - a.goals)
      report.playerScorerRank = report.scorers.findIndex((s) => s.isPlayer) + 1
    }
    if (action === 'pass' && momentScore >= 70) report.assists += 1

    if (match.stake === 'leaguePoints') {
      const row = report.standings.find((s) => s.clubId === report.clubId)
      if (row) {
        row.points += 2
        row.goalsFor += 1
      }
      report.points += 2
      // przelicz miejsce
      const fakeSeason = {
        year: report.year,
        leagueId: report.leagueId,
        clubId: report.clubId,
        standings: report.standings,
        preseasonDone: true,
      }
      report.place = playerTablePosition(fakeSeason)
    }

    if (match.stake === 'cupProgress') {
      if (report.cupStage === 'sf') {
        report.cupStage = 'final'
        report.cupLabel = cupStageLabel('final')
      } else if (report.cupStage === 'final') {
        report.cupStage = 'winner'
        report.cupLabel = cupStageLabel('winner')
        player.reputation = clamp(player.reputation + 3, 0, 100)
      } else if (report.cupStage === 'qf' || report.cupStage === 'r16') {
        report.cupStage = 'sf'
        report.cupLabel = cupStageLabel('sf')
      }
    }

    report.narrative += ` Kluczowy mecz wygrany akcją (${Math.round(momentScore)}%).`
  } else {
    player.morale = clamp(player.morale - 2, 1, 100)
    report.narrative += ` Kluczowa akcja nie wyszła (${Math.round(momentScore)}%).`
  }
}

