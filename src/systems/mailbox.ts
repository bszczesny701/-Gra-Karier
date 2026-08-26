import { getClub } from '../data/clubs'
import type { GameState, MailKind, MailMessage } from '../state/types'
import { seasonGoalProgress } from './board'

let mailSeq = 0

export function pushMail(
  state: GameState,
  partial: Omit<MailMessage, 'id' | 'read' | 'createdAt'> & { read?: boolean },
): void {
  if (!state.mailbox) state.mailbox = []
  mailSeq += 1
  const mail: MailMessage = {
    id: `mail-${Date.now()}-${mailSeq}`,
    read: partial.read ?? false,
    createdAt: Date.now(),
    kind: partial.kind,
    from: partial.from,
    subject: partial.subject,
    body: partial.body,
    round: partial.round,
    year: partial.year,
  }
  state.mailbox = [mail, ...state.mailbox].slice(0, 40)
}

export function unreadMailCount(state: GameState): number {
  return (state.mailbox ?? []).filter((m) => !m.read).length
}

export function markMailRead(state: GameState, mailId: string): void {
  const m = (state.mailbox ?? []).find((x) => x.id === mailId)
  if (m) m.read = true
}

export function markAllMailRead(state: GameState): void {
  for (const m of state.mailbox ?? []) m.read = true
}

function matchesWord(n: number): string {
  if (n === 1) return '1 mecz'
  if (n >= 2 && n <= 4) return `${n} mecze`
  return `${n} meczów`
}

/** Maile po meczu: dyscyplina, medycyna, zarząd. */
export function deliverPostMatchMail(state: GameState): void {
  const live = state.liveMatch
  const season = state.season
  const team = state.team
  const manager = state.manager
  if (!live || !season || !team || !manager) return

  const round = Math.max(1, season.roundIndex)
  const year = season.year
  const map = new Map(team.squad.map((p) => [p.id, p]))

  for (const e of live.events) {
    if (e.kind !== 'red' || e.side !== 'you' || !e.playerId) continue
    const p = map.get(e.playerId)
    if (!p) continue
    const games = Math.max(1, p.suspensionMatchesLeft ?? 1)
    pushMail(state, {
      kind: 'discipline',
      from: 'Komisja dyscyplinarna',
      subject: `Zawieszenie: ${p.name}`,
      body: `${p.name} otrzymał czerwoną kartkę. Zawieszenie: ${matchesWord(games)}. Nie wystąpi w ${games === 1 ? 'następnym meczu' : `najbliższych ${matchesWord(games)}`}.`,
      round,
      year,
    })
  }

  for (const e of live.events) {
    if (e.kind !== 'injury' || e.side !== 'you' || !e.playerId) continue
    const p = map.get(e.playerId)
    if (!p) continue
    const games = Math.max(1, p.injuryMatchesLeft ?? 1)
    pushMail(state, {
      kind: 'medical',
      from: 'Sztab medyczny',
      subject: `Kontuzja: ${p.name}`,
      body: `Badania potwierdzają uraz zawodnika ${p.name}. Przewidywana absencja: ${matchesWord(games)}. Prosimy o ostrożne planowanie składu.`,
      round,
      year,
    })
  }

  const club = getClub(season.clubId)
  const { yours, theirs } = (() => {
    const isHome = live.homeId === season.clubId
    return {
      yours: isHome ? live.homeGoals : live.awayGoals,
      theirs: isHome ? live.awayGoals : live.homeGoals,
    }
  })()
  const won = yours > theirs
  const lost = yours < theirs
  const prog = seasonGoalProgress(season)
  const trust = manager.boardTrust ?? 50

  let kind: MailKind = 'board'
  let subject: string
  let body: string

  if (won && prog.onTrack) {
    subject = 'Pozytywna ocena po meczu'
    body = `Szanowny Trenerze,\n\nwynik ${yours}:${theirs} i pozycja w tabeli (${prog.place}.) wyglądają dobrze względem celu „${prog.exp.label}”. Kontynuujcie w tym kierunku.\n\n— Zarząd ${club.name}`
  } else if (won && !prog.onTrack) {
    subject = 'Wygrana, ale cele wciąż odległe'
    body = `Szanowny Trenerze,\n\nwygrana ${yours}:${theirs} cieszy, jednak jesteśmy ${prog.place}. miejscem — poniżej oczekiwań (cel top ${prog.exp.targetPlace}). Potrzebujemy serii wyników, nie pojedynczych błysków.\n\n— Zarząd ${club.name}`
  } else if (lost && !prog.onTrack) {
    subject = 'Niepokój zarządu'
    body = `Szanowny Trenerze,\n\nporażka ${yours}:${theirs} przy ${prog.place}. miejscu budzi poważny niepokój. Cel sezonu: ${prog.exp.label}. Zaufanie wynosi obecnie ${Math.round(trust)}%.\n\n— Zarząd ${club.name}`
  } else if (lost) {
    subject = 'Komentarz po porażce'
    body = `Szanowny Trenerze,\n\nwynik ${yours}:${theirs} jest rozczarowujący, ale wciąż jesteście w strefie akceptowalnej względem celu „${prog.exp.label}”. Oczekujemy szybkiej odpowiedzi boiskowej.\n\n— Zarząd ${club.name}`
  } else {
    subject = 'Ocena remisu'
    body = `Szanowny Trenerze,\n\nremis ${yours}:${theirs}. Aktualnie ${prog.place}. miejsce — ${prog.onTrack ? 'na kursie celu' : 'poniżej oczekiwań'}. Liczymy na trzy punkty w kolejce.\n\n— Zarząd ${club.name}`
  }

  pushMail(state, { kind, from: `Zarząd · ${club.short}`, subject, body, round, year })
}

export function mailKindLabel(kind: MailKind): string {
  if (kind === 'discipline') return 'Dyscyplina'
  if (kind === 'medical') return 'Medycyna'
  if (kind === 'board') return 'Zarząd'
  return 'System'
}
