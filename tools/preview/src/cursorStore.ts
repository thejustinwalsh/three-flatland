import { useSyncExternalStore } from 'react'

export type CursorReading = {
  /** Image-pixel coordinates, top-left origin. */
  x: number
  y: number
  /** Sampled RGBA at (x, y), each component 0-255. Null if no ImageData. */
  rgba: [number, number, number, number] | null
}

export type CursorStore = {
  get(): CursorReading | null
  set(reading: CursorReading | null): void
  /**
   * Freeze the snapshot — `set()` becomes a no-op until `unfreeze()`.
   * Used while dragging grid lines so the InfoPanel locks at the
   * pre-drag reading instead of jittering with line motion.
   */
  freeze(): void
  unfreeze(): void
  subscribe(fn: () => void): () => void
}

/**
 * Ref-backed cursor store. Pointer-move handlers call `set()` at high
 * frequency; only subscribers (e.g. `<InfoPanel>`) re-render. Heavy
 * overlays like `<RectOverlay>` never see cursor changes — they would
 * tank framerate at zoom if re-rendered every move.
 *
 * Mirrors the React `useSyncExternalStore` contract: `subscribe` returns
 * an unsubscribe function; `get` returns the current snapshot.
 */
export function createCursorStore(): CursorStore {
  let snapshot: CursorReading | null = null
  let frozen = false
  const listeners = new Set<() => void>()
  return {
    get: () => snapshot,
    set: (next) => {
      if (frozen) return
      // Identity check is enough — set() is called from a single pointer
      // handler, and we replace the whole object every move. Equality
      // comparison would just be more allocations.
      if (snapshot === next) return
      snapshot = next
      for (const l of listeners) l()
    },
    freeze: () => {
      frozen = true
    },
    unfreeze: () => {
      frozen = false
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export function useCursor(store: CursorStore | null): CursorReading | null {
  return useSyncExternalStore(
    (fn) => (store ? store.subscribe(fn) : () => {}),
    () => (store ? store.get() : null),
    () => null,
  )
}
