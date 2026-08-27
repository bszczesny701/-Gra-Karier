import { getClub } from '../data/clubs'
import type { GameState, NewsItem, NewsKind, SquadPlayer } from '../state/types'
import { sortedStandings } from './standings'

let newsSeq = 0

export function pushNews(
  state: GameState,
  partial: Omit<NewsItem, 'id' | 'createdAt'> & { createdAt?: number },
): void {
  if (!state.news) state.news = []
  newsSeq += 1
  const item: NewsItem = {
    id: `news-${Date.now()}-${newsSeq}`,
    createdAt: partial.createdAt ?? Date.now(),
    kind: partial.kind,
    headline: partial.headline,
    body: partial.body,
    round: partial.round,
    year: partial.year,
  }
  state.news = [item, ...state.news].slice(0, 30)
}

export function newsKindLabel(kind: NewsKind): string {
  if (kind === 'match') return 'Mecz'
  if (kind === 'form') return 'Forma'
  if (kind === 'club') return 'Klub'
  if (kind === 'transfer') return 'Transfery'
  if (kind === 'press') return 'Media'
  return 'Liga'
}

function shortClub(id: string): string {
  return getClub(id).short
}

function fullClub(id: string): string {
  return getClub(id).name
}

function matchBlurb(homeId: string, awayId: string, hg: number, ag: number): { headline: string; body: string } {
  const H = fullClub(homeId)
  const A = fullClub(awayId)
  const hs = shortClub(homeId)
  const as = shortClub(awayId)
  if (hg > ag) {
    const margin = hg - ag
    if (margin >= 3) {
      return {
        headline: `${hs} rozbił ${as} ${hg}:${ag}`,
        body: `${H} nie dał szans rywalom. Przy ${hg}:${ag} kibice mogli świętować już przed końcowym gwizdkiem — ${A} wraca do domu z pustymi rękami.`,
      }
    }
    return {
      headline: `${hs} wygrywa z ${as} ${hg}:${ag}`,
      body: `${H} zdobył trzy punkty po starciu z ${A}. Wynik ${hg}:${ag} dobrze oddaje przewagę gospodarzy w kluczowych momentach.`,
    }
  }
  if (ag > hg) {
    const margin = ag - hg
    if (margin >= 3) {
      return {
        headline: `${as} upokorzył ${hs} na wyjeździe ${hg}:${ag}`,
        body: `Sensacja w lidze: ${A} zmiażdżył ${H} na ich boisku. Goście odjechali na ${hg}:${ag} i zabrali komplet punktów.`,
      }
    }
    return {
      headline: `${as} wywozi punkty z ${hs} ${hg}:${ag}`,
      body: `${A} wraca z wygranej ${hg}:${ag} nad ${H}. Skuteczność gości i błędy gospodarzy zdecydowały o losach meczu.`,
    }
  }
  return {
    headline: `${hs} i ${as} dzielą się punktami ${hg}:${ag}`,
    body: `Remis ${hg}:${ag} między ${H} a ${A}. Obie drużyny miały okazje, ale ostatecznie podzieliły się punktami.`,
  }
}

export type AiMatchResult = { homeId: string; awayId: string; homeGoals: number; awayGoals: number }

/** Po kolejce AI — 1–2 notki meczowe + okazjonalnie forma/transfer. */
export function publishRoundNews(state: GameState, results: AiMatchResult[]): void {
  const season = state.season
  if (!season || !results.length) return
  const round = season.roundIndex + 1
  const year = season.year

  const scored = [...results].sort(
    (a, b) => Math.abs(b.homeGoals - b.awayGoals) - Math.abs(a.homeGoals - a.awayGoals) || b.homeGoals + b.awayGoals - (a.homeGoals + a.awayGoals),
  )
  const picks = scored.slice(0, results.length <= 2 ? 1 : 2)
  for (const r of picks) {
    const blurb = matchBlurb(r.homeId, r.awayId, r.homeGoals, r.awayGoals)
    pushNews(state, { kind: 'match', ...blurb, round, year })
  }

  maybePublishClubForm(state, round, year)
  maybePublishTransferRumour(state, round, year)
}

export function publishYourMatchNews(
  state: GameState,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
): void {
  const season = state.season
  if (!season) return
  const round = Math.max(1, season.roundIndex)
  const year = season.year
  const clubId = season.clubId
  const blurb = matchBlurb(homeId, awayId, homeGoals, awayGoals)
  const youHome = homeId === clubId
  const yours = youHome ? homeGoals : awayGoals
  const theirs = youHome ? awayGoals : homeGoals
  let headline = blurb.headline
  if (yours > theirs) headline = `Twój zespół wygrywa ${yours}:${theirs}`
  else if (yours < theirs) headline = `Porażka Twojej drużyny ${yours}:${theirs}`
  else headline = `Remis Twojego zespołu ${yours}:${theirs}`

  pushNews(state, {
    kind: 'match',
    headline,
    body: blurb.body,
    round,
    year,
  })

  publishPlayerFormNews(state, round, year)
}

