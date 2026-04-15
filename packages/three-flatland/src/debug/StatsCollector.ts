import type { StatsPayload } from '../debug-protocol'
import { FEATURE_STALE_MS } from '../debug-protocol'

/**
 * Subset of three's renderer.info we read each frame.
 *
 * `calls` is the canonical three.js field name for draw-call count
 * (not `drawCalls`). We expose it to the bus as `drawCalls` for
 * consumer-friendliness — that's the StatsPayload field name —
 * computed here as a per-render delta so it's correct regardless of
 * `renderer.info.autoReset` setting.
 */
interface RenderInfo {
  calls?: number
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

/**
 * Per-frame stats collector.
 *
 * Explicit-driven — caller invokes `beginFrame(now, renderer)` and
 * `endFrame(renderer)` at the boundaries of a logical frame. Works
 * correctly for engines like Flatland that do multiple internal
 * `renderer.render()` calls per frame (SDF pass, occlusion pass, main
 * render): stats accumulate across all passes between begin/end.
 *
 * Call sites:
 *   - Flatland wraps its whole `render()` method body.
 *   - Bare three.js apps wrap their rAF tick body (or `renderer.render()`
 *     call if there's only one).
 *   - Multi-scene apps bracket their full frame.
 *
 * This class does NOT dispatch messages. `DevtoolsProducer` owns the
 * packet build; `fillStats(out)` writes delta-encoded fields into a
 * caller-owned scratch and returns whether anything changed.
 */
export class StatsCollector {

  /** Latest renderer seen via `scene.onAfterRender`. Set whenever a render fires. */
  private _latestRenderer: RendererLike | undefined

  /** Monotonic engine-render counter — exposed so the tick driver can attach it to the DataPayload envelope. */
  private _frame = 0

  /** Public read access to the current frame counter. */
  get frame(): number { return this._frame }

  /**
   * Wall-clock timestamp when the most recent `scene.onBeforeRender`
   * fired — i.e. the start of the current `renderer.render()` call.
   * Paired with the `onAfterRender` timestamp to compute `cpuMs`.
   */
  private _renderStartAt = 0

  /**
   * Snapshot of `renderer.info.render.calls` at `onBeforeRender` time
   * — subtracted from the post-render value to get THIS render's
   * contribution. Works regardless of `renderer.info.autoReset`:
   *   - autoReset=true:  before=0 every frame, delta=calls as reported
   *   - autoReset=false: before=cumulative, delta=this-render-only
   * The bus payload's `drawCalls` field is always "this render's
   * draws," never cumulative.
   */
  private _callsBefore = 0
  private _trianglesBefore = 0

  /** Per-render delta values captured in onAfterRender, emitted by fillStats. */
  private _drawCalls = 0
  private _triangles = 0

  /** CPU time (ms) of the most recent three.js render (onAfterRender - onBeforeRender). */
  private _cpuMs: number | undefined

  /** FPS computed from the interval between consecutive `endFrame()` calls (true frame boundary). */
  private _fps: number | undefined
  private _lastFrameEndAt = 0
  private _fpsAccum = 0
  private _fpsFrames = 0

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
    cpuMs?: number
    fps?: number
    gpuMs?: number | null
    gpuFrame?: number
  } = {}

  constructor() {
    // No args — explicit begin/end driven. Caller (DevtoolsProducer or
    // a bare-three.js app) calls `beginFrame()` / `endFrame()` to
    // bracket a logical frame.
  }

  /**
   * Mark the start of a logical frame. Snapshots `renderer.info.render`
   * counters as the "before" reference so `endFrame()` can compute
   * per-frame deltas — correct aggregation across multiple internal
   * `renderer.render()` calls and independent of
   * `renderer.info.autoReset`.
   */
  beginFrame(now: number, renderer: RendererLike | undefined): void {
    this._renderStartAt = now
    this._latestRenderer = renderer
    const render = renderer?.info?.render
    this._callsBefore = render?.calls ?? 0
    this._trianglesBefore = render?.triangles ?? 0
  }

  /**
   * Mark the end of the logical frame. Computes cpuMs, per-frame draw
   * call + triangle deltas, updates FPS from the interval between
   * consecutive `endFrame` calls, increments the engine frame counter.
   */
  endFrame(renderer: RendererLike): void {
    const now = performance.now()

    if (this._renderStartAt > 0) this._cpuMs = now - this._renderStartAt

    if (this._lastFrameEndAt > 0) {
      this._fpsAccum += now - this._lastFrameEndAt
      this._fpsFrames++
      if (this._fpsAccum >= 500) {
        this._fps = (this._fpsFrames * 1000) / this._fpsAccum
        this._fpsAccum = 0
        this._fpsFrames = 0
      }
    }
    this._lastFrameEndAt = now

    this._latestRenderer = renderer
    this._frame++

    const render = renderer.info?.render
    this._drawCalls = (render?.calls ?? 0) - this._callsBefore
    this._triangles = (render?.triangles ?? 0) - this._trianglesBefore
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
    const memory = renderer?.info?.memory

    // drawCalls + triangles are per-render deltas captured in
    // onAfterRender, not raw reads of renderer.info here (which would
    // be either zero after autoReset or cumulative across renders).
    const drawCalls = this._drawCalls
    const triangles = this._triangles
    const geometries = memory?.geometries ?? 0
    const textures = memory?.textures ?? 0
    const cpuMs = this._cpuMs
    const fps = this._fps

    // Delete (not set-to-undefined) every delta field so `structuredClone`
    // inside postMessage emits a truly absent key, not an explicit
    // `{ fieldName: undefined }` on the wire. Absent = no change per
    // protocol; explicit undefined would round-trip to consumers as
    // visible `undefined` values and waste bytes in the message.
    delete out.drawCalls
    delete out.triangles
    delete out.geometries
    delete out.textures
    delete out.cpuMs
    delete out.fps
    delete out.gpuMs
    delete out.gpuFrame

    let changed = false
    const prev = this._prev

    if (drawCalls !== prev.drawCalls) { out.drawCalls = drawCalls; prev.drawCalls = drawCalls; changed = true }
    if (triangles !== prev.triangles) { out.triangles = triangles; prev.triangles = triangles; changed = true }
    if (geometries !== prev.geometries) { out.geometries = geometries; prev.geometries = geometries; changed = true }
    if (textures !== prev.textures) { out.textures = textures; prev.textures = textures; changed = true }
    if (cpuMs !== prev.cpuMs) {
      out.cpuMs = cpuMs === undefined ? null : cpuMs
      prev.cpuMs = cpuMs
      changed = true
    }
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

  /** Clear internal state. No global hooks to undo in the explicit-driven design. */
  dispose(): void {
    this._latestRenderer = undefined
  }
}
