import { getClub } from '../data/clubs'
import type { GameState, MailKind, MailMessage } from '../state/types'
import type { BoardReviewResult } from './board'
import { SACK_TRUST_THRESHOLD, WARN_TRUST_THRESHOLD } from './board'
import { pushNews } from './news'

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

/** Maile po meczu: dyscyplina, medycyna. */
export function deliverPostMatchMail(state: GameState): void {
  const live = state.liveMatch
  const season = state.season
  const team = state.team
  if (!live || !season || !team) return

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
}

export function deliverBoardReviewMail(state: GameState, review: BoardReviewResult): void {
  const season = state.season
  const manager = state.manager
  if (!season || !manager) return
  const club = getClub(season.clubId)
  const deltaStr = `${review.delta > 0 ? '+' : ''}${review.delta}`
  let subject: string
  let body: string

  if (review.crisis || review.after < SACK_TRUST_THRESHOLD) {
    subject = 'Zarząd rozważa przyszłość'
    body = `Szanowny Trenerze,\n\n${review.summary}\n\nZaufanie: ${Math.round(review.before)}% → ${Math.round(review.after)}% (${deltaStr}). Przy utrzymaniu tego kursu możemy rozważyć zmiany po sezonie.\n\n— Zarząd ${club.name}`
  } else if (review.delta > 0) {
    subject = 'Przegląd zarządu — pozytywnie'
    body = `Szanowny Trenerze,\n\n${review.summary}\n\nZaufanie: ${Math.round(review.before)}% → ${Math.round(review.after)}% (${deltaStr}). Kontynuujcie.\n\n— Zarząd ${club.name}`
  } else if (review.delta < 0 || review.after < WARN_TRUST_THRESHOLD) {
    subject = 'Przegląd zarządu — napięcie'
    body = `Szanowny Trenerze,\n\n${review.summary}\n\nZaufanie: ${Math.round(review.before)}% → ${Math.round(review.after)}% (${deltaStr}). Oczekujemy poprawy wyników względem celu „${review.goalLabel}”.\n\n— Zarząd ${club.name}`
  } else {
    subject = 'Okresowy przegląd zarządu'
    body = `Szanowny Trenerze,\n\n${review.summary}\n\nZaufanie pozostaje na poziomie ${Math.round(review.after)}% (${deltaStr}).\n\n— Zarząd ${club.name}`
  }

  pushMail(state, {
    kind: 'board',
    from: `Zarząd · ${club.short}`,
    subject,
    body,
    round: season.roundIndex,
    year: season.year,
  })

  if (review.crisis) {
    pushNews(state, {
      kind: 'club',
      headline: `Kryzys w ${club.short}`,
      body: `${review.summary} Kibice i media komentują serię porażek.`,
      round: season.roundIndex,
      year: season.year,
    })
    if (manager.fanTrust != null) {
      manager.fanTrust = Math.max(0, Math.min(100, manager.fanTrust - 4))
    }
  } else if (review.delta <= -8) {
    pushNews(state, {
      kind: 'press',
      headline: `Napięcie wokół ${manager.name}`,
      body: review.summary,
      round: season.roundIndex,
      year: season.year,
    })
  }
}

export function mailKindLabel(kind: MailKind): string {
  if (kind === 'discipline') return 'Dyscyplina'
  if (kind === 'medical') return 'Medycyna'
  if (kind === 'board') return 'Zarząd'
  if (kind === 'press') return 'Media'
  if (kind === 'job') return 'Oferta'
  return 'System'
}