function maybePublishClubForm(state: GameState, round: number, year: number): void {
  const season = state.season
  if (!season || Math.random() > 0.55) return
  const table = sortedStandings(season)
  const hot = table.find((r) => {
    const f = r.form?.slice(-3) ?? []
    return f.length >= 3 && f.every((x) => x === 'W')
  })
  const cold = table.find((r) => {
    const f = r.form?.slice(-3) ?? []
    return f.length >= 3 && f.every((x) => x === 'L')
  })
  if (hot && Math.random() < 0.6) {
    const c = getClub(hot.clubId)
    pushNews(state, {
      kind: 'club',
      headline: `${c.short} w doskonałej formie`,
      body: `${c.name} wygrywa mecz za meczem. Trzy kolejne zwycięstwa i ${hot.points} pkt w tabeli — w szatni rośnie wiara w wysokie cele.`,
      round,
      year,
    })
    return
  }
  if (cold) {
    const c = getClub(cold.clubId)
    pushNews(state, {
      kind: 'club',
      headline: `Kryzys formy w ${c.short}`,
      body: `${c.name} zalicza serię porażek. Kibice domagają się reakcji, a sztab szuka odpowiedzi przed kolejną kolejką.`,
      round,
      year,
    })
  }
}

function publishPlayerFormNews(state: GameState, round: number, year: number): void {
  const team = state.team
  if (!team || Math.random() > 0.7) return
  const sorted = [...team.squad].sort((a, b) => b.form - a.form)
  const hot = sorted[0]
  const cold = sorted[sorted.length - 1]
  if (!hot || !cold) return
  if (hot.form >= 68 && Math.random() < 0.55) {
    pushNews(state, {
      kind: 'form',
      headline: `${shortName(hot)} w świetnej dyspozycji`,
      body: `${hot.name} (${hot.role}) prezentuje wysoką formę. W klubie mówią o kluczowej roli w układance taktycznej na najbliższe tygodnie.`,
      round,
      year,
    })
  } else if (cold.form <= 38) {
    pushNews(state, {
      kind: 'form',
      headline: `${shortName(cold)} szuka rytmu`,
      body: `${cold.name} zalicza słabszy okres. Sztab liczy, że odpoczynek lub zmiana roli pomoże wrócić do poziomu, którego wszyscy od niego oczekują.`,
      round,
      year,
    })
  }
}

const TRANSFER_RUMOURS: Array<(club: string) => string> = [
  (club) =>
    `Plotki transferowe: ${club} monitoruje rynek skrzydłowych. Oficjalnie — cisza, nieoficjalnie — rozmowy sondażowe już trwają.`,
  (club) =>
    `Agenci krążą wokół ${club}. Mówi się o możliwym wzmocnieniu środka pola zimą — na razie bez konkretnych nazwisk.`,
  () =>
    `Okienko jeszcze zamknięte, ale w kuluarach Ekstraklasy wraca temat wypożyczeń młodych napastników z zagranicy.`,
  (club) =>
    `${club} dementuje „gorące” spekulacje medialne. Dyrektor sportowy: „Nie komentujemy plotek, pracujemy spokojnie”.`,
]

function maybePublishTransferRumour(state: GameState, round: number, year: number): void {
  if (Math.random() > 0.35) return
  const season = state.season!
  const table = sortedStandings(season)
  const pick = table[Math.floor(Math.random() * Math.min(8, table.length))]
  const club = pick ? getClub(pick.clubId).name : 'Klub z ligi'
  const tpl = TRANSFER_RUMOURS[Math.floor(Math.random() * TRANSFER_RUMOURS.length)]!
  pushNews(state, {
    kind: 'transfer',
    headline: 'Plotki transferowe',
    body: tpl(club),
    round,
    year,
  })
}

function shortName(p: SquadPlayer): string {
  return p.name.split(' ').pop() ?? p.name
}

/** Seed na start kariery. */
export function seedOpeningNews(state: GameState): void {
  const season = state.season
  const manager = state.manager
  if (!season || !manager) return
  const club = getClub(season.clubId)
  pushNews(state, {
    kind: 'league',
    headline: `Nowy rozdział w ${club.short}`,
    body: `${manager.name} oficjalnie obejmuje ${club.name}. Media spekulują o stylu gry i pierwszych decyzjach kadrowych przed startem sezonu ${season.year}.`,
    round: 0,
    year: season.year,
  })
  pushNews(state, {
    kind: 'transfer',
    headline: 'Rynek wyczekuje okienka',
    body: 'Transfery jeszcze przed nami — na razie kluby domykają składy treningowe. Śledź wiadomości: plotki wrócą, gdy ruszy prawdziwy ruch kadrowy.',
    round: 0,
    year: season.year,
  })
}
