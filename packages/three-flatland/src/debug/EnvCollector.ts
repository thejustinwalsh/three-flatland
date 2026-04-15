import { REVISION } from 'three'
import type {
  EnvBackendDelta,
  EnvCanvasDelta,
  EnvPayload,
} from '../debug-protocol'
import { VERSION as THREE_FLATLAND_VERSION } from '../index'

/**
 * Subset of `WebGPURenderer` we inspect. Fields are all optional /
 * unknown so three's concrete `Backend` type is still assignable — we
 * narrow defensively at runtime.
 */
interface RendererLike {
  backend?: unknown
  getSize?(target: { x: number; y: number }): unknown
  getPixelRatio?(): number
}

/**
 * Previous-snapshot shape. Holds full (non-delta) values we last
 * emitted, so `fillEnv` can diff current-vs-prev and decide what goes
 * into the output payload.
 */
interface EnvSnapshot {
  threeFlatlandVersion?: string
  threeRevision?: string
  backend: {
    name?: string | null
    trackTimestamp?: boolean
    disjoint?: boolean | null
    gpuModeEnabled?: boolean
  }
  canvas: {
    width?: number
    height?: number
    pixelRatio?: number
  }
}

/**
 * Runtime environment collector for the `env` feature.
 *
 * Two modes:
 *
 * - **`snapshot(renderer)`** — full env snapshot, used on `subscribe:ack`
 *   so a fresh consumer gets bootstrap capability info without having
 *   to subscribe to env just to find out whether (e.g.) GPU timing is
 *   available.
 *
 * - **`fillEnv(out, renderer)`** — delta-encoded payload written into
 *   a caller-owned scratch. Returns `true` if anything differed from
 *   the last emit. Fields absent = no change; `null` = clear (rare for
 *   env — values don't usually *disappear*, just change).
 *
 * Almost every env field is static (versions fixed at build time,
 * renderer backend fixed at construction); only canvas `width`,
 * `height`, `pixelRatio` change at runtime. So `fillEnv` is cheap — it
 * usually returns `false` once the first snapshot has been emitted.
 *
 * `resetDelta()` clears `_prev` so the next `fillEnv` emits a full
 * snapshot (re-subscribe path).
 */
export class EnvCollector {
  private _prev: EnvSnapshot = { backend: {}, canvas: {} }
  private _sizeScratch = { x: 0, y: 0 }

  /**
   * Build a full env snapshot. Used for bootstrap info in the
   * `subscribe:ack` message so consumers see capabilities immediately.
   * Does NOT update the delta tracker — callers that want to count
   * this as the baseline should call `resetDelta()` first and then
   * `fillEnv(out)` on the next tick to synchronise.
   */
  snapshot(renderer: RendererLike | undefined): EnvPayload {
    const out: EnvPayload = {}
    out.threeFlatlandVersion = THREE_FLATLAND_VERSION
    out.threeRevision = REVISION

    if (renderer?.backend) {
      const b = renderer.backend as {
        trackTimestamp?: boolean
        constructor?: { name?: string }
        disjoint?: unknown
      }
      const name = b.constructor?.name ?? null
      const trackTimestamp = b.trackTimestamp === true
      const isWebGL = name === 'WebGLBackend'
      const disjoint = isWebGL ? b.disjoint != null : null
      const gpuModeEnabled = trackTimestamp && (!isWebGL || disjoint === true)
      const backend: EnvBackendDelta = { name, trackTimestamp, disjoint, gpuModeEnabled }
      out.backend = backend
    }

    if (renderer?.getSize) {
      renderer.getSize(this._sizeScratch)
      const canvas: EnvCanvasDelta = {
        width: this._sizeScratch.x,
        height: this._sizeScratch.y,
        pixelRatio: renderer.getPixelRatio?.() ?? 1,
      }
      out.canvas = canvas
    }

    return out
  }

