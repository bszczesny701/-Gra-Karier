import type { GameState, PressSession, PressTone } from '../state/types'
import { clamp } from '../state/types'
import { applyBoardTrust } from './board'
import { pushMail } from './mailbox'
import { pushNews } from './news'
import { pushLog } from '../state/gameState'
import { normalizeSquadPlayer } from './squadGen'
import { applyFanTrustToChemistry, recomputeTeamChemistry } from './chemistry'

const TONES: Array<{ id: PressTone; label: string }> = [
  { id: 'aggressive', label: 'Agresywnie' },
  { id: 'calm', label: 'Spokojnie' },
  { id: 'diplomatic', label: 'Dyplomatycznie' },
]

function q(id: string, text: string) {
  return { id, text, answers: TONES }
}

export function buildPressSession(state: GameState): PressSession | null {
  const last = state.season?.lastMatch
  if (!last) return null
  const context: PressSession['context'] = last.won ? 'win' : last.drawn ? 'draw' : 'loss'
  const questions =
    context === 'win'
      ? [
          q('w1', 'Jak oceniasz dzisiejsze zwycięstwo?'),
          q('w2', 'Czy to przełom w sezonie, czy za wcześnie na takie słowa?'),
        ]
      : context === 'draw'
        ? [
            q('d1', 'Remis — punkt zysku czy dwa stracone?'),
            q('d2', 'Kibice oczekują więcej. Co im powiesz?'),
          ]
        : [
            q('l1', 'Porażka boli. Gdzie leży przyczyna?'),
            q('l2', 'Czy zarząd powinien się martwić o Twoją pozycję?'),
          ]
  return { questions, index: 0, answered: [], context }
}

export function ensureFanTrust(state: GameState): void {
  const m = state.manager
  if (!m) return
  if (m.fanTrust == null) {
    m.fanTrust = clamp(m.boardTrust + (Math.floor(Math.random() * 11) - 5), 20, 85)
  }
}

export function answerPressQuestion(state: GameState, tone: PressTone): void {
  const press = state.pendingPress
  const m = state.manager
  const team = state.team
  if (!press || !m || !team) return
  ensureFanTrust(state)

  const question = press.questions[press.index]
  if (!question) return
  press.answered.push({ questionId: question.id, tone })

  let boardDelta = 0
  let fanDelta = 0
  let moraleDelta = 0
  if (press.context === 'win') {
    if (tone === 'aggressive') {
      fanDelta = 4
      boardDelta = 1
      moraleDelta = 2
    } else if (tone === 'calm') {
      fanDelta = 2
      boardDelta = 2
    } else {
      fanDelta = 1
      boardDelta = 1
    }
  } else if (press.context === 'draw') {
    if (tone === 'aggressive') {
      fanDelta = -1
      boardDelta = -1
      moraleDelta = 1
    } else if (tone === 'calm') {
      fanDelta = 1
      boardDelta = 1
    } else {
      fanDelta = 2
      boardDelta = 0
    }
  } else {
    if (tone === 'aggressive') {
      fanDelta = -3
      boardDelta = -2
      moraleDelta = -1
    } else if (tone === 'calm') {
      fanDelta = -1
      boardDelta = 0
      moraleDelta = 1
    } else {
      fanDelta = 1
      boardDelta = 1
      moraleDelta = 0
    }
  }

  m.boardTrust = applyBoardTrust(m.boardTrust, boardDelta)
  m.fanTrust = clamp(m.fanTrust + fanDelta, 0, 100)
  for (const p of team.squad) {
    if (team.startingIds.includes(p.id) || p.overall >= 72) {
      normalizeSquadPlayer(p)
      p.morale = clamp(p.morale + moraleDelta, 20, 100)
    }
  }
  recomputeTeamChemistry(team)
  applyFanTrustToChemistry(team, m.fanTrust)

  press.index += 1
  if (press.index >= press.questions.length) {
    finishPressConference(state)
  }
}

function finishPressConference(state: GameState): void {
  const press = state.pendingPress
  const m = state.manager
  if (!press || !m) {
    state.pendingPress = null
    state.screen = 'hub'
    return
  }
  const tones = press.answered.map((a) => a.tone).join(', ')
  pushMail(state, {
    kind: 'press',
    from: 'Biuro prasowe',
    subject: 'Konferencja po meczu',
    body: `Odpowiedzi trenera (${press.context}): ${tones}.\nZaufanie kibiców: ${m.fanTrust}% · zarząd: ${m.boardTrust}%.`,
    round: state.season?.roundIndex,
    year: state.season?.year,
  })
  pushNews(state, {
    kind: 'press',
    headline: 'Trener przed mikrofonami',
    body: `Po meczu ${m.name} odpowiedział na pytania mediów (${press.context === 'win' ? 'po wygranej' : press.context === 'draw' ? 'po remisie' : 'po porażce'}).`,
    round: state.season?.roundIndex,
    year: state.season?.year,
  })
  pushLog(state, `Konferencja prasowa · kibice ${m.fanTrust}%`)
  state.pendingPress = null
  state.screen = 'hub'
}

/** Wywołaj po dismiss wyniku — jeśli jest sesja, przejdź na press. */
export function maybeOpenPressAfterResult(state: GameState): boolean {
  if (state.pendingPress && state.pendingPress.index < state.pendingPress.questions.length) {
    state.screen = 'pressConference'
    return true
  }
  return false
}
