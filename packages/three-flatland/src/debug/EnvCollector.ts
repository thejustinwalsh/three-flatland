import { REVISION } from 'three'
import type {
  EnvBackendDelta,
  EnvCanvasDelta,
  EnvInfoPayload,
} from '../debug-protocol'
import { stampMessage } from '../debug-protocol'
import { VERSION as THREE_FLATLAND_VERSION } from '../index'

/**
 * Subset of `WebGPURenderer` we inspect. Fields are all optional / unknown
 * so three's concrete `Backend` type is still assignable — we narrow
 * defensively at runtime.
 */
interface RendererLike {
  backend?: unknown
  getSize?(target: { x: number; y: number }): unknown
  getPixelRatio?(): number
}

/**
 * Shape of the last-dispatched `env:info` payload we track for delta
 * encoding. Separate from `EnvInfoPayload` so we hold concrete values
 * (not `T | null | undefined`) — simpler to diff against.
 */
interface EnvSnapshot {
  threeFlatlandVersion?: string
  threeRevision?: string
  backend: {
    name?: string
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
 * Environment metadata producer for the `env:info` topic.
 *
 * Almost everything `env:info` carries is static (versions fixed at
 * build time, renderer backend fixed at construction); only the canvas
 * `width` / `height` / `pixelRatio` can change at runtime, and even
 * those only on user-triggered resize. So the collector is cheap:
 * - First dispatch after `ui:subscribe` sends a full snapshot.
 * - Subsequent ticks (only while a subscriber is active) diff against
 *   the cached snapshot and dispatch only if something changed (in
 *   practice: canvas dims).
 * - When no subscriber is active, `update()` is a no-op guarded by the
 *   `Heartbeat.isActive('env:info')` check from the caller.
 *
 * Delta encoding rules match the rest of the protocol: fields that
 * haven't changed are omitted, fields that were set and are now
 * unavailable are sent as `null`.
 */
export class EnvCollector {
  private _bus: BroadcastChannel
  private _last: EnvSnapshot = { backend: {}, canvas: {} }

  /** Scratch Vector2-shaped object for `renderer.getSize` — avoids allocations. */
  private _sizeScratch = { x: 0, y: 0 }

  constructor(bus: BroadcastChannel) {
    this._bus = bus
  }

  /**
   * Reset the delta tracker so the next `update()` emits a full snapshot.
   * Called by Flatland when a fresh `ui:subscribe` for `env:info` arrives.
   */
  resetDelta(): void {
    this._last = { backend: {}, canvas: {} }
  }

  /**
   * Inspect the current environment and dispatch a delta message on the
   * bus if anything changed since the last dispatch. Caller is expected
   * to gate on `Heartbeat.isActive('env:info')` — this method doesn't
   * check for itself.
   */
  update(renderer: RendererLike | undefined): void {
    const payload: EnvInfoPayload = {}
    const last = this._last
    let changed = false

    // --- Static fields (versions) -------------------------------------
    if (last.threeFlatlandVersion !== THREE_FLATLAND_VERSION) {
      payload.threeFlatlandVersion = THREE_FLATLAND_VERSION
      last.threeFlatlandVersion = THREE_FLATLAND_VERSION
      changed = true
    }
    if (last.threeRevision !== REVISION) {
      payload.threeRevision = REVISION
      last.threeRevision = REVISION
      changed = true
    }

    // --- Backend info (effectively static once renderer is created) ---
    if (renderer?.backend) {
      // three's Backend type doesn't declare these as public, but they
      // exist on the concrete WebGPU/WebGL backend instances. Structural
      // cast + defensive optional chaining handles both real and absent.
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
      if (last.backend.name !== name) { backendDelta.name = name; last.backend.name = name ?? undefined }
      if (last.backend.trackTimestamp !== trackTimestamp) {
        backendDelta.trackTimestamp = trackTimestamp
        last.backend.trackTimestamp = trackTimestamp
      }
      if (last.backend.disjoint !== disjoint) {
        backendDelta.disjoint = disjoint
        last.backend.disjoint = disjoint
      }
      if (last.backend.gpuModeEnabled !== gpuModeEnabled) {
        backendDelta.gpuModeEnabled = gpuModeEnabled
        last.backend.gpuModeEnabled = gpuModeEnabled
      }
      if (Object.keys(backendDelta).length > 0) {
        payload.backend = backendDelta
        changed = true
      }
    }

    // --- Canvas dimensions (runtime-variable on resize / DPI change) --
    if (renderer?.getSize) {
      renderer.getSize(this._sizeScratch)
      const width = this._sizeScratch.x
      const height = this._sizeScratch.y
      const pixelRatio = renderer.getPixelRatio?.() ?? 1

      const canvasDelta: EnvCanvasDelta = {}
      if (last.canvas.width !== width) { canvasDelta.width = width; last.canvas.width = width }
      if (last.canvas.height !== height) { canvasDelta.height = height; last.canvas.height = height }
      if (last.canvas.pixelRatio !== pixelRatio) {
        canvasDelta.pixelRatio = pixelRatio
        last.canvas.pixelRatio = pixelRatio
      }
      if (Object.keys(canvasDelta).length > 0) {
        payload.canvas = canvasDelta
        changed = true
      }
    }

    if (!changed) return
    try {
      this._bus.postMessage(stampMessage({ type: 'env:info', payload }))
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }
}
