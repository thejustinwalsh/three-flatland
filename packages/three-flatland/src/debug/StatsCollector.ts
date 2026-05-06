import type { StatsPayload } from '../debug-protocol'
import { FEATURE_STALE_MS, STATS_RING_SIZE } from '../debug-protocol'
import type { BufferCursor } from './bus-pool'
import { copyTypedTo } from './bus-pool'
import { detectGpuTimingActive } from './detectGpuTiming'

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
  info?: { render?: RenderInfo; memory?: { geometries: number; textures: number }; frame?: number }
  backend?: {
    trackTimestamp?: boolean
    constructor?: { name?: string }
    disjoint?: unknown
    /**
     * Public three.js API for reading which frame ids were in the last
     * resolved timestamp batch. `type` is `'render' | 'compute'`.
     * Returns `[...frameIds]` where the LAST entry is the frame whose
     * duration is in `renderer.info[type].timestamp`.
     */
    getTimestampFrames?(type: 'render' | 'compute'): number[]
  }
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

  private _gpuCapable = false
  private _gpuResolveInFlight = false
  private _gpuMs: number | undefined
  private _gpuLastAt = 0
  /**
   * Most-recently-resolved GPU ms, used to forward-fill the ring slot
   * for frames whose own resolve hasn't landed yet. Without this the
   * graph zigzags — only ~1/3 of frames get a resolved value per GPU
   * round-trip, so the remaining 2/3 would ship as `0` and render as
   * noise spikes. Forward-fill renders as stairsteps between updates
   * instead, which accurately reflects "we don't have newer data
   * yet" without fabricating a fake zero.
   */
  private _lastResolvedGpuMs = 0
  /**
   * Three.js frame id → ring slot index. Populated in `endFrame` so
   * the async timestamp-resolve path can retroactively write the
   * duration into the sample slot for the frame it actually measured,
   * not the frame that happened to be current when the promise
   * landed. `getTimestampFrames()` gives us the frame id of the
   * resolved duration (last entry of its array); we look up the slot
   * and write there.
   *
   * Cleared on `drainBatch` since slot indices are relative to
   * `_write` which resets. Late-arriving resolves for already-drained
   * frames silently drop — acceptable since the consumer has already
   * rendered the batch.
   */
  private _tjsFrameToIdx = new Map<number, number>()

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
    // `gpuMs` is forward-filled with the last-known resolved value.
    // An async `maybeResolveGpu` may later overwrite this specific
    // slot with the accurate per-frame duration (via
    // `_tjsFrameToIdx`). Until that lands, this slot ships the prior
    // sample — renders as a stairstep, not a zero spike. Frames
    // drained before their resolve arrives keep the forward-fill
    // forever, which is fine: "no fresher data available" is the
    // honest answer.
    this._gpuMsBuf[idx] = Math.min(65535, Math.round(this._lastResolvedGpuMs * 100))
    this._heapUsedBuf[idx] = Math.min(65535, heapUsedMB)
    this._drawCallsBuf[idx] = drawCalls
    this._trianglesBuf[idx] = triangles
    this._primitivesBuf[idx] = primitives
    this._geometriesBuf[idx] = geometries
    this._texturesBuf[idx] = textures
    this._write = idx + 1

    // Remember which ring slot belongs to this frame's three.js frame
    // id so the async timestamp resolve can retroactively fill the
    // correct slot. three.js's `info.frame` is the same counter the
    // timestamp query pool tags each query with (`:fN` uids).
    const tjsFrame = renderer.info?.frame
    if (typeof tjsFrame === 'number') {
      this._tjsFrameToIdx.set(tjsFrame, idx)
    }
  }

  /**
   * Schedule a GPU-timestamp resolve (async). Called every frame by the
   * producer to keep three's query pool drained; no-op when the backend
   * doesn't support timestamps.
   */
  maybeResolveGpu(): void {
    const renderer = this._latestRenderer
    if (!renderer) return

    // The feature probe is a cheap gate, not proof of capability:
    // backends like Safari WebGPU may expose `timestamp-query` yet
    // never return a non-zero `info.render.timestamp` in practice. So
    // we use the probe only to skip the API call on hopeless backends
    // (WebGL2 without disjoint, etc) and let `_gpuCapable` flip true
    // ONLY after we observe a real positive timestamp below. That
    // verified flag drives both `drainBatch`'s payload gate and the
    // env's `gpuModeEnabled` signal — consumers therefore hide the
    // GPU graph until data has actually arrived.
    if (!detectGpuTimingActive(renderer.backend)) return
    // One resolve in flight at a time. three.js's internal
    // `pendingResolve` guard would coalesce extra calls into the same
    // promise anyway, but calling `resolveTimestampsAsync` still
    // allocates a wrapping Promise + `.then`/`.catch` closures —
    // those are what we're throttling. The resolve itself trips every
    // frame we're idle, so we get one duration landed per GPU
    // round-trip (typically 1–3 frames — way better than the old
    // one-per-6-frames plateau).
    if (this._gpuResolveInFlight) return
    const fn = renderer.resolveTimestampsAsync?.bind(renderer)
    if (!fn) return

    this._gpuResolveInFlight = true
    void Promise.resolve(fn('render'))
      .then(() => {
        this._gpuResolveInFlight = false
        const gpuMs = renderer.info?.render?.timestamp
        if (typeof gpuMs !== 'number' || gpuMs <= 0) return
        // First positive timestamp confirms the renderer actually emits
        // GPU timing — flip `_gpuCapable` here, not at probe time. Once
        // verified it stays verified for the session.
        this._gpuCapable = true
        // Keep the cached "latest value" for any consumer that still
        // wants a live single-sample readout (e.g. a big-number tile)
        // — but the ring gets per-frame attribution below, not this
        // blanket value.
        this._gpuMs = gpuMs
        this._gpuLastAt = Date.now()
        // Update forward-fill reference so the NEXT `endFrame`'s slot
        // ships this value as its placeholder. Combined with the
        // retroactive write below, the graph reads:
        //   older slots: actual per-frame value (retroactively filled)
        //   newer slots: most recent resolved value (forward-filled)
        // — always monotonic in freshness, never zero.
        this._lastResolvedGpuMs = gpuMs

        // Ask three.js which frame id this duration belongs to.
        // `getTimestampFrames('render')` returns the array of tjs
        // frame ids that were in the just-resolved batch; the LAST
        // entry matches `info.render.timestamp` (per three.js's
        // `WebGPUTimestampQueryPool._resolveQueries`).
        //
        // **Coalescing caveat**: three.js's `resolveQueriesAsync`
        // uses a `pendingResolve` guard — multiple calls made while
        // an earlier resolve is in flight return the same promise.
        // By the time that promise lands, the pool has accumulated
        // queries from MULTIPLE frames. The pool computes individual
        // `framesDuration[frame]` internally but only returns the
        // LAST frame's value. We can't recover the intermediate
        // frames' individual durations — they're aggregated away.
        const frames = renderer.backend?.getTimestampFrames?.('render')
        if (!frames || frames.length === 0) return
        const tjsFrame = frames[frames.length - 1]!
        const encoded = Math.min(65535, Math.round(gpuMs * 100))

        // Update EVERY slot we're still tracking with the new value.
        // Three groups covered by the single write:
        //   1. Slot for `tjsFrame` itself — gets its accurate value.
        //   2. Slots for frames BEFORE `tjsFrame` in the coalesced
        //      batch — their individual durations are lost forever,
        //      so `V_new` is the best available estimate.
        //   3. Slots for frames AFTER `tjsFrame` that are still
        //      pending — they'll be refined when their own resolves
        //      land; meanwhile `V_new` beats stale `V_prev`.
        // Without (2) the ring had stairsteps within each batch
        // window that showed up as moving "reshape" jitter under
        // Tweakpane's inter-batch interpolation.
        for (const [, i] of this._tjsFrameToIdx) {
          if (i < this._write) {
            this._gpuMsBuf[i] = encoded
          }
        }

        // Garbage-collect resolved mappings — anything at or before
        // the resolved frame either got its slot written above or
        // belongs to an already-drained batch. Frames after stay in
        // the map to receive their own (refining) resolve.
        for (const f of this._tjsFrameToIdx.keys()) {
          if (f <= tjsFrame) this._tjsFrameToIdx.delete(f)
        }
      })
      .catch(() => {
        this._gpuResolveInFlight = false
      })
  }

  get gpuCapable(): boolean { return this._gpuCapable }

  /**
   * Fill `out` with the valid prefix of each ring as typed-array
   * views. Two modes:
   *
   *   - `into` provided  → views are positioned over the supplied
   *     pool buffer (`copyTypedTo` memcpys our private rings in).
   *     The producer can then transfer that pool buffer to the bus
   *     worker without paying `structuredClone` on the render thread.
   *   - `into` omitted   → views over our private rings (legacy path
   *     used by the inline transport, which `structuredClone`s on
   *     `BroadcastChannel.postMessage` — fine when not bus-busy).
   *
   * Returns `true` if anything was written. `_write` resets to 0
   * either way — next frame starts the next batch.
   */
  drainBatch(out: StatsPayload, into?: BufferCursor): boolean {
    const count = this._write
    if (count === 0) return false

    out.startFrame = this._startFrame
    out.count = count

    if (into !== undefined) {
      out.fps = copyTypedTo(into, this._fpsBuf.subarray(0, count))
      out.cpuMs = copyTypedTo(into, this._cpuMsBuf.subarray(0, count))
      out.drawCalls = copyTypedTo(into, this._drawCallsBuf.subarray(0, count))
      out.triangles = copyTypedTo(into, this._trianglesBuf.subarray(0, count))
      out.primitives = copyTypedTo(into, this._primitivesBuf.subarray(0, count))
      out.geometries = copyTypedTo(into, this._geometriesBuf.subarray(0, count))
      out.textures = copyTypedTo(into, this._texturesBuf.subarray(0, count))
      if (this._gpuCapable) out.gpuMs = copyTypedTo(into, this._gpuMsBuf.subarray(0, count))
      else delete out.gpuMs
      if (this._perfMemory) out.heapUsedMB = copyTypedTo(into, this._heapUsedBuf.subarray(0, count))
      else delete out.heapUsedMB
    } else {
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
    }

    if (this._perfMemory && !this._heapLimitEmitted) {
      out.heapLimitMB = Math.round(this._perfMemory.jsHeapSizeLimit / 1048576)
      this._heapLimitEmitted = true
    } else {
      delete out.heapLimitMB
    }

    this._write = 0
    // Ring slot indices are about to be reused for the next batch.
    // Any still-in-flight timestamp resolve that points at a
    // pre-drain slot would now write into a freshly-rebuilt sample
    // from a newer frame — wrong data. Drop the whole mapping; late
    // resolves for drained frames are silently discarded.
    this._tjsFrameToIdx.clear()
    return true
  }

  /** Called when a consumer re-subscribes; forces the next batch to re-send `heapLimitMB`. */
  resetDelta(): void {
    this._heapLimitEmitted = false
  }

  dispose(): void {
    this._latestRenderer = undefined
    this._tjsFrameToIdx.clear()
  }
}
