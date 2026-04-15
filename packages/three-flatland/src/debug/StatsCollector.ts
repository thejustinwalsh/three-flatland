import type { Scene } from 'three'
import type { StatsPayload } from '../debug-protocol'
import { FEATURE_STALE_MS } from '../debug-protocol'

/** Subset of three's renderer.info we read each frame. */
interface RenderInfo {
  drawCalls?: number
  triangles?: number
  geometries?: number
  textures?: number
  /** GPU frame time in ms, populated after `resolveTimestampsAsync` resolves. */
  timestamp?: number
}

/** Subset of WebGPURenderer we touch. */
interface RendererLike {
  info?: { render?: RenderInfo; memory?: { geometries: number; textures: number } }
  backend?: { trackTimestamp?: boolean; constructor?: { name?: string }; disjoint?: unknown }
  resolveTimestampsAsync?(type: 'render' | 'compute'): Promise<number | undefined>
}

/** Permissive callable — chains `scene.onAfterRender` regardless of three's type. */
type AnyCallable = (this: unknown, ...args: unknown[]) => void

/**
 * Per-frame stats collector.
 *
 * Merges the former `stats:frame` and `stats:gpuReady` topics into a
 * single `stats` feature whose payload includes optional `gpuMs` /
 * `gpuFrame`. The server caches the last-resolved GPU timing between
 * async-readback completions so the `stats` packet can carry a stable
 * value even on frames where no readback arrived.
 *
 * This class does NOT dispatch messages itself. Flatland owns the
 * per-tick `data` packet and calls `fillStats(out)` when the `stats`
 * feature is active; we write delta-encoded fields into `out` and
 * return whether we had anything to contribute this tick.
 *
 * Double-buffered scratch:
 *   `_prev`  — last emitted values (diff reference)
 *   Output payload — written into by `fillStats`; caller owns allocation
 *
 * `resetDelta()` clears `_prev` so the next `fillStats` emits a full
 * snapshot — called when subscriptions change and late-joining
 * consumers need the full state on the first post-subscribe tick.
 */
export class StatsCollector {
  private _scene: Scene
  private _originalHook: AnyCallable | null = null

  /** Latest renderer seen via `scene.onAfterRender`. Set whenever a render fires. */
  private _latestRenderer: RendererLike | undefined

  /** Monotonic engine-render counter — exposed so the tick driver can attach it to the DataPayload envelope. */
  private _frame = 0

  /** Public read access to the current frame counter. */
  get frame(): number { return this._frame }

  /** Rolling FPS state. */
  private _lastFpsTime = 0
  private _fpsAccum = 0
  private _fpsFrames = 0
  private _fps: number | undefined

  /** GPU timestamp state. */
  private _gpuChecked = false
  private _gpuCapable = false
  private _gpuResolveInFlight = false
  /** Latest resolved GPU frame time (ms). Undefined = never resolved. */
  private _gpuMs: number | undefined
  /** Frame number the latest `_gpuMs` was resolved from. */
  private _gpuFrame: number | undefined
  /** Wall-clock time of the most recent GPU resolve. For stale detection. */
  private _gpuLastAt = 0

  /**
   * Previous snapshot (diff reference). Every field is the value we
   * last emitted to the data packet; `fillStats` compares current vs
   * prev to decide what to include.
   */
  private _prev: {
    drawCalls?: number
    triangles?: number
    geometries?: number
    textures?: number
    fps?: number
    gpuMs?: number | null
    gpuFrame?: number
  } = {}

  constructor(scene: Scene) {
    this._scene = scene
    this._installHook()
  }

  /**
   * Mark the start of a frame. Flatland calls this from `render()` so
   * the FPS clock is anchored to the engine's rate, not the browser's
   * repaint cadence.
   */
  beginFrame(now: number): void {
    if (this._lastFpsTime === 0) {
      this._lastFpsTime = now
      return
    }
    const delta = now - this._lastFpsTime
    this._lastFpsTime = now
    this._fpsAccum += delta
    this._fpsFrames++
    if (this._fpsAccum >= 500) {
      this._fps = (this._fpsFrames * 1000) / this._fpsAccum
      this._fpsAccum = 0
      this._fpsFrames = 0
    }
  }

