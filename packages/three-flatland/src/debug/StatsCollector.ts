import type { StatsPayload } from '../debug-protocol'
import { FEATURE_STALE_MS, STATS_RING_SIZE } from '../debug-protocol'

interface RenderInfo {
  calls?: number
  triangles?: number
  lines?: number
  points?: number
  geometries?: number
  textures?: number
  timestamp?: number
}

interface RendererLike {
  info?: { render?: RenderInfo; memory?: { geometries: number; textures: number } }
  backend?: { trackTimestamp?: boolean; constructor?: { name?: string }; disjoint?: unknown }
  resolveTimestampsAsync?(type: 'render' | 'compute'): Promise<number | undefined>
}

/**
 * Per-frame stats collector.
 *
 * Writes one sample per `endFrame` into pre-allocated typed-array
 * buffers (size `STATS_RING_SIZE`). `drainBatch` snaps the valid
 * prefix of each buffer out as `subarray` views (zero data copy —
 * views over the same ArrayBuffer) and resets the write cursor to 0.
 *
 * `postMessage` / structuredClone copies the view contents *at call
 * time*, so overwriting the underlying buffer on subsequent frames is
 * safe. Overflow (>`STATS_RING_SIZE` samples collected between flushes
 * — ~4 s at 60 Hz) drops the newest sample rather than overwriting,
 * keeping the oldest-first batch contract.
 */
export class StatsCollector {
  private _latestRenderer: RendererLike | undefined
  private _frame = 0
  get frame(): number { return this._frame }

  private _renderStartAt = 0
  private _lastFrameEndAt = 0
  private _callsBefore = 0
  private _trianglesBefore = 0
  private _linesBefore = 0
  private _pointsBefore = 0

  private _gpuChecked = false
  private _gpuCapable = false
  private _gpuResolveInFlight = false
  private _gpuMs: number | undefined
  private _gpuLastAt = 0

