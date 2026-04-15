import type { WebGPURenderer } from 'three/webgpu'
import type {
  BuffersPayload,
  DataPayload,
  DebugFeature,
  DebugMessage,
  EnvPayload,
  ProviderIdentity,
  ProviderKind,
  RegistryPayload,
  StatsPayload,
} from '../debug-protocol'
import { DISCOVERY_CHANNEL, IDLE_PING_MS, STATS_BATCH_MS, providerChannelName, stampMessage } from '../debug-protocol'
import { SubscriberRegistry } from './SubscriberRegistry'
import { StatsCollector } from './StatsCollector'
import { EnvCollector } from './EnvCollector'
import { DebugRegistry } from './DebugRegistry'
import { DebugTextureRegistry } from './DebugTextureRegistry'
import { _setActiveRegistry, _setActiveTextureRegistry } from './debug-sink'
import { PERF_TRACK, perfMeasure } from './perf-track'

export interface DevtoolsProviderOptions {
  /** Human-readable name shown in the consumer UI. */
  name?: string
  /** Explicit provider UUID. Default: auto-generated. */
  id?: string
  /**
   * Override the discovery (bonjour) channel name. Rarely needed — the
   * default `DISCOVERY_CHANNEL` is what every consumer uses. Providing a
   * custom value only makes sense if you're running multiple isolated
   * devtools sessions in the same origin (e.g. tests).
   */
  discoveryChannelName?: string
  /** Provider kind. Default: `'user'`. */
  kind?: ProviderKind
}