  /**
   * Schedule a GPU-timestamp resolve (async). Called by Flatland when
   * the `stats` feature is active — we only want to pay the
   * resolve-queue cost when someone's watching.
   */
  maybeResolveGpu(): void {
    const renderer = this._latestRenderer
    if (!renderer) return

    if (!this._gpuChecked) {
      this._gpuChecked = true
      const backend = renderer.backend
      if (backend?.trackTimestamp === true) {
        const isWebGL = backend.constructor?.name === 'WebGLBackend'
        this._gpuCapable = !isWebGL || backend.disjoint != null
      }
    }
    if (!this._gpuCapable) return
    if (this._gpuResolveInFlight) return
    const fn = renderer.resolveTimestampsAsync?.bind(renderer)
    if (!fn) return

    const frameAtResolve = this._frame
    this._gpuResolveInFlight = true
    void Promise.resolve(fn('render'))
      .then(() => {
        this._gpuResolveInFlight = false
        const gpuMs = renderer.info?.render?.timestamp
        if (typeof gpuMs !== 'number' || gpuMs <= 0) return
        this._gpuMs = gpuMs
        this._gpuFrame = frameAtResolve
        this._gpuLastAt = Date.now()
      })
      .catch(() => {
        this._gpuResolveInFlight = false
        // Transient readback failures — next frame will retry.
      })
  }

  /**
   * Write the current tick's delta-encoded stats into `out`. Returns
   * `true` if any field differed from the last emit — caller should
   * then include `stats` in the data packet. If `false`, no field
   * changed and the `stats` feature should be omitted from this tick's
   * packet entirely (absent = no change per protocol delta semantics).
   *
   * No always-present fields. Frame correlation is carried at the
   * envelope level (`DataPayload.frame`), not in the stats payload.
   *
   * Delta rules:
   * - Field absent from `out` → no change since last emit
   * - Field === null → clear (consumer resets to undefined)
   * - Field present with value → new value
   */
  fillStats(out: StatsPayload): boolean {
    const renderer = this._latestRenderer
    const render = renderer?.info?.render
    const memory = renderer?.info?.memory

    const drawCalls = render?.drawCalls ?? 0
    const triangles = render?.triangles ?? 0
    const geometries = memory?.geometries ?? 0
    const textures = memory?.textures ?? 0
    const fps = this._fps

    // Clear all delta fields first so stale values from previous ticks
    // don't leak through the scratch payload.
    out.drawCalls = undefined
    out.triangles = undefined
    out.geometries = undefined
    out.textures = undefined
    out.cpuMs = undefined
    out.fps = undefined
    out.gpuMs = undefined
    out.gpuFrame = undefined

    let changed = false
    const prev = this._prev

    if (drawCalls !== prev.drawCalls) { out.drawCalls = drawCalls; prev.drawCalls = drawCalls; changed = true }
    if (triangles !== prev.triangles) { out.triangles = triangles; prev.triangles = triangles; changed = true }
    if (geometries !== prev.geometries) { out.geometries = geometries; prev.geometries = geometries; changed = true }
    if (textures !== prev.textures) { out.textures = textures; prev.textures = textures; changed = true }
    if (fps !== prev.fps) {
      // undefined → wire as null (consumer clears its display)
      out.fps = fps === undefined ? null : fps
      prev.fps = fps
      changed = true
    }

    // GPU timing — server maintains a cache; transition to null when
    // the cache goes stale (no resolves for FEATURE_STALE_MS).
    const now = Date.now()
    let gpuMs: number | null | undefined = this._gpuMs
    let gpuFrame: number | undefined = this._gpuFrame
    if (this._gpuCapable && this._gpuMs !== undefined && now - this._gpuLastAt > FEATURE_STALE_MS) {
      // Stale — clear cache + schedule a null emission on next diff.
      this._gpuMs = undefined
      this._gpuFrame = undefined
      gpuMs = null
      gpuFrame = undefined
    }
    if (gpuMs !== prev.gpuMs) {
      out.gpuMs = gpuMs === undefined ? null : gpuMs
      prev.gpuMs = gpuMs ?? null
      changed = true
    }
    if (gpuFrame !== prev.gpuFrame) {
      out.gpuFrame = gpuFrame === undefined ? null : gpuFrame
      prev.gpuFrame = gpuFrame
      changed = true
    }

    return changed
  }

  /**
   * Reset the delta tracker so the next `fillStats` emits a full snapshot.
   * Called when subscriptions change — keeps late-joining consumers
   * synchronised without having to infer state from partial deltas.
   */
  resetDelta(): void {
    this._prev = {}
  }

  /** Stop intercepting `scene.onAfterRender`; clear frame counter. */
  dispose(): void {
    if (this._originalHook) {
      const original = this._originalHook
      ;(this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = original
      this._originalHook = null
    }
    this._latestRenderer = undefined
  }

  /**
   * Install the chained `onAfterRender` hook. Captures the renderer ref
   * + increments the frame counter every render; leaves dispatch
   * decisions to the Flatland tick driver.
   */
  private _installHook(): void {
    const original = (this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender
    this._originalHook = original
    const prev = original.bind(this._scene)

    const hook: AnyCallable = (...args) => {
      prev(...args)
      const renderer = args[0] as RendererLike | undefined
      if (!renderer) return
      this._frame++
      this._latestRenderer = renderer
    }
    ;(this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = hook
  }
}
