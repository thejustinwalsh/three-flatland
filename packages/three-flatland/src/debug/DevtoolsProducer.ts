import type { Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { DataPayload, DebugFeature, DebugMessage, EnvPayload, StatsPayload } from '../debug-protocol'
import { DEBUG_CHANNEL, IDLE_PING_MS, stampMessage } from '../debug-protocol'
import { SubscriberRegistry } from './SubscriberRegistry'
import { StatsCollector } from './StatsCollector'
import { EnvCollector } from './EnvCollector'

/** Construction options for `DevtoolsProducer`. */
export interface DevtoolsProducerOptions {
  /** The `Scene` the engine renders into. `StatsCollector` hooks `scene.onAfterRender` on it to track frame counts. */
  scene: Scene
  /**
   * Channel name for the `BroadcastChannel`. Override when you want to
   * run multiple isolated devtools sessions in the same origin (e.g.
   * for tests). Defaults to `DEBUG_CHANNEL` so standard consumers just
   * work.
   */
  channelName?: string
}

/**
 * Devtools producer — owns the BroadcastChannel, subscriber registry,
 * stats + env collectors, and the per-tick packet-building logic.
 *
 * Intended to be used two ways:
 *
 * 1. **Composed inside `Flatland`** — Flatland constructs one when the
 *    `DEVTOOLS_BUNDLED` build-gate + `isDevtoolsActive()` runtime-gate
 *    are both true. Nothing else to do — the producer self-fires
 *    `send()` from `scene.onAfterRender`. Host consumers don't have
 *    to know devtools exist.
 *
 * 2. **Standalone** — a bare three.js app (no Flatland, or a different
 *    engine) can instantiate `DevtoolsProducer` directly with its
 *    `scene`. Same deal: `send()` fires automatically from the scene
 *    hook; call `dispose()` on teardown. Advanced use cases
 *    (multi-scene bundling, headless tests, non-standard render loops)
 *    can call `setAutoSend(false)` and invoke `send(renderer)`
 *    manually instead. Standard bus protocol; any consumer that knows
 *    the protocol (tweakpane devtools panel, pop-out debugger, remote
 *    adapter) works the same.
 *
 * ## Timing
 *
 * `StatsCollector` hooks `scene.onBeforeRender` + `scene.onAfterRender`
 * on the scene passed in. These bracket the actual three.js
 * `renderer.render()` call, so:
 *   - `cpuMs` measures real three.js render time (not wrapper overhead)
 *   - FPS is derived from the interval between consecutive
 *     `onAfterRender` fires — the true render cadence, regardless of
 *     whether the caller is Flatland or a bare `renderer.render()`
 *   - Frame counter increments per `renderer.render()` call
 *
 * **Multi-scene caveat**: three.js has no clean renderer-level
 * per-frame hook. The scene hooks fire per `renderer.render(scene, ...)`
 * call, not per user-frame. Apps that render multiple scenes per frame
 * (main scene + UI overlay scene + debug scene) will see each as its
 * own "frame" in these stats. If that matters, we'll add a manual
 * `frameBegin`/`frameEnd` mode later that lets the caller define the
 * real frame boundary. For v1 we ship the single-scene auto path.
 *
 * ## Hot path
 *
 * Zero-allocation past construction — scratch message objects are
 * mutated in place; `structuredClone` inside `postMessage` gives
 * consumers their own copy, so the producer can keep reusing its
 * scratch on the next tick.
 *
 * ## Liveness
 *
 * Emits a `ping` broadcast if no `data` packet has been sent within
 * `IDLE_PING_MS`. Pure liveness signal — consumers treat any server
 * message (`data` / `ping` / `subscribe:ack`) as proof-of-life.
 */
export class DevtoolsProducer {
  private _bus: BroadcastChannel
  private _subs: SubscriberRegistry
  private _stats: StatsCollector
  private _env: EnvCollector

  /** Scratch `data` message reused every tick. */
  private _dataScratch: DebugMessage
  /** Scratch envelope for idle `ping` broadcasts. */
  private _pingScratch: DebugMessage
  /** Scratch feature payloads, referenced from `_dataScratch.payload.features`. */
  private _statsScratch: StatsPayload = {}
  private _envScratch: EnvPayload = {}

  /** Wall-clock time (`Date.now()`) of the last outbound broadcast (`data` or `ping`). */
  private _lastBroadcastAt: number

  /** Latest renderer seen during `endFrame` — cached so `_sendSubscribeAck` can use it without another argument. */
  private _latestRenderer: WebGPURenderer | undefined

  constructor(options: DevtoolsProducerOptions) {
    const channel = options.channelName ?? DEBUG_CHANNEL
    this._bus = new BroadcastChannel(channel)
    this._subs = new SubscriberRegistry()
    this._stats = new StatsCollector(options.scene)
    this._env = new EnvCollector()

    // Auto-fire `send()` from inside StatsCollector's onAfterRender
    // hook. Same hook that captures stats flushes the packet, so there's
    // no gap between "frame ended" and "packet emitted". Users who want
    // manual control over when packets go out can call `setAutoSend(false)`
    // and drive `send(renderer)` themselves.
    this._stats.setOnFrameEnd((renderer) => {
      this.send(renderer as unknown as WebGPURenderer)
    })

    this._dataScratch = {
      v: 1,
      ts: 0,
      type: 'data',
      payload: { frame: 0, features: {} },
    }
    this._pingScratch = {
      v: 1,
      ts: 0,
      type: 'ping',
      payload: {},
    }
    this._lastBroadcastAt = Date.now()

    this._bus.addEventListener('message', (ev: MessageEvent<DebugMessage>) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return
      this._handleBusMessage(msg)
    })
  }

  /**
   * Per-frame work: schedule async GPU resolve, prune stale consumers,
   * build + emit a delta-encoded `data` packet (or idle `ping`).
   *
   * By default this is **fired automatically** from inside
   * `scene.onAfterRender` — callers don't need to invoke it. Exposed
   * publicly for advanced use cases:
   *   - Multi-scene apps that want to bundle N renders into one
   *     packet (disable auto-fire via `setAutoSend(false)`, then
   *     call `send(renderer)` yourself at the real frame boundary).
   *   - Headless tests that pump renders manually.
   *
   * `renderer` is cached for `subscribe:ack` env bootstrap on future
   * subscribes.
   */
  send(renderer: WebGPURenderer): void {
    this._latestRenderer = renderer

    // Schedule async GPU-timestamp resolve only when someone's watching
    // `stats`. Cheap no-op when backend doesn't support timestamps.
    if (this._subs.isActive('stats')) this._stats.maybeResolveGpu()

    this._subs.pruneStale()
    if (this._subs.size() === 0) return

    const active = this._subs.active()
    if (active.size === 0) return

    const msg = this._dataScratch
    const features = (msg.payload as DataPayload).features

    // Delete (not set-to-undefined) absent slots so `structuredClone`
    // emits truly absent keys, not `{ field: undefined }` noise.
    delete features.stats
    delete features.env
    delete features['atlas:tick']
    delete features['atlas:fullscreen']
    delete features.registry

    let anyFeature = false

    if (active.has('stats')) {
      const statsOut = this._statsScratch
      if (this._stats.fillStats(statsOut)) {
        features.stats = statsOut
        anyFeature = true
      }
    }

    if (active.has('env')) {
      const envOut = this._envScratch
      delete envOut.threeFlatlandVersion
      delete envOut.threeRevision
      delete envOut.backend
      delete envOut.canvas
      if (this._env.fillEnv(envOut, renderer)) {
        features.env = envOut
        anyFeature = true
      }
    }

    // atlas:* and registry feature slots are hooked up in later phases.

    if (!anyFeature) {
      this._maybeIdlePing()
      return
    }

    ;(msg.payload as DataPayload).frame = this._stats.frame
    stampMessage(msg)
    try {
      this._bus.postMessage(msg)
      this._lastBroadcastAt = Date.now()
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }

  /**
   * Enable or disable auto-fire of `send()` from `scene.onAfterRender`.
   * Default: enabled. Disable when you want to manually drive packet
   * emit (e.g., multi-scene bundling, headless tests, non-standard
   * render loops).
   */
  setAutoSend(enabled: boolean): void {
    if (enabled) {
      this._stats.setOnFrameEnd((renderer) => {
        this.send(renderer as unknown as WebGPURenderer)
      })
    } else {
      this._stats.setOnFrameEnd(null)
    }
  }

  /**
   * Tear down everything: stops the `scene.onAfterRender` hook, closes
   * the BroadcastChannel, clears subscriber state. Idempotent.
   */
  dispose(): void {
    this._stats.dispose()
    this._subs.dispose()
    try { this._bus.close() } catch { /* noop */ }
    this._latestRenderer = undefined
  }

  // ── Introspection (useful for tests / advanced integrations) ────────────

  /** The underlying BroadcastChannel. Exposed for test harnesses. */
  get bus(): BroadcastChannel { return this._bus }
  /** The current subscriber registry. Read-only view. */
  get subscribers(): SubscriberRegistry { return this._subs }
  /** Current engine frame counter. */
  get frame(): number { return this._stats.frame }

  // ── Bus message routing ─────────────────────────────────────────────────

  private _handleBusMessage(msg: DebugMessage): void {
    switch (msg.type) {
      case 'subscribe': {
        this._subs.onSubscribe(msg.payload.id, msg.payload.features)
        // Late-joining consumers: reset per-feature delta trackers so
        // the next `data` packet carries a full snapshot.
        this._stats.resetDelta()
        this._env.resetDelta()
        this._sendSubscribeAck(msg.payload.id, msg.payload.features)
        break
      }
      case 'ack': {
        this._subs.onAck(msg.payload.id)
        break
      }
      case 'unsubscribe': {
        this._subs.onUnsubscribe(msg.payload.id)
        break
      }
      // All other types are either server-emitted (we sent them, no
      // self-handling needed) or consumer-to-consumer RPCs that the
      // server deliberately ignores.
      default:
        break
    }
  }

  private _sendSubscribeAck(id: string, _requested: readonly DebugFeature[]): void {
    // `WebGPURenderer` is structurally compatible with EnvCollector's
    // `RendererLike` (has `backend`, `getSize(Vector2)`, `getPixelRatio()`).
    // The opaque `unknown` cast satisfies TS without narrowing; runtime
    // access in EnvCollector is defensive against all shapes.
    const r = this._latestRenderer as unknown as Parameters<typeof this._env.snapshot>[0]
    const env = this._env.snapshot(r)
    this._env.recordSnapshotAsPrev(r)

    const echoed = this._subs.featuresFor(id) ?? []
    try {
      this._bus.postMessage(
        stampMessage({
          type: 'subscribe:ack',
          payload: { id, features: Array.from(echoed), env },
        }),
      )
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }

  /**
   * If no `data` packet has been sent in `IDLE_PING_MS`, broadcast a
   * `ping` so consumers know the server is alive during quiet periods.
   * No-op if we've broadcast recently.
   */
  private _maybeIdlePing(): void {
    if (Date.now() - this._lastBroadcastAt < IDLE_PING_MS) return
    const msg = this._pingScratch
    stampMessage(msg)
    try {
      this._bus.postMessage(msg)
      this._lastBroadcastAt = Date.now()
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }
}
