/**
 * Dev-only render-side instrumentation for the integration suite.
 *
 * Every export in this file is gated on `import.meta.env.DEV`. Vite's
 * dev server replaces that constant with `true` so the integration
 * probes can read instrumentation off `window.__drillerRender`. The
 * tsup library build (`tsup.config.ts`) replaces it with `false`, and
 * esbuild dead-code-eliminates the bodies — verified by inspecting
 * `dist/index.js` for the absence of `__drillerRender` and friends.
 *
 * Net effect:
 *   - dev (vitexec, `pnpm dev:app`): instrumentation active.
 *   - tsup build (consumed by docs / examples): zero overhead, zero
 *     bytes shipped, no global pollution.
 *
 * Probes only call into this module via the renderer's hooks; they
 * MUST also gate their own access on `window.__drillerRender` being
 * present rather than assume it.
 */

import { FLAG_SHAKING } from '../traits'

interface DebugRenderState {
  shakeFramesGrid: Uint32Array
  shakeFramesRendered: Uint32Array
  lastRenderedFrame: Int32Array
  frameCounter: number
  windowTopRow: number
  windowBottomRow: number
}

declare global {
  interface Window {
    __drillerRender?: DebugRenderState
  }
}

/**
 * Allocate or reuse the shared DebugRenderState. Returns `undefined`
 * in production, so the renderer can `if (state)` guard every access
 * — and esbuild folds the whole branch away because the only call
 * site lives behind `import.meta.env.DEV`.
 */
export function ensureDebugRenderState(tilesLength: number): DebugRenderState | undefined {
  if (!import.meta.env.DEV) return undefined
  if (typeof window === 'undefined') return undefined
  let state = window.__drillerRender
  if (!state) {
    state = {
      shakeFramesGrid: new Uint32Array(tilesLength),
      shakeFramesRendered: new Uint32Array(tilesLength),
      lastRenderedFrame: new Int32Array(tilesLength).fill(-1),
      frameCounter: 0,
      windowTopRow: 0,
      windowBottomRow: 0,
    }
    window.__drillerRender = state
  } else if (state.shakeFramesGrid.length !== tilesLength) {
    // Grid grew — chunk streamed in. Carry forward existing counters
    // (cells that grew never had a stored value, default 0 anyway).
    const oldLen = state.shakeFramesGrid.length
    const carry = Math.min(oldLen, tilesLength)
    const grew = (typed: Uint32Array | Int32Array, fill: number) => {
      const next =
        typed instanceof Uint32Array
          ? new Uint32Array(tilesLength)
          : new Int32Array(tilesLength).fill(fill)
      next.set(typed.subarray(0, carry))
      return next
    }
    state.shakeFramesGrid = grew(state.shakeFramesGrid, 0) as Uint32Array
    state.shakeFramesRendered = grew(state.shakeFramesRendered, 0) as Uint32Array
    state.lastRenderedFrame = grew(state.lastRenderedFrame, -1) as Int32Array
  }
  return state
}

/**
 * Per-frame setup: bump the frame counter, store the visible window,
 * and walk the entire grid for grid-side shake tally so the probe
 * can correlate even cells outside the render window.
 */
export function tickDebugRenderFrame(
  state: DebugRenderState,
  flags: Uint8Array,
  topRow: number,
  bottomRow: number,
): void {
  if (!import.meta.env.DEV) return
  state.frameCounter++
  state.windowTopRow = topRow
  state.windowBottomRow = bottomRow
  for (let i = 0; i < flags.length; i++) {
    if ((flags[i]! & FLAG_SHAKING) !== 0) {
      state.shakeFramesGrid[i] = (state.shakeFramesGrid[i] ?? 0) + 1
    }
  }
}

/**
 * Per-cell record: this idx had a sprite drawn (visible) this frame.
 * If shaking with non-zero jitter, also bump the rendered counter.
 */
export function recordCellRender(
  state: DebugRenderState,
  idx: number,
  shaking: boolean,
  jitterNonZero: boolean,
): void {
  if (!import.meta.env.DEV) return
  state.lastRenderedFrame[idx] = state.frameCounter
  if (shaking && jitterNonZero) {
    state.shakeFramesRendered[idx] = (state.shakeFramesRendered[idx] ?? 0) + 1
  }
}
