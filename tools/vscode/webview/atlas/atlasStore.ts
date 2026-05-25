import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Rect } from '@three-flatland/preview'
import { localStorageStorage, webviewStorage } from '../state'

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

// Active editing tool — kept in sync with the local Tool type in App.tsx.
export type Tool = 'select' | 'rect' | 'move'

export type AtlasStoreState = {
  // Primary user-edit state. These ARE the document's content.
  rects: Rect[]
  animations: Record<string, Animation>

  // Session UI state — persisted via webviewStorage (tab focus loss),
  // reset on panel close.
  selectedIds: Set<string>
  tool: Tool
  activeAnimation: string | null
  // Cross-session UI prefs — persisted via localStorage.
  framesPx: number

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

  setSelectedIds: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  setTool: (next: Tool) => void
  setActiveAnimation: (next: string | null | ((prev: string | null) => string | null)) => void
  setFramesPx: (px: number) => void
}

// Partialised shape tracked by zundo — actions are excluded automatically.
type HistorySlice = {
  rects: AtlasStoreState['rects']
  animations: AtlasStoreState['animations']
}

// Shallow content equality for the partialized history slice. Reference
// checks alone produce spurious entries because every setter returns
// fresh arrays/objects even when content is identical (e.g. dropping a
// rect at its original geometry, blurring a rename without editing).
function rectsEqual(a: Rect[], b: Rect[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ra = a[i]!
    const rb = b[i]!
    if (
      ra.id !== rb.id ||
      ra.x !== rb.x ||
      ra.y !== rb.y ||
      ra.w !== rb.w ||
      ra.h !== rb.h ||
      ra.name !== rb.name
    ) {
      return false
    }
  }
  return true
}

function animationsEqual(
  a: Record<string, Animation>,
  b: Record<string, Animation>,
): boolean {
  if (a === b) return true
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  for (const key of ak) {
    const aa = a[key]
    const ba = b[key]
    if (!aa || !ba) return false
    if (aa.fps !== ba.fps || aa.loop !== ba.loop || aa.pingPong !== ba.pingPong) return false
    if (aa.frames.length !== ba.frames.length) return false
    for (let i = 0; i < aa.frames.length; i++) {
      if (aa.frames[i] !== ba.frames[i]) return false
    }
    const ae = aa.events ?? {}
    const be = ba.events ?? {}
    const aek = Object.keys(ae)
    if (aek.length !== Object.keys(be).length) return false
    for (const ek of aek) if (ae[ek] !== be[ek]) return false
  }
  return true
}

export const useAtlasStore = create<AtlasStoreState>()(
  temporal(
    // Outer persist: localStorage — cross-session prefs
    persist(
      // Inner persist: webviewStorage — session state (survives tab focus loss)
      persist(
        (set) => ({
          rects: [],
          animations: {},
          selectedIds: new Set<string>(),
          tool: 'rect' as Tool,
          activeAnimation: null,
          framesPx: 280,

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
            // Also reset session-scoped state that won't make sense against a
            // new sidecar: selection refers to old rect ids, and a persisted
            // activeAnimation name from a previous session would point at an
            // animation that doesn't exist in the new file (silent no-op when
            // the user later tries to interact with it).
            const current = useAtlasStore.getState()
            const validActive =
              current.activeAnimation && animations[current.activeAnimation]
                ? current.activeAnimation
                : null
            useAtlasStore.setState({
              rects,
              animations,
              activeAnimation: validActive,
              selectedIds: new Set<string>(),
            })
            useAtlasStore.temporal.getState().clear()
          },

          setSelectedIds: (next) =>
            set((s) => ({
              ...s,
              selectedIds: typeof next === 'function' ? next(s.selectedIds) : next,
            })),

          setTool: (next) =>
            set((s) => ({ ...s, tool: next })),

          setActiveAnimation: (next) =>
            set((s) => ({
              ...s,
              activeAnimation: typeof next === 'function' ? next(s.activeAnimation) : next,
            })),

          setFramesPx: (px) =>
            set((s) => ({ ...s, framesPx: px })),
        }),
        {
          // Session state: survives tab focus loss + dev reload, lost on panel close.
          name: 'fl-atlas-session',
          storage: createJSONStorage(() => webviewStorage),
          partialize: (s) => ({
            rects: s.rects,
            animations: s.animations,
            selectedIds: Array.from(s.selectedIds),
            tool: s.tool,
            activeAnimation: s.activeAnimation,
          }),
          // selectedIds is serialized as an array; restore to Set on rehydrate.
          merge: (persisted, current) => {
            const p = persisted as {
              rects?: Rect[]
              animations?: Record<string, Animation>
              selectedIds?: string[]
              tool?: Tool
              activeAnimation?: string | null
            }
            return {
              ...current,
              ...(p.rects !== undefined ? { rects: p.rects } : {}),
              ...(p.animations !== undefined ? { animations: p.animations } : {}),
              selectedIds: new Set<string>(p.selectedIds ?? []),
              ...(p.tool !== undefined ? { tool: p.tool } : {}),
              ...(p.activeAnimation !== undefined ? { activeAnimation: p.activeAnimation } : {}),
            }
          },
        },
      ),
      {
        // Cross-session prefs: survive panel close + VSCode restart.
        name: 'fl-atlas-prefs',
        storage: createJSONStorage(() => localStorageStorage),
        partialize: (s) => ({
          framesPx: s.framesPx,
        }),
      },
    ),
    {
      // Track only the document's content — action functions slot
      // themselves out automatically via partialize.
      partialize: (s): HistorySlice => ({
        rects: s.rects,
        animations: s.animations,
      }),
      limit: 100,
      // Shallow content equality. Reference equality alone would push
      // entries whenever a setter returns fresh references with
      // identical content (e.g. dropping a rect at its original
      // geometry, blurring a rename input unchanged).
      equality: (a, b) => rectsEqual(a.rects, b.rects) && animationsEqual(a.animations, b.animations),
      // Coalesce burst sets (drag, hot-key repeats) into one undo entry.
      // 100 ms is below human undo-reaction latency.
      handleSet: (handleSet) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        return (pastState) => {
          if (timer !== null) clearTimeout(timer)
          timer = setTimeout(() => {
            handleSet(pastState)
            timer = null
          }, 100)
        }
      },
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

export function useAtlasSelectedIds(): Set<string> {
  return useStore(useAtlasStore, (s) => s.selectedIds)
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
  setSelectedIds: (next: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    useAtlasStore.getState().setSelectedIds(next),
  setTool: (next: Tool) =>
    useAtlasStore.getState().setTool(next),
  setActiveAnimation: (next: string | null | ((prev: string | null) => string | null)) =>
    useAtlasStore.getState().setActiveAnimation(next),
  setFramesPx: (px: number) =>
    useAtlasStore.getState().setFramesPx(px),
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