  /**
   * Write delta-encoded env updates into `out`. Returns `true` if any
   * field changed since the last emit.
   *
   * `out` must be an EnvPayload the caller owns (typically a scratch).
   * All fields should be `undefined` on entry; `fillEnv` leaves
   * unchanged fields as `undefined` (meaning "no change" on the wire)
   * and sets changed fields to their new value or `null`.
   */
  fillEnv(out: EnvPayload, renderer: RendererLike | undefined): boolean {
    const prev = this._prev
    let changed = false

    if (prev.threeFlatlandVersion !== THREE_FLATLAND_VERSION) {
      out.threeFlatlandVersion = THREE_FLATLAND_VERSION
      prev.threeFlatlandVersion = THREE_FLATLAND_VERSION
      changed = true
    }
    if (prev.threeRevision !== REVISION) {
      out.threeRevision = REVISION
      prev.threeRevision = REVISION
      changed = true
    }

    // Backend (effectively static once renderer is created).
    if (renderer?.backend) {
      const b = renderer.backend as {
        trackTimestamp?: boolean
        constructor?: { name?: string }
        disjoint?: unknown
      }
      const name = b.constructor?.name ?? null
      const trackTimestamp = b.trackTimestamp === true
      const isWebGL = name === 'WebGLBackend'
      const disjoint = isWebGL ? b.disjoint != null : null
      const gpuModeEnabled = trackTimestamp && (!isWebGL || disjoint === true)

      const backendDelta: EnvBackendDelta = {}
      let backendChanged = false
      if (prev.backend.name !== name) {
        backendDelta.name = name
        prev.backend.name = name
        backendChanged = true
      }
      if (prev.backend.trackTimestamp !== trackTimestamp) {
        backendDelta.trackTimestamp = trackTimestamp
        prev.backend.trackTimestamp = trackTimestamp
        backendChanged = true
      }
      if (prev.backend.disjoint !== disjoint) {
        backendDelta.disjoint = disjoint
        prev.backend.disjoint = disjoint
        backendChanged = true
      }
      if (prev.backend.gpuModeEnabled !== gpuModeEnabled) {
        backendDelta.gpuModeEnabled = gpuModeEnabled
        prev.backend.gpuModeEnabled = gpuModeEnabled
        backendChanged = true
      }
      if (backendChanged) {
        out.backend = backendDelta
        changed = true
      }
    }

    // Canvas (runtime-variable on resize / DPI change).
    if (renderer?.getSize) {
      renderer.getSize(this._sizeScratch)
      const width = this._sizeScratch.x
      const height = this._sizeScratch.y
      const pixelRatio = renderer.getPixelRatio?.() ?? 1

      const canvasDelta: EnvCanvasDelta = {}
      let canvasChanged = false
      if (prev.canvas.width !== width) {
        canvasDelta.width = width
        prev.canvas.width = width
        canvasChanged = true
      }
      if (prev.canvas.height !== height) {
        canvasDelta.height = height
        prev.canvas.height = height
        canvasChanged = true
      }
      if (prev.canvas.pixelRatio !== pixelRatio) {
        canvasDelta.pixelRatio = pixelRatio
        prev.canvas.pixelRatio = pixelRatio
        canvasChanged = true
      }
      if (canvasChanged) {
        out.canvas = canvasDelta
        changed = true
      }
    }

    return changed
  }

  /**
   * Reset the delta tracker so the next `fillEnv` emits a full snapshot.
   * Called when subscriptions change. Also useful after `snapshot()` is
   * consumed as bootstrap: reset then the next tick's delta is relative
   * to that bootstrap rather than to an empty prev.
   */
  resetDelta(): void {
    this._prev = { backend: {}, canvas: {} }
  }

  /**
   * Record a full snapshot as the current prev. Call this after
   * `snapshot()` is used for bootstrap so subsequent `fillEnv` calls
   * compute deltas relative to what the consumer already has.
   */
  recordSnapshotAsPrev(renderer: RendererLike | undefined): void {
    this.resetDelta()
    // Throwaway output — we just want `fillEnv` to update `_prev`.
    const throwaway: EnvPayload = {}
    this.fillEnv(throwaway, renderer)
  }
}
