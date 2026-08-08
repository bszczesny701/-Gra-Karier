import {
  SAVE_KEY,
  SAVE_VERSION,
  createEmptyState,
  type GameState,
} from './types'

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return createEmptyState()
    const parsed = JSON.parse(raw) as GameState
    if (!parsed || parsed.version !== SAVE_VERSION) return createEmptyState()
    return parsed
  } catch {
    return createEmptyState()
  }
}

export function saveState(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state))
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}

export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as GameState
    return Boolean(parsed?.player && (parsed?.season || parsed?.screen === 'startOffers'))
  } catch {
    return false
  }
}

export function pushLog(state: GameState, message: string): void {
  state.log = [message, ...state.log].slice(0, 40)
}