  private _perfMemory: { usedJSHeapSize: number; jsHeapSizeLimit: number } | undefined =
    typeof performance !== 'undefined'
      ? (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      : undefined

  /** Heap limit is static — emit once on the first batch, then omit. */
  private _heapLimitEmitted = false

  // Pre-allocated per-frame sample buffers. Written linearly from 0 to
  // `_write`; reset to 0 on drain. Never reallocated.
  private readonly _fpsBuf = new Int16Array(STATS_RING_SIZE)
  private readonly _cpuMsBuf = new Uint16Array(STATS_RING_SIZE)
  private readonly _gpuMsBuf = new Uint16Array(STATS_RING_SIZE)
  private readonly _heapUsedBuf = new Uint16Array(STATS_RING_SIZE)
  private readonly _drawCallsBuf = new Uint32Array(STATS_RING_SIZE)
  private readonly _trianglesBuf = new Uint32Array(STATS_RING_SIZE)
  private readonly _primitivesBuf = new Uint32Array(STATS_RING_SIZE)
  private readonly _geometriesBuf = new Uint32Array(STATS_RING_SIZE)
  private readonly _texturesBuf = new Uint32Array(STATS_RING_SIZE)

  private _write = 0
  private _startFrame = 0

  private _fpsAccum = 0
  private _fpsFrames = 0
  private _fpsSmoothed = 0

  beginFrame(now: number, renderer: RendererLike | undefined): void {
    this._renderStartAt = now
    this._latestRenderer = renderer
    const render = renderer?.info?.render
    this._callsBefore = render?.calls ?? 0
    this._trianglesBefore = render?.triangles ?? 0
    this._linesBefore = render?.lines ?? 0
    this._pointsBefore = render?.points ?? 0
  }

  endFrame(renderer: RendererLike): void {
    const now = performance.now()
    const cpuMs = this._renderStartAt > 0 ? now - this._renderStartAt : 0

    let fps = this._fpsSmoothed
    if (this._lastFrameEndAt > 0) {
      this._fpsAccum += now - this._lastFrameEndAt
      this._fpsFrames++
      if (this._fpsAccum >= 250) {
        this._fpsSmoothed = (this._fpsFrames * 1000) / this._fpsAccum
        this._fpsAccum = 0
        this._fpsFrames = 0
      }
      fps = this._fpsSmoothed
    }
    this._lastFrameEndAt = now
    this._latestRenderer = renderer

    const render = renderer.info?.render
    const memory = renderer.info?.memory
    const drawCalls = Math.max(0, (render?.calls ?? 0) - this._callsBefore)
    const triangles = Math.max(0, (render?.triangles ?? 0) - this._trianglesBefore)
    const primitives =
      Math.max(0, (render?.lines ?? 0) - this._linesBefore) +
      Math.max(0, (render?.points ?? 0) - this._pointsBefore)
    const geometries = memory?.geometries ?? 0
    const textures = memory?.textures ?? 0
    const gpuFresh = this._gpuCapable && this._gpuMs !== undefined && Date.now() - this._gpuLastAt <= FEATURE_STALE_MS
    const gpuMs = gpuFresh ? (this._gpuMs as number) : 0
    const heapUsedMB = this._perfMemory ? Math.round(this._perfMemory.usedJSHeapSize / 1048576) : 0

    this._frame++

    // Overflow: flush hasn't run in a very long time. Drop the sample
    // rather than reallocating or trampling the oldest entries.
    const idx = this._write
    if (idx >= STATS_RING_SIZE) return
    if (idx === 0) this._startFrame = this._frame - 1

    // Scaled encodings (see StatsPayload docstring).
    this._fpsBuf[idx] = Math.min(32767, Math.round(fps * 10))
    this._cpuMsBuf[idx] = Math.min(65535, Math.round(cpuMs * 100))
    this._gpuMsBuf[idx] = Math.min(65535, Math.round(gpuMs * 100))
    this._heapUsedBuf[idx] = Math.min(65535, heapUsedMB)
    this._drawCallsBuf[idx] = drawCalls
    this._trianglesBuf[idx] = triangles
    this._primitivesBuf[idx] = primitives
    this._geometriesBuf[idx] = geometries
    this._texturesBuf[idx] = textures
    this._write = idx + 1
  }

  /**
   * Schedule a GPU-timestamp resolve (async). Called every frame by the
   * producer to keep three's query pool drained; no-op when the backend
   * doesn't support timestamps.
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

    this._gpuResolveInFlight = true
    void Promise.resolve(fn('render'))
      .then(() => {
        this._gpuResolveInFlight = false
        const gpuMs = renderer.info?.render?.timestamp
        if (typeof gpuMs !== 'number' || gpuMs <= 0) return
        this._gpuMs = gpuMs
        this._gpuLastAt = Date.now()
      })
      .catch(() => {
        this._gpuResolveInFlight = false
      })
  }

  get gpuCapable(): boolean { return this._gpuCapable }

  /**
   * Fill `out` with views of the valid prefix of each buffer. Returns
   * `true` if anything was written. After a successful drain `_write`
   * resets to 0 — next frame starts the next batch. Buffers themselves
   * are not reallocated; `postMessage` / structuredClone copies the
   * view contents synchronously so overwriting afterward is safe.
   */
  drainBatch(out: StatsPayload): boolean {
    const count = this._write
    if (count === 0) return false

    out.startFrame = this._startFrame
    out.count = count
    out.fps = this._fpsBuf.subarray(0, count)
    out.cpuMs = this._cpuMsBuf.subarray(0, count)
    out.drawCalls = this._drawCallsBuf.subarray(0, count)
    out.triangles = this._trianglesBuf.subarray(0, count)
    out.primitives = this._primitivesBuf.subarray(0, count)
    out.geometries = this._geometriesBuf.subarray(0, count)
    out.textures = this._texturesBuf.subarray(0, count)

    if (this._gpuCapable) out.gpuMs = this._gpuMsBuf.subarray(0, count)
    else delete out.gpuMs

    if (this._perfMemory) out.heapUsedMB = this._heapUsedBuf.subarray(0, count)
    else delete out.heapUsedMB

    if (this._perfMemory && !this._heapLimitEmitted) {
      out.heapLimitMB = Math.round(this._perfMemory.jsHeapSizeLimit / 1048576)
      this._heapLimitEmitted = true
    } else {
      delete out.heapLimitMB
    }

    this._write = 0
    return true
  }

  /** Called when a consumer re-subscribes; forces the next batch to re-send `heapLimitMB`. */
  resetDelta(): void {
    this._heapLimitEmitted = false
  }

  dispose(): void {
    this._latestRenderer = undefined
  }
}
