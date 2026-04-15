import type { Scene } from 'three'
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
  private _originalBefore: AnyCallable | null = null
  private _originalAfter: AnyCallable | null = null

  /**
   * Callback fired from inside `scene.onAfterRender` after this
   * collector has updated its internal state. Producer wires this to
   * its `update()` so packet emit happens from the same hook as stats
   * capture — no timing gap. Optional; auto-firing users leave it
   * null and call `update()` themselves.
   */
  private _onFrameEnd: ((renderer: RendererLike) => void) | null = null

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

  /** FPS computed from the interval between consecutive `onAfterRender` fires. */
  private _fps: number | undefined
  private _lastAfterRenderAt = 0
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

  constructor(scene: Scene) {
    this._scene = scene
    this._installHook()
  }

  /**
   * Set (or clear) the per-frame-end callback. Called from inside
   * `scene.onAfterRender` after internal state has been updated, so
   * the listener sees a fully-settled frame.
   */
  setOnFrameEnd(cb: ((renderer: RendererLike) => void) | null): void {
    this._onFrameEnd = cb
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

  /** Stop intercepting `scene.onBeforeRender` / `scene.onAfterRender`. */
  dispose(): void {
    if (this._originalBefore) {
      ;(this._scene as unknown as { onBeforeRender: AnyCallable }).onBeforeRender = this._originalBefore
      this._originalBefore = null
    }
    if (this._originalAfter) {
      ;(this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = this._originalAfter
      this._originalAfter = null
    }
    this._latestRenderer = undefined
  }

  /**
   * Install chained `onBeforeRender` + `onAfterRender` hooks on the
   * scene. These bracket the ENTIRE three.js render — not just our
   * engine's wrapper-of-a-wrapper — so `cpuMs` measures actual
   * renderer.render() cost and FPS reflects the real engine render
   * rate. Works the same whether called from Flatland.render or a bare
   * renderer.render.
   *
   * Both callbacks chain any pre-existing callback users may have set.
   * Restored on dispose.
   */
  private _installHook(): void {
    type Scene3 = { onBeforeRender: AnyCallable; onAfterRender: AnyCallable }
    const scene = this._scene as unknown as Scene3

    const origBefore = scene.onBeforeRender
    this._originalBefore = origBefore
    const prevBefore = origBefore.bind(scene)
    scene.onBeforeRender = (...args) => {
      prevBefore(...args)
      // Mark the start of the three.js render phase.
      this._renderStartAt = performance.now()
      // Snapshot cumulative renderer counters so onAfterRender can
      // compute THIS render's delta (correct regardless of
      // `renderer.info.autoReset`).
      const renderer = args[0] as RendererLike | undefined
      const render = renderer?.info?.render
      this._callsBefore = render?.calls ?? 0
      this._trianglesBefore = render?.triangles ?? 0
    }

    const origAfter = scene.onAfterRender
    this._originalAfter = origAfter
    const prevAfter = origAfter.bind(scene)
    scene.onAfterRender = (...args) => {
      prevAfter(...args)
      const now = performance.now()

      // CPU time spent inside renderer.render() for this frame.
      if (this._renderStartAt > 0) this._cpuMs = now - this._renderStartAt

      // FPS from interval between consecutive onAfterRender fires.
      // Anchors to the real render cadence regardless of who calls
      // renderer.render — Flatland, bare three.js, multiple instances.
      if (this._lastAfterRenderAt > 0) {
        this._fpsAccum += now - this._lastAfterRenderAt
        this._fpsFrames++
        if (this._fpsAccum >= 500) {
          this._fps = (this._fpsFrames * 1000) / this._fpsAccum
          this._fpsAccum = 0
          this._fpsFrames = 0
        }
      }
      this._lastAfterRenderAt = now

      const renderer = args[0] as RendererLike | undefined
      if (!renderer) return
      this._frame++
      this._latestRenderer = renderer

      // Compute per-render deltas. autoReset=true → _callsBefore is 0
      // and delta == current value; autoReset=false → delta is this
      // render's contribution vs the running cumulative.
      const render = renderer.info?.render
      this._drawCalls = (render?.calls ?? 0) - this._callsBefore
      this._triangles = (render?.triangles ?? 0) - this._trianglesBefore

      // Notify owner (DevtoolsProducer) that a frame just ended so it
      // can flush the packet from the same hook. Keeps timing
      // consistent: stats captured → packet emitted, no gap. Works the
      // same for Flatland and standalone users since neither has to
      // manually pump.
      this._onFrameEnd?.(renderer)
    }
  }
}
