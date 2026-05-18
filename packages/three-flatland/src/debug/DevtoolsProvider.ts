import type { WebGPURenderer } from 'three/webgpu'
import type {
  BatchesPayload,
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
import type { RegistryData } from '../ecs/batchUtils'
import { SubscriberRegistry } from './SubscriberRegistry'
import { StatsCollector } from './StatsCollector'
import { EnvCollector } from './EnvCollector'
import { DebugRegistry } from './DebugRegistry'
import { DebugTextureRegistry } from './DebugTextureRegistry'
import { BatchCollector } from './BatchCollector'
import {
  _getBatchSources,
  _getMeshBatchSources,
  _setActiveBatchCollector,
  _setActiveRegistry,
  _setActiveTextureRegistry,
} from './debug-sink'
import { PERF_TRACK, perfMeasure } from './perf-track'
import type { BufferCursor } from './bus-pool'
import type { BusTransport } from './bus-transport'
import { createBusTransport } from './bus-transport'

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

  /**
   * Cached options — needed at `start()` time. The constructor only
   * stashes them; channels / transport / listeners aren't created until
   * `start()` runs. This is what makes the class safe to construct
   * speculatively (e.g. inside `Flatland`'s constructor, which R3F may
   * call for renders that get discarded).
   */
  private readonly _opts: { discoveryChannelName: string; dataChannelName: string }

  /** Bonjour channel — discovery traffic only (query/announce/gone). Lazy. */
  private _discoveryBus: BroadcastChannel | null = null
  /**
   * Per-provider data channel — named after `identity.id`. Used in
   * receive-only mode (subscribe/ack/unsubscribe in). Outbound data /
   * ping / subscribe:ack go through `_dataTransport` so the heavy
   * `data` packets can be offloaded to a worker. Lazy.
   */
  private _dataBus: BroadcastChannel | null = null
  /** Producer-side transport for outbound data-channel messages. Lazy. */
  private _dataTransport: BusTransport | null = null
  /**
   * Listener references kept so we can `removeEventListener` on dispose
   * — important because `BroadcastChannel.close()` doesn't always
   * detach pending callbacks in every runtime.
   */
  private _onDiscovery: ((ev: MessageEvent<DebugMessage>) => void) | null = null
  private _onData: ((ev: MessageEvent<DebugMessage>) => void) | null = null

  private _subs = new SubscriberRegistry()
  private _stats = new StatsCollector()
  private _env = new EnvCollector()
  private _registry = new DebugRegistry()
  private _textures = new DebugTextureRegistry()
  private _batches = new BatchCollector()

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
  /** Scratch batches payload reused across flushes. */
  private _batchesScratch: BatchesPayload = { frame: 0, passCount: 0, batchCount: 0 }

  /** Wall-clock time of the last outbound broadcast. */
  private _lastBroadcastAt = Date.now()

  /** Latest renderer seen during `endFrame` — cached so `_sendSubscribeAck` has something to read. */
  private _latestRenderer: WebGPURenderer | undefined

  /** Flush timer handle. Ticks every `STATS_BATCH_MS`. Null when not active. */
  private _flushTimer: ReturnType<typeof setInterval> | null = null
  /**
   * `true` between `start()` and `dispose()`. Pure-constructor instances
   * stay `false` until something explicitly activates them; per-frame
   * methods short-circuit while inactive so they're safe to call
   * speculatively.
   */
  private _active = false
  private _forceNextKeyFrame = false

  constructor(options: DevtoolsProviderOptions = {}) {
    const kind = options.kind ?? 'user'
    this.identity = {
      id: options.id ?? generateUuid(),
      name: options.name ?? (kind === 'system' ? 'flatland' : 'user'),
      kind,
    }

    this._opts = {
      discoveryChannelName: options.discoveryChannelName ?? DISCOVERY_CHANNEL,
      dataChannelName: providerChannelName(this.identity.id),
    }

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
    // No I/O, no listeners, no module-level sink registration, no
    // announce, no timer. All of that lives in `start()`.
  }

  /**
   * Activate the provider on the bus. Opens BroadcastChannels, registers
   * listeners + module-level debug sinks, announces our existence on
   * discovery, and starts the batched flush timer.
   *
   * Idempotent: a second call while already active is a no-op. Safe to
   * call after `dispose()` to re-activate (e.g. when a Flatland Object3D
   * is re-added to the scene graph).
   */
  start(): void {
    if (this._active) return
    this._active = true
    this._discoveryBus = new BroadcastChannel(this._opts.discoveryChannelName)
    this._dataBus = new BroadcastChannel(this._opts.dataChannelName)
    this._dataTransport = createBusTransport({ channelName: this._opts.dataChannelName })

    // Discovery bus: only query traffic reaches us here. Everything
    // else we send/receive on our own data channel.
    this._onDiscovery = (ev: MessageEvent<DebugMessage>) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return
      if (msg.type === 'provider:query') this._announce()
    }
    this._discoveryBus.addEventListener('message', this._onDiscovery)

    this._onData = (ev: MessageEvent<DebugMessage>) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return
      this._handleDataMessage(msg)
    }
    this._dataBus.addEventListener('message', this._onData)

    // Expose our registries to module-level sinks so engine code can
    // publish arrays / textures without a direct dependency on this class.
    _setActiveRegistry(this._registry)
    _setActiveTextureRegistry(this._textures)
    _setActiveBatchCollector(this._batches)

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
    if (!this._active) return
    this._latestRenderer = renderer
    this._stats.beginFrame(now, renderer as unknown as Parameters<StatsCollector['beginFrame']>[1])
    // Reset the per-frame pass / batch pools. Cheap — just resets
    // counters. When no consumer is subscribed `beginPass`/`endPass`
    // short-circuit so the pools never grow.
    this._batches.beginFrame()
    this._batches.setCapturing(this._subs.isActive('batches'))
    // Open the implicit "frame" root pass so hosts that don't call
    // `beginDebugPass` still get one totals row with the full frame's
    // renderer.info delta.
    this._batches.frameStart(renderer)
  }

  /**
   * Mark the end of a logical frame. Records the sample and drains the
   * GPU-timestamp query pool. Does NOT broadcast — batches are shipped
   * on the `_flush` interval, not per-frame.
   */
  /**
   * Snapshot the current `BatchRegistry` into the batches collector.
   * Called by the host engine (Flatland) once per frame after all
   * internal passes complete and the batch set is stable. No-op when
   * no consumer is subscribed to the `'batches'` feature.
   */
  captureBatches(registry: RegistryData): void {
    if (!this._active) return
    this._batches.captureBatches(registry)
  }

  endFrame(renderer: WebGPURenderer): void {
    if (!this._active) return
    this._latestRenderer = renderer
    this._stats.endFrame(renderer as unknown as Parameters<StatsCollector['endFrame']>[0])
    // Close the implicit "frame" root pass + pull the active-batches
    // snapshot from every registered source. Both short-circuit when
    // no consumer is subscribed to `'batches'`.
    this._batches.frameEnd(renderer)
    this._batches.captureAllSources(_getBatchSources(), _getMeshBatchSources())
    // Atomic publish — swaps the build pool into the published slot
    // so `drain` (and any flush landing between frames) reads a fully
    // committed snapshot, never half-built scratch.
    this._batches.commit()
    // Always drain the GPU-timestamp query pool when the renderer is
    // set up with `trackTimestamp: true`. No-op when the backend can't
    // do timestamps, so this is cheap when irrelevant.
    this._stats.maybeResolveGpu()

    // Kick texture readbacks NOW — the frame is fully rendered, so
    // the GPU copy captures consistent content. The flush timer just
    // ships whatever samples are cached; it never triggers readbacks.
    // Subscription map drives everything: entries absent from the map
    // cost zero (no readback, no scratch RT). When the UI collapses
    // all its panels the map is empty and readback is a one-line
    // short-circuit.
    if (this._subs.isActive('buffers')) {
      const subscription = this._subs.buffersSelection()
      if (subscription.size > 0) {
        this._textures.readbackAll(
          subscription,
          renderer as unknown as import('three/webgpu').WebGPURenderer,
        )
      }
    }
  }

  /**
   * Assemble and broadcast a batched `data` packet. Invoked by the
   * `STATS_BATCH_MS` interval. No-op when there are no subscribers or
   * no samples / env delta accumulated this window; idle pings keep
   * consumers aware that the server is alive.
   */
  private _flush(): void {
    if (!this._active) return
    const transport = this._dataTransport
    if (transport === null) return
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
    delete features.batches

    // Acquire a pool buffer up front; encoders write into it via the
    // cursor. Large tier covers the worst case (a buffer payload up to
    // 256×256×4 = 256 KB). If nothing actually gets encoded, we
    // release the buffer back to the pool unused.
    const poolBuf = transport.acquireLarge()
    const cursor: BufferCursor = { buffer: poolBuf, byteOffset: 0 }

    let anyFeature = false

    if (active.has('stats')) {
      const statsOut = this._statsScratch
      if (this._stats.drainBatch(statsOut, cursor)) {
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
      if (this._env.fillEnv(envOut, this._latestRenderer, this._stats.gpuCapable)) {
        features.env = envOut
        anyFeature = true
      }
    }

    if (active.has('batches')) {
      const batchesOut = this._batchesScratch
      if (this._batches.drain(batchesOut, this._stats.frame)) {
        features.batches = batchesOut
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
      if (this._registry.drain(regOut, selection, cursor)) {
        features.registry = regOut
        anyFeature = true
      }
    }

    if (active.has('buffers')) {
      const subscription = this._subs.buffersSelection()

      const bufOut = this._buffersScratch
      if (this._textures.drain(bufOut, subscription, this._latestRenderer, cursor)) {
        features.buffers = bufOut
        anyFeature = true
        // Route every buffer's raw pixels through __convert__ on the
        // worker. The worker converts to RGBA8 and either feeds the
        // VP9 stream encoder (when the subscription said `mode: 'stream'`
        // and codecs are available) or broadcasts as buffer:raw (for
        // thumbnail mode, or as a stream fallback). Metadata stays in
        // the data batch so the consumer can update sidebar/labels.
        if (bufOut.entries) {
          const forceKey = this._forceNextKeyFrame
          this._forceNextKeyFrame = false
          for (const name in bufOut.entries) {
            const entry = bufOut.entries[name]
            if (!entry || !entry.pixels) continue
            const sub = subscription.get(name)
            const useStream =
              sub?.mode === 'stream' && transport.codecSupported === true
            const pixels = entry.pixels
            const convBuf = transport.acquireLarge()
            if (pixels instanceof Uint8Array) {
              new Uint8Array(convBuf).set(pixels)
            } else {
              new Uint8Array(convBuf).set(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength))
            }
            transport.convert({
              name,
              width: entry.width,
              height: entry.height,
              pixelType: entry.pixelType,
              display: entry.display ?? 'colors',
              frame: this._stats.frame,
              stream: useStream,
              forceKeyFrame: forceKey,
              pixels: convBuf,
              pixelsByteLength: pixels.byteLength,
            }, convBuf)
            delete entry.pixels
          }
        }
      }
    }

    if (!anyFeature) {
      // Nothing got written into the pool buffer — return it.
      transport.releaseUnused(poolBuf)
      this._maybeIdlePing()
      return
    }

    ;(msg.payload as DataPayload).frame = this._stats.frame
    stampMessage(msg)
    // The transport ships the message + transfers `poolBuf` to the
    // worker (when worker is available). The worker calls
    // `bc.postMessage(msg)` — which `structuredSerialize`s the
    // typed-array bytes synchronously into BC delivery queues — then
    // bounces `poolBuf` back to the producer's pool. Render thread
    // pays only the typed-array memcpy + one `port.postMessage`.
    transport.post(msg, [poolBuf])
    this._lastBroadcastAt = Date.now()
    // Per-flush CPU cost on the Devtools track. Pairs with the
    // consumer-side `bus:*` spans on the same track so a flush and
    // its delivery show up next to each other under the
    // `three-flatland` group.
    perfMeasure(PERF_TRACK.Devtools, 'flush', flushStart, performance.now(), 'warning')
  }

  /**
   * `true` when the provider is NOT currently active on the bus —
   * either because `start()` was never called, or because `dispose()`
   * has been called since the last `start()`. After `dispose()` the
   * instance can be re-activated by calling `start()` again.
   */
  get disposed(): boolean {
    return !this._active
  }

  /**
   * Release bus resources: closes both channels, stops the flush
   * timer, clears module-level sinks, broadcasts `provider:gone`.
   * Idempotent. After this returns the instance is dormant but
   * reusable — call `start()` to bring it back online.
   */
  dispose(): void {
    if (!this._active) return
    this._active = false
    if (this._flushTimer !== null) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
    // Tell consumers we're leaving so they can drop us from their
    // known-provider map and fall back to another option.
    try {
      this._discoveryBus?.postMessage(
        stampMessage({
          type: 'provider:gone',
          payload: { id: this.identity.id },
        }),
      )
    } catch { /* bus may already be closing */ }
    if (this._discoveryBus !== null && this._onDiscovery !== null) {
      this._discoveryBus.removeEventListener('message', this._onDiscovery)
    }
    if (this._dataBus !== null && this._onData !== null) {
      this._dataBus.removeEventListener('message', this._onData)
    }
    this._onDiscovery = null
    this._onData = null
    this._stats.dispose()
    this._registry.dispose()
    this._textures.dispose()
    this._batches.dispose()
    _setActiveRegistry(null)
    _setActiveTextureRegistry(null)
    _setActiveBatchCollector(null)
    this._subs.dispose()
    this._dataTransport?.dispose()
    this._dataTransport = null
    try { this._dataBus?.close() } catch { /* noop */ }
    try { this._discoveryBus?.close() } catch { /* noop */ }
    this._dataBus = null
    this._discoveryBus = null
    this._latestRenderer = undefined
  }

  // ── Introspection (useful for tests / advanced integrations) ────────────

  /**
   * The per-provider data channel. Exposed for test harnesses. `null`
   * before `start()` or after `dispose()`.
   */
  get bus(): BroadcastChannel | null { return this._dataBus }
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
        // Force a keyframe on the next stream frame if any entry in the
        // new subscription asks for stream mode — otherwise the consumer
        // decoder won't be able to decode until the next scheduled key.
        if (msg.payload.buffers !== undefined) {
          for (const entry of Object.values(msg.payload.buffers)) {
            if (entry.mode === 'stream') {
              this._forceNextKeyFrame = true
              break
            }
          }
        }
        // Late-joining consumers: reset per-feature delta trackers so
        // the next `data` packet carries a full snapshot.
        this._stats.resetDelta()
        this._env.resetDelta()
        this._registry.resetDelta()
        this._textures.resetDelta()
        this._batches.resetDelta()
        this._batches.setCapturing(this._subs.isActive('batches'))
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
    if (this._discoveryBus === null) return
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
    if (this._dataTransport === null) return
    const r = this._latestRenderer as unknown as Parameters<typeof this._env.snapshot>[0]
    const gpuVerified = this._stats.gpuCapable
    const env = this._env.snapshot(r, gpuVerified)
    this._env.recordSnapshotAsPrev(r, gpuVerified)

    const echoed = this._subs.featuresFor(id) ?? []
    this._dataTransport.post(stampMessage({
      type: 'subscribe:ack',
      payload: { id, features: Array.from(echoed), env },
    }))
  }

  /**
   * If no `data` packet has been sent in `IDLE_PING_MS`, broadcast a
   * `ping` on our data channel so consumers know we're alive during
   * quiet periods.
   */
  private _maybeIdlePing(): void {
    if (this._dataTransport === null) return
    if (Date.now() - this._lastBroadcastAt < IDLE_PING_MS) return
    const msg = this._pingScratch
    stampMessage(msg)
    this._dataTransport.post(msg)
    this._lastBroadcastAt = Date.now()
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
