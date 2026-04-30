import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import type { Rect } from '@three-flatland/preview'

// Matches the local Animation type in App.tsx — kept in sync here so
// A2 can import it from the store instead of redeclaring it.
export type Animation = {
  /** Frame names in playback order. Duplicates encode hold counts. */
  frames: string[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

export type AtlasStoreState = {
  // Primary user-edit state. These ARE the document's content.
  rects: Rect[]
  animations: Record<string, Animation>

  // Actions — accept value or functional updater, mirroring React's
  // useState API so existing call sites in App.tsx port over with
  // minimal change.
  setRects: (next: Rect[] | ((prev: Rect[]) => Rect[])) => void
  setAnimations: (
    next:
      | Record<string, Animation>
      | ((prev: Record<string, Animation>) => Record<string, Animation>),
  ) => void

  // Atomic updater for both rects and animations in one set() call.
  // Use this instead of calling setRects + setAnimations separately to
  // ensure zundo records a single history entry for the combined edit.
  applyMulti: (
    rectsUpdater: Rect[] | ((prev: Rect[]) => Rect[]),
    animsUpdater:
      | Record<string, Animation>
      | ((prev: Record<string, Animation>) => Record<string, Animation>),
  ) => void

  // Initial-load helper — replace both at once. Used during the
  // atlas/init bridge handshake. Doesn't push history (we don't want
  // file-load to be undoable; the user can't have done anything yet).
  loadFromInit: (rects: Rect[], animations: Record<string, Animation>) => void
}

// Partialised shape tracked by zundo — actions are excluded automatically.
type HistorySlice = {
  rects: AtlasStoreState['rects']
  animations: AtlasStoreState['animations']
}

export const useAtlasStore = create<AtlasStoreState>()(
  temporal(
    (set) => ({
      rects: [],
      animations: {},

      setRects: (next) =>
        set((s) => ({
          ...s,
          rects: typeof next === 'function' ? next(s.rects) : next,
        })),

      setAnimations: (next) =>
        set((s) => ({
          ...s,
          animations: typeof next === 'function' ? next(s.animations) : next,
        })),

      applyMulti: (rectsUpdater, animsUpdater) =>
        set((s) => ({
          ...s,
          rects: typeof rectsUpdater === 'function' ? rectsUpdater(s.rects) : rectsUpdater,
          animations:
            typeof animsUpdater === 'function' ? animsUpdater(s.animations) : animsUpdater,
        })),

      loadFromInit: (rects, animations) => {
        // Replace state AND clear history — file load should not be undoable.
        useAtlasStore.setState({ rects, animations })
        useAtlasStore.temporal.getState().clear()
      },
    }),
    {
      // Track only the document's content — action functions slot
      // themselves out automatically via partialize.
      partialize: (s): HistorySlice => ({
        rects: s.rects,
        animations: s.animations,
      }),
      limit: 100,
      // Don't push a history entry when only the action identities change
      // (only structural changes to rects or animations matter).
      equality: (a, b) => a.rects === b.rects && a.animations === b.animations,
    },
  ),
)

// ── Convenience hooks ────────────────────────────────────────────────────────

export function useAtlasRects(): Rect[] {
  return useStore(useAtlasStore, (s) => s.rects)
}

export function useAtlasAnimations(): Record<string, Animation> {
  return useStore(useAtlasStore, (s) => s.animations)
}

// ── Direct action accessors (for non-React call sites) ───────────────────────

export const atlasActions = {
  setRects: (next: Rect[] | ((prev: Rect[]) => Rect[])) =>
    useAtlasStore.getState().setRects(next),
  setAnimations: (
    next:
      | Record<string, Animation>
      | ((prev: Record<string, Animation>) => Record<string, Animation>),
  ) => useAtlasStore.getState().setAnimations(next),
  applyMulti: (
    rectsUpdater: Rect[] | ((prev: Rect[]) => Rect[]),
    animsUpdater:
      | Record<string, Animation>
      | ((prev: Record<string, Animation>) => Record<string, Animation>),
  ) => useAtlasStore.getState().applyMulti(rectsUpdater, animsUpdater),
  loadFromInit: (rects: Rect[], animations: Record<string, Animation>) =>
    useAtlasStore.getState().loadFromInit(rects, animations),
}

// ── Undo/redo helpers ────────────────────────────────────────────────────────

export const atlasHistory = {
  undo: () => useAtlasStore.temporal.getState().undo(),
  redo: () => useAtlasStore.temporal.getState().redo(),
  canUndo: () => useAtlasStore.temporal.getState().pastStates.length > 0,
  canRedo: () => useAtlasStore.temporal.getState().futureStates.length > 0,
  clear: () => useAtlasStore.temporal.getState().clear(),
}

export function useAtlasHistoryStore(): TemporalState<HistorySlice> {
  return useStore(useAtlasStore.temporal)
}
