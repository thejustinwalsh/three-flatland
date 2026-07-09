import { useState } from 'react'
import { localStorageStorage } from '../state/localStorage'

const STORAGE_KEY = 'fl-zzfx-sidebar-px'
export const SIDEBAR_MIN_PX = 260
export const SIDEBAR_MAX_PX = 460
const SIDEBAR_DEFAULT_PX = 320

function clamp(px: number): number {
  return Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, px))
}

function readInitial(): number {
  const raw = localStorageStorage.getItem(STORAGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? clamp(n) : SIDEBAR_DEFAULT_PX
}

/**
 * Cross-session width for the Category/Style/AI-Generate side panel —
 * `localStorageStorage` directly (the same adapter atlas/merge hand to
 * Zustand's `persist`), not a full Zustand store: zzfx has no undo/redo
 * and no other cross-session state, so one persisted number doesn't
 * earn the store+persist+temporal middleware stack the sibling tools
 * use for their splitter widths.
 */
export function useSidebarWidth(): [number, (next: number) => void] {
  const [px, setPx] = useState(readInitial)
  const set = (next: number) => {
    const clamped = clamp(next)
    setPx(clamped)
    localStorageStorage.setItem(STORAGE_KEY, String(clamped))
  }
  return [px, set]
}