/**
 * Devtools producer — owns the BroadcastChannel, subscriber registry,
 * stats + env collectors, and the per-tick packet-building logic.
 *
 * Intended to be used two ways:
 *
 * 1. **Composed inside `Flatland`** — Flatland constructs one when the
 *    `DEVTOOLS_BUNDLED` build-gate + `isDevtoolsActive()` runtime-gate
 *    are both true, and calls `beginFrame()` / `endFrame()` around
 *    its `render()` body. Host consumers don't have to know devtools
 *    exist.
 *
 * 2. **Standalone** — a bare three.js app (no Flatland, or a different
 *    engine) can instantiate `DevtoolsProvider` and call
 *    `beginFrame(now)` / `endFrame(renderer)` around its rAF tick (or
 *    around each `renderer.render()` call if the app has only one).
 *    Standard bus protocol; any consumer that knows the protocol
 *    works the same.
 *
 * ## Timing
 *
 * Explicit begin/end boundaries, not scene hooks. Engines that do
 * multiple internal `renderer.render()` calls per logical frame (SDF
 * pass, occlusion pass, main render, post-processing) would count
 * each internal pass as a separate "frame" if we hooked
 * `scene.onAfterRender` — FPS misreports as a multiple of the real
 * rate, and per-render stats don't aggregate. The begin/end approach
 * lets the caller define the true frame boundary.
 *
 *   - `cpuMs` = `endFrame` - `beginFrame` (full frame CPU cost)
 *   - FPS = interval between consecutive `endFrame` calls
 *   - `drawCalls` / `triangles` = `renderer.info.render` delta between
 *     begin and end, aggregating across all internal render passes
 *     during the frame
 *
 * For multi-scene apps, call begin/end around the whole rAF tick and
 * `renderer.info.render` accumulates across every scene's render.
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
export class DevtoolsProvider {
  readonly identity: ProviderIdentity

  /** Bonjour channel — discovery traffic only (query/announce/gone). */
  private _discoveryBus: BroadcastChannel
  /** Per-provider data channel — named after `identity.id`. Carries subscribe/ack/data/ping. */
  private _dataBus: BroadcastChannel
  private _subs = new SubscriberRegistry()
  private _stats = new StatsCollector()
  private _env = new EnvCollector()
  private _registry = new DebugRegistry()
  private _textures = new DebugTextureRegistry()

  /** Scratch `data` message. Reused across flushes; features reassigned each tick. */
  private _dataScratch: DebugMessage
  /** Scratch envelope for idle `ping` broadcasts. */
  private _pingScratch: DebugMessage
  /** Scratch env payload reused across flushes. */
  private _envScratch: EnvPayload = {}
  /** Scratch stats payload reused across flushes; fields reassigned each drain. */
  private _statsScratch: StatsPayload = { startFrame: 0, count: 0 }
  /** Scratch registry payload reused across flushes. */
  private _registryScratch: RegistryPayload = {}
  /** Scratch buffers payload reused across flushes. */
  private _buffersScratch: BuffersPayload = {}

  /** Wall-clock time of the last outbound broadcast. */
  private _lastBroadcastAt = Date.now()

  /** Latest renderer seen during `endFrame` — cached so `_sendSubscribeAck` has something to read. */
  private _latestRenderer: WebGPURenderer | undefined

  /** Flush timer handle. Ticks every `STATS_BATCH_MS`. */
  private _flushTimer: ReturnType<typeof setInterval>
  private _disposed = false

  constructor(options: DevtoolsProviderOptions = {}) {
    const kind = options.kind ?? 'user'
    this.identity = {
      id: options.id ?? generateUuid(),
      name: options.name ?? (kind === 'system' ? 'flatland' : 'user'),
      kind,
    }

    const discoveryName = options.discoveryChannelName ?? DISCOVERY_CHANNEL
    this._discoveryBus = new BroadcastChannel(discoveryName)
    this._dataBus = new BroadcastChannel(providerChannelName(this.identity.id))

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

    // Discovery bus: only query traffic reaches us here. Everything
    // else we send/receive on our own data channel.
    this._discoveryBus.addEventListener('message', (ev: MessageEvent<DebugMessage>) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return
      if (msg.type === 'provider:query') this._announce()
    })

    this._dataBus.addEventListener('message', (ev: MessageEvent<DebugMessage>) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return
      this._handleDataMessage(msg)
    })

    // Expose our registries to module-level sinks so engine code can
    // publish arrays / textures without a direct dependency on this class.
    _setActiveRegistry(this._registry)
    _setActiveTextureRegistry(this._textures)

    // Announce ourselves in case a client is already listening (the
    // client will also `provider:query` on its own start, so discovery
    // works from either side).
    this._announce()

    this._flushTimer = setInterval(() => this._flush(), STATS_BATCH_MS)
  }

  /**
   * Mark the start of a logical frame. Call before any
   * `renderer.render()` for this frame. `now` should be
   * `performance.now()`.
   */
  beginFrame(now: number, renderer: WebGPURenderer): void {
    this._latestRenderer = renderer
    this._stats.beginFrame(now, renderer as unknown as Parameters<StatsCollector['beginFrame']>[1])
  }

  /**
   * Mark the end of a logical frame. Records the sample and drains the
   * GPU-timestamp query pool. Does NOT broadcast — batches are shipped
   * on the `_flush` interval, not per-frame.
   */
  endFrame(renderer: WebGPURenderer): void {
    this._latestRenderer = renderer
    this._stats.endFrame(renderer as unknown as Parameters<StatsCollector['endFrame']>[0])
    // Always drain the GPU-timestamp query pool when the renderer is
    // set up with `trackTimestamp: true`. No-op when the backend can't
    // do timestamps, so this is cheap when irrelevant.
    this._stats.maybeResolveGpu()
  }

  /**
   * Assemble and broadcast a batched `data` packet. Invoked by the
   * `STATS_BATCH_MS` interval. No-op when there are no subscribers or
   * no samples / env delta accumulated this window; idle pings keep
   * consumers aware that the server is alive.
   */
  private _flush(): void {
    if (this._disposed) return
    const flushStart = performance.now()
    this._subs.pruneStale()
    if (this._subs.size() === 0) return

    const active = this._subs.active()
    if (active.size === 0) return

    const msg = this._dataScratch
    const features = (msg.payload as DataPayload).features

    delete features.stats
    delete features.env
    delete features.buffers
    delete features.registry

    let anyFeature = false

    if (active.has('stats')) {
      const statsOut = this._statsScratch
      if (this._stats.drainBatch(statsOut)) {
        features.stats = statsOut
        anyFeature = true
      }
    }

    if (active.has('env') && this._latestRenderer !== undefined) {
      const envOut = this._envScratch
      delete envOut.threeFlatlandVersion
      delete envOut.threeRevision
      delete envOut.backend
      delete envOut.canvas
      if (this._env.fillEnv(envOut, this._latestRenderer)) {
        features.env = envOut
        anyFeature = true
      }
    }

    if (active.has('registry')) {
      // Union selection across all consumers — `null` means everyone
      // wants everything; a set means only those names get their
      // sample; an empty set means nobody wants samples right now
      // (metadata still ships so the pane's picker UI stays populated).
      const selection = this._subs.registrySelection()
      const regOut = this._registryScratch
      if (this._registry.drain(regOut, selection)) {
        features.registry = regOut
        anyFeature = true
      }
    }

    if (active.has('buffers')) {
      const selection = this._subs.buffersSelection()
      const bufOut = this._buffersScratch
      if (this._textures.drain(bufOut, selection, this._latestRenderer)) {
        features.buffers = bufOut
        anyFeature = true
      }
    }

    if (!anyFeature) {
      this._maybeIdlePing()
      return
    }

    ;(msg.payload as DataPayload).frame = this._stats.frame
    stampMessage(msg)
    try {
      this._dataBus.postMessage(msg)
      this._lastBroadcastAt = Date.now()
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
    // Per-flush CPU cost on the Devtools track. Pairs with the
    // consumer-side `bus:*` spans on the same track so a flush and
    // its delivery show up next to each other under the
    // `three-flatland` group.
    perfMeasure(PERF_TRACK.Devtools, 'flush', flushStart, performance.now(), 'warning')
  }

  /**
   * Tear down everything: closes both channels, clears subscriber state.
   * Idempotent.
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    clearInterval(this._flushTimer)
    // Tell consumers we're leaving so they can drop us from their
    // known-provider map and fall back to another option.
    try {
      this._discoveryBus.postMessage(
        stampMessage({
          type: 'provider:gone',
          payload: { id: this.identity.id },
        }),
      )
    } catch { /* bus may already be closing */ }
    this._stats.dispose()
    this._registry.dispose()
    this._textures.dispose()
    _setActiveRegistry(null)
    _setActiveTextureRegistry(null)
    this._subs.dispose()
    try { this._dataBus.close() } catch { /* noop */ }
    try { this._discoveryBus.close() } catch { /* noop */ }
    this._latestRenderer = undefined
  }

  // ── Introspection (useful for tests / advanced integrations) ────────────

  /** The per-provider data channel. Exposed for test harnesses. */
  get bus(): BroadcastChannel { return this._dataBus }
  /** The current subscriber registry. Read-only view. */
  get subscribers(): SubscriberRegistry { return this._subs }
  /** Current engine frame counter. */
  get frame(): number { return this._stats.frame }
  /**
   * Debug registry — register CPU arrays here to expose them to the
   * pane. Entries only cost wire bytes when subscribers include
   * `registry` in their feature set, so it's safe to leave permanently
   * registered from engine code.
   */
  get registry(): DebugRegistry { return this._registry }

  // ── Bus message routing ─────────────────────────────────────────────────

  /**
   * Handler for the per-provider data channel — all traffic here is
   * already implicitly addressed to us, so no per-message `providerId`
   * filtering is needed.
   */
  private _handleDataMessage(msg: DebugMessage): void {
    switch (msg.type) {
      case 'subscribe': {
        this._subs.onSubscribe(
          msg.payload.id,
          msg.payload.features,
          msg.payload.registry,
          msg.payload.buffers,
        )
        // Late-joining consumers: reset per-feature delta trackers so
        // the next `data` packet carries a full snapshot.
        this._stats.resetDelta()
        this._env.resetDelta()
        this._registry.resetDelta()
        this._textures.resetDelta()
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
      default:
        // Echoes of our own sends (data / ping / subscribe:ack) and any
        // stray messages aren't self-handled.
        break
    }
  }

  private _announce(): void {
    try {
      this._discoveryBus.postMessage(
        stampMessage({
          type: 'provider:announce',
          payload: { identity: this.identity },
        }),
      )
    } catch {
      // Bus may be closing.
    }
  }

  private _sendSubscribeAck(id: string, _requested: readonly DebugFeature[]): void {
    const r = this._latestRenderer as unknown as Parameters<typeof this._env.snapshot>[0]
    const env = this._env.snapshot(r)
    this._env.recordSnapshotAsPrev(r)

    const echoed = this._subs.featuresFor(id) ?? []
    try {
      this._dataBus.postMessage(
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
   * `ping` on our data channel so consumers know we're alive during
   * quiet periods.
   */
  private _maybeIdlePing(): void {
    if (Date.now() - this._lastBroadcastAt < IDLE_PING_MS) return
    const msg = this._pingScratch
    stampMessage(msg)
    try {
      this._dataBus.postMessage(msg)
      this._lastBroadcastAt = Date.now()
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }
}

/** UUID v4 for provider ids. Matches the consumer-side helper. */
function generateUuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}
