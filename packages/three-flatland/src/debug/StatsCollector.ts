import type { Scene } from 'three'
import type {
  DebugMessage,
  StatsFramePayload,
  StatsGpuReadyPayload,
} from '../debug-protocol'
import { DEBUG_PROTOCOL_VERSION } from '../debug-protocol'
import type { Heartbeat } from './Heartbeat'

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

/**
 * Permissive callable shape used for chaining `scene.onAfterRender`. Three's
 * type signature differs between Object3D and Scene (the renderTarget arg);
 * casting to a generic callable lets us forward whatever the runtime hands us.
 */
type AnyCallable = (this: unknown, ...args: unknown[]) => void

/**
 * Per-frame stats producer for the debug bus.
 *
 * Hooks `scene.onAfterRender` to capture `renderer.info.render` /
 * `info.memory` after every render. Posts `stats:frame` if the
 * `stats:frame` topic has an active listener (via `Heartbeat`). Posts
 * `stats:gpuReady` asynchronously after the GPU timestamp pool drains, if
 * the `stats:gpu` topic is active.
 *
 * Owns a chained reference to any pre-existing `scene.onAfterRender`
 * callback so we don't stomp callers who set their own. Restored on
 * `dispose()`.
 *
 * Cost when no topics are active: one timestamp comparison per render
 * (sub-microsecond). Cost when active: one structured-clone of a small
 * payload per frame, plus the existing `info.render` snapshot (which
 * three.js populates regardless of whether we read it).
 */
export class StatsCollector {
  private _scene: Scene
  private _bus: BroadcastChannel
  private _pings: Heartbeat

  /** Original `scene.onAfterRender` we replaced; restored on dispose. */
  private _originalHook: AnyCallable | null = null

  /** Frame counter — used to correlate `stats:gpuReady` with the frame that emitted it. */
  private _frame = 0

  /** Rolling FPS state. */
  private _lastFpsTime = 0
  private _fpsAccum = 0
  private _fpsFrames = 0
  private _fps: number | undefined

  /** True after we've checked GPU-timestamp capability once. */
  private _gpuChecked = false
  private _gpuCapable = false

  /** Set true while we have an in-flight `resolveTimestampsAsync` to avoid pile-up. */
  private _gpuResolveInFlight = false

  constructor(scene: Scene, bus: BroadcastChannel, pings: Heartbeat) {
    this._scene = scene
    this._bus = bus
    this._pings = pings
    this._installHook()
  }

  /**
   * Mark the start of a frame. Production callers invoke from
   * `Flatland.render()` so the FPS clock is anchored to the engine's
   * render rate, not the browser's repaint cadence.
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

  /** Stop intercepting `scene.onAfterRender` and clear bus refs. */
  dispose(): void {
    if (this._originalHook) {
      const original = this._originalHook
      ;(this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = original
      this._originalHook = null
    }
  }

  /**
   * Install the chained `onAfterRender` hook. Three.js types this with the
   * Object3D per-object signature, but for `Scene` it's actually called as
   * `(renderer, scene, camera, renderTarget)`. We cast with a permissive
   * callable type so the chain works regardless.
   */
  private _installHook(): void {
    const original = (this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender
    this._originalHook = original
    const prev = original.bind(this._scene)

    const hook: AnyCallable = (...args) => {
      prev(...args)
      const renderer = args[0] as RendererLike | undefined
      if (!renderer) return
      this._onAfterRender(renderer)
    }
    ;(this._scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = hook
  }

  private _onAfterRender(renderer: RendererLike): void {
    this._frame++

    // Hot-path cheap check: bail before any work if no one is listening.
    const wantsFrame = this._pings.isActive('stats:frame')
    const wantsGpu = this._pings.isActive('stats:gpu')
    if (!wantsFrame && !wantsGpu) return

    if (wantsFrame) {
      const render = renderer.info?.render
      const memory = renderer.info?.memory
      const payload: StatsFramePayload = {
        frame: this._frame,
        drawCalls: render?.drawCalls ?? 0,
        triangles: render?.triangles ?? 0,
        geometries: memory?.geometries ?? 0,
        textures: memory?.textures ?? 0,
        fps: this._fps,
      }
      this._post({ v: DEBUG_PROTOCOL_VERSION, type: 'stats:frame', payload })
    }

    if (wantsGpu) this._maybeResolveGpu(renderer)
  }

  private _maybeResolveGpu(renderer: RendererLike): void {
    // Detect once.
    if (!this._gpuChecked) {
      this._gpuChecked = true
      const backend = renderer.backend
      if (backend?.trackTimestamp === true) {
        const isWebGL = backend.constructor?.name === 'WebGLBackend'
        // WebGL2 needs `EXT_disjoint_timer_query_webgl2`; WebGPU
        // auto-downgrades trackTimestamp at init time.
        this._gpuCapable = !isWebGL || backend.disjoint != null
      }
    }
    if (!this._gpuCapable) return
    if (this._gpuResolveInFlight) return
    const fn = renderer.resolveTimestampsAsync?.bind(renderer)
    if (!fn) return

    // Capture the frame number this resolve is for; the actual readback
    // arrives async, possibly several frames later.
    const frame = this._frame
    this._gpuResolveInFlight = true
    void Promise.resolve(fn('render'))
      .then(() => {
        this._gpuResolveInFlight = false
        const gpuMs = renderer.info?.render?.timestamp
        if (typeof gpuMs !== 'number' || gpuMs <= 0) return
        const payload: StatsGpuReadyPayload = { frame, gpuMs }
        this._post({ v: DEBUG_PROTOCOL_VERSION, type: 'stats:gpuReady', payload })
      })
      .catch(() => {
        this._gpuResolveInFlight = false
        // Transient readback failures are fine; we'll try again next frame.
      })
  }

  private _post(msg: DebugMessage): void {
    try {
      this._bus.postMessage(msg)
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }
}
