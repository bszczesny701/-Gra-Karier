import {
  SAVE_ACTIVE_SLOT_KEY,
  SAVE_KEY,
  SAVE_SLOT_COUNT,
  SAVE_SLOTS_META_KEY,
  SAVE_VERSION,
  createEmptyState,
  type GameState,
} from './types'

export interface SaveSlotInfo {
  index: number
  occupied: boolean
  label: string
  updatedAt: number | null
  managerName: string | null
  clubShort: string | null
  year: number | null
}

function slotStorageKey(index: number): string {
  return `${SAVE_KEY}-slot-${index}`
}

export function getActiveSlot(): number {
  try {
    const raw = localStorage.getItem(SAVE_ACTIVE_SLOT_KEY)
    const n = raw != null ? Number(raw) : 0
    if (Number.isInteger(n) && n >= 0 && n < SAVE_SLOT_COUNT) return n
  } catch {
    /* ignore */
  }
  return 0
}

export function setActiveSlot(index: number): void {
  const n = Math.max(0, Math.min(SAVE_SLOT_COUNT - 1, Math.floor(index)))
  localStorage.setItem(SAVE_ACTIVE_SLOT_KEY, String(n))
}

function readMeta(): SaveSlotInfo[] {
  try {
    const raw = localStorage.getItem(SAVE_SLOTS_META_KEY)
    if (!raw) return defaultMeta()
    const parsed = JSON.parse(raw) as SaveSlotInfo[]
    if (!Array.isArray(parsed) || parsed.length !== SAVE_SLOT_COUNT) return defaultMeta()
    return parsed
  } catch {
    return defaultMeta()
  }
}

function defaultMeta(): SaveSlotInfo[] {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => ({
    index,
    occupied: false,
    label: `Slot ${index + 1}`,
    updatedAt: null,
    managerName: null,
    clubShort: null,
    year: null,
  }))
}

function writeMeta(meta: SaveSlotInfo[]): void {
  localStorage.setItem(SAVE_SLOTS_META_KEY, JSON.stringify(meta))
}

function metaFromState(state: GameState, index: number): SaveSlotInfo {
  return {
    index,
    occupied: Boolean(state.manager && state.team),
    label: `Slot ${index + 1}`,
    updatedAt: Date.now(),
    managerName: state.manager?.name ?? null,
    clubShort: state.manager?.clubId ?? null,
    year: state.season?.year ?? null,
  }
}

export function listSaveSlots(): SaveSlotInfo[] {
  migrateLegacyIfNeeded()
  const meta = readMeta()
  return meta.map((m, i) => {
    const raw = localStorage.getItem(slotStorageKey(i))
    const occupied = Boolean(raw)
    if (!occupied) {
      return {
        index: i,
        occupied: false,
        label: `Slot ${i + 1}`,
        updatedAt: null,
        managerName: null,
        clubShort: null,
        year: null,
      }
    }
    return { ...m, occupied: true, index: i }
  })
}

/** Migrate old single-key save into slot 0 if needed. */
function migrateLegacyIfNeeded(): void {
  const slot0 = localStorage.getItem(slotStorageKey(0))
  const legacy = localStorage.getItem(SAVE_KEY)
  if (!slot0 && legacy) {
    localStorage.setItem(slotStorageKey(0), legacy)
    try {
      const parsed = JSON.parse(legacy) as GameState
      const meta = readMeta()
      meta[0] = {
        index: 0,
        occupied: Boolean(parsed.manager && parsed.team),
        label: 'Slot 1',
        updatedAt: Date.now(),
        managerName: parsed.manager?.name ?? null,
        clubShort: parsed.manager?.clubId ?? null,
        year: parsed.season?.year ?? null,
      }
      writeMeta(meta)
    } catch {
      /* ignore */
    }
  }
}

export function loadState(): GameState {
  migrateLegacyIfNeeded()
  const slot = getActiveSlot()
  try {
    const raw = localStorage.getItem(slotStorageKey(slot)) ?? (slot === 0 ? localStorage.getItem(SAVE_KEY) : null)
    if (!raw) return createEmptyState()
    const parsed = JSON.parse(raw) as GameState
    if (!parsed || parsed.version !== SAVE_VERSION) return createEmptyState()
    if (!parsed.season) return parsed
    if (parsed.season.europa === undefined) parsed.season.europa = null
    return parsed
  } catch {
    return createEmptyState()
  }
}

export function saveState(state: GameState): void {
  const slot = getActiveSlot()
  const raw = JSON.stringify(state)
  localStorage.setItem(slotStorageKey(slot), raw)
  // Keep legacy key in sync for slot 0 (older builds)
  if (slot === 0) localStorage.setItem(SAVE_KEY, raw)
  const meta = readMeta()
  meta[slot] = metaFromState(state, slot)
  writeMeta(meta)
}

export function clearSave(): void {
  const slot = getActiveSlot()
  localStorage.removeItem(slotStorageKey(slot))
  if (slot === 0) localStorage.removeItem(SAVE_KEY)
  const meta = readMeta()
  meta[slot] = {
    index: slot,
    occupied: false,
    label: `Slot ${slot + 1}`,
    updatedAt: null,
    managerName: null,
    clubShort: null,
    year: null,
  }
  writeMeta(meta)
}

export function clearSlot(index: number): void {
  const n = Math.max(0, Math.min(SAVE_SLOT_COUNT - 1, index))
  localStorage.removeItem(slotStorageKey(n))
  if (n === 0) localStorage.removeItem(SAVE_KEY)
  const meta = readMeta()
  meta[n] = {
    index: n,
    occupied: false,
    label: `Slot ${n + 1}`,
    updatedAt: null,
    managerName: null,
    clubShort: null,
    year: null,
  }
  writeMeta(meta)
}

export function hasSave(): boolean {
  migrateLegacyIfNeeded()
  const slot = getActiveSlot()
  try {
    const raw = localStorage.getItem(slotStorageKey(slot)) ?? (slot === 0 ? localStorage.getItem(SAVE_KEY) : null)
    if (!raw) return false
    const parsed = JSON.parse(raw) as GameState
    return Boolean(parsed?.manager && parsed?.team && parsed?.version === SAVE_VERSION)
  } catch {
    return false
  }
}

export function switchToSlot(index: number): GameState {
  setActiveSlot(index)
  return loadState()
}

export function pushLog(state: GameState, message: string): void {
  state.log = [message, ...state.log].slice(0, 40)
}
