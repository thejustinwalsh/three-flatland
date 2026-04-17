import type {
  BufferChunkPayload,
  BufferDelta,
  BufferDisplayMode,
  BuffersPayload,
  DebugFeature,
  DebugMessage,
  EnvPayload,
  ProviderIdentity,
  RegistryEntryDelta,
  RegistryEntryKind,
  RegistryPayload,
  StatsPayload,
  TexturePixelType,
} from 'three-flatland/debug-protocol'
import {
  ACK_INTERVAL_MS,
  DEBUG_PROTOCOL_VERSION,
  DISCOVERY_CHANNEL,
  SERVER_LIVENESS_MS,
  providerChannelName,
} from 'three-flatland/debug-protocol'
import { tracePerf } from './perf-trace.js'

/**
 * Construction options for `DevtoolsClient`.
 */
export interface DevtoolsClientOptions {
  /** Features to subscribe to. */
  features: DebugFeature[]
  /**
   * Override the discovery (bonjour) channel name. Rarely needed — only
   * for isolated test sessions.
   */
  discoveryChannelName?: string
  /**
   * Optional first listener, equivalent to calling `addListener(cb)`
   * after construction.
   */
  onChange?: (state: DevtoolsState) => void
}

/** Listener signature for `DevtoolsClient.addListener`. */
export type DevtoolsStateListener = (state: DevtoolsState) => void

/** Listener for incoming WebCodecs buffer chunks. */
export type { BufferChunkPayload }
export type BufferChunkListener = (chunk: BufferChunkPayload) => void

/**
 * Discovery retry backoff. Starts at `QUERY_RETRY_MIN_MS`, doubles each
 * attempt, caps at `QUERY_RETRY_MAX_MS`, and gives up after `QUERY_MAX_RETRIES`
 * total tries. After giving up, a provider that comes online later will
 * still wire us up via its own startup `provider:announce`.
 */
const QUERY_RETRY_MIN_MS = 500
const QUERY_RETRY_MAX_MS = 5000
const QUERY_MAX_RETRIES = 10

/**
 * Size of the client-side decoded series rings. Sized generously so the
 * graph (default 80-sample window) has plenty of history at 60 Hz
 * regardless of batch timing.
 */
const CLIENT_SERIES_SIZE = 256

/** Shared zero-length placeholder used for metadata-only registry snapshots. */
const EMPTY_SAMPLE: Float32Array = new Float32Array(0)

/** Per-field time-series ring. */
export interface DevtoolsSeries {
  /** Pre-allocated Float32 buffer. Read via (write - i - 1 + size) % size. */
  readonly data: Float32Array
  /** Next write index. */
  write: number
  /** Valid sample count (<= size). */
  length: number
}

/**
 * Snapshot of a registered CPU array as seen by the client. The
 * `sample` typed array is owned by this object (structured-cloned from
 * the provider) — read-only by contract; don't mutate in place.
 */
export interface RegistryEntrySnapshot {
  name: string
  kind: RegistryEntryKind
  version: number
  count: number
  sample: Float32Array | Uint32Array | Int32Array
  label?: string
}

/** Snapshot of a registered debug buffer as seen by the client. */
export interface BufferSnapshot {
  name: string
  width: number
  height: number
  pixelType: TexturePixelType
  /** How the consumer should visualise this buffer (defaults applied by producer). */
  display: BufferDisplayMode
  version: number
  /** Latest CPU readback; `null` until the provider has served a sample. */
  pixels: Uint8Array | Float32Array | null
  label?: string
}

/**
 * Accumulated state the consumer keeps up-to-date by merging deltas
 * from `data` packets. Callers bind UI to this object and refresh
 * when `onChange` fires.
 *
 * All fields start `undefined`; the first `data` packet (or
 * `subscribe:ack.env` bootstrap) populates them. Subsequent deltas
 * overwrite specific fields; `null` on the wire clears a field back
 * to `undefined`.
 */
export interface DevtoolsState {
  /** Engine frame counter — last frame index covered by the latest batch. */
  frame?: number

  // --- Stats scalars — mean across the most recent batch window. --------
  // Naturally smoothed (roughly 500 ms of samples per batch); good for
  // text display. For per-frame granularity use `series.*` instead.
  drawCalls?: number
  triangles?: number
  /** Lines + points aggregated. */
  primitives?: number
  geometries?: number
  textures?: number
  cpuMs?: number
  fps?: number
  gpuMs?: number
  /** JS heap used, MB. `undefined` on Safari / Firefox. */
  heapUsedMB?: number
  /** JS heap limit, MB. Static per environment. */
  heapLimitMB?: number

  // --- Per-frame time series (decoded + de-scaled on arrival). -------------
  // Each ring is a Float32Array of `CLIENT_SERIES_SIZE` values. Read
  // most-recent-first via `(write - i - 1 + size) % size`.
  series: {
    fps: DevtoolsSeries
    cpuMs: DevtoolsSeries
    gpuMs: DevtoolsSeries
    heapUsedMB: DevtoolsSeries
    drawCalls: DevtoolsSeries
    triangles: DevtoolsSeries
    primitives: DevtoolsSeries
    geometries: DevtoolsSeries
    textures: DevtoolsSeries
  }

  // --- Env (merged from data.features.env + subscribe:ack.env bootstrap) ---
  threeFlatlandVersion?: string
  threeRevision?: string
  backendName?: string
  backendTrackTimestamp?: boolean
  backendDisjoint?: boolean | null
  gpuModeEnabled?: boolean
  canvasWidth?: number
  canvasHeight?: number
  canvasPixelRatio?: number

  // --- Registry (live CPU array readouts from the provider) --------------
  /**
   * Named CPU arrays the provider has registered. Entries update on the
   * `registry` feature of each data batch; keys are entry names, values
   * are the latest sample + metadata. Removed entries are pruned.
   */
  registry: Map<string, RegistryEntrySnapshot>

  /**
   * Named debug buffers — same lifecycle as `registry`, but backed by
   * periodic GPU readbacks through the `buffers` feature. `pixels` is
   * `null` until the provider has delivered a sample (metadata arrives
   * first so the UI can list the entry for selection).
   */
  buffers: Map<string, BufferSnapshot>

  // --- Provider selection ------------------------------------------------
  /** All providers currently announced on the bus (updated live). */
  providers: ProviderIdentity[]
  /** The provider this client is subscribed to. `null` until discovery picks one. */
  selectedProviderId: string | null

  // --- Liveness (client-tracked) -----------------------------------------
  /** Is the selected provider considered alive? False after `SERVER_LIVENESS_MS` silence. */
  serverAlive: boolean
  /** ms since the last message from the selected provider. */
  serverLagMs: number
}

/**
 * Bus consumer. One per viewing surface (tweakpane panel, pop-out
 * window, remote dashboard). Owns:
 *
 *   - A stable consumer id (UUID v4).
 *   - A `BroadcastChannel` subscription.
 *   - Accumulated `DevtoolsState` derived from `data` packet deltas.
 *   - Ack timer (1 s, starts on `subscribe:ack`).
 *   - Server-liveness monitor; re-subscribes if no server message
 *     within `SERVER_LIVENESS_MS`.
 *
 * Call `start()` to send the initial subscribe + begin timers.
 * `dispose()` sends unsubscribe, clears timers, closes the channel.
 */
export class DevtoolsClient {
  readonly id: string
  readonly state: DevtoolsState

  /** Shared discovery bus — carries query/announce/gone only. */
  private _discoveryBus: BroadcastChannel
  /** Per-provider data bus. Opened when we subscribe; closed on switch / gone. */
  private _dataBus: BroadcastChannel | null = null
  /** Bound handler for the current `_dataBus`. Tracked so we can detach on close. */
  private _dataHandler: ((ev: MessageEvent<DebugMessage>) => void) | null = null
  private _features: DebugFeature[]
  /**
   * Registry entry filter. `null` = all entries; `string[]` = only
   * these. Starts empty-array so providers don't drain (sometimes
   * expensive) registry payloads until the pane actually needs them.
   */
  private _registrySelection: string[] | null = []
  /** Buffer selection — same semantics as `_registrySelection`. */
  private _buffersSelection: string[] | null = []
  private _streamBuffers = false
  private _listeners = new Set<DevtoolsStateListener>()
  private _chunkListeners = new Set<BufferChunkListener>()

  private _ackTimer: ReturnType<typeof setInterval> | null = null
  private _livenessTimer: ReturnType<typeof setInterval> | null = null
  private _queryRetryTimer: ReturnType<typeof setTimeout> | null = null
  private _lastServerAt = 0
  private _subscribed = false
  private _disposed = false

  /** Known providers by id — updated live via `provider:announce` + `provider:gone`. */
  private _providers = new Map<string, ProviderIdentity>()

  constructor(options: DevtoolsClientOptions) {
    this.id = generateUuid()
    this._features = [...options.features]
    if (options.onChange) this._listeners.add(options.onChange)
    this._discoveryBus = new BroadcastChannel(options.discoveryChannelName ?? DISCOVERY_CHANNEL)
    const mkSeries = (): DevtoolsSeries => ({
      data: new Float32Array(CLIENT_SERIES_SIZE),
      write: 0,
      length: 0,
    })
    this.state = {
      series: {
        fps: mkSeries(),
        cpuMs: mkSeries(),
        gpuMs: mkSeries(),
        heapUsedMB: mkSeries(),
        drawCalls: mkSeries(),
        triangles: mkSeries(),
        primitives: mkSeries(),
        geometries: mkSeries(),
        textures: mkSeries(),
      },
      registry: new Map(),
      buffers: new Map(),
      providers: [],
      selectedProviderId: null,
      serverAlive: false,
      serverLagMs: 0,
    }

    // Discovery handler — only processes provider:announce / provider:gone.
    this._discoveryBus.addEventListener('message', (ev: MessageEvent<DebugMessage>) => {
      this._onDiscoveryMessage(ev.data)
    })
  }

  /**
   * Begin discovery + subscription. Sends a `provider:query`, waits
   * `DISCOVERY_WINDOW_MS` for `provider:announce` responses, then picks
   * the best provider (user > system) and subscribes to it.
   *
   * Idempotent — calling again while already started is a no-op.
   */
  start(): void {
    if (this._disposed || this._subscribed) return
    this._subscribed = true

    // Broadcast who we are and ask providers to announce. First announce
    // received triggers subscribe directly from the message handler —
    // no fixed window. If no provider is up yet (or our query/their
    // announce was lost), retry with exponential backoff up to
    // `QUERY_MAX_RETRIES` tries. After we give up, a provider that
    // starts later will announce on its own construct, wiring us up
    // without further polling.
    this._sendQuery()
    let retries = 0
    let nextDelay = QUERY_RETRY_MIN_MS
    const tick = () => {
      if (this._disposed || this.state.selectedProviderId !== null) {
        this._queryRetryTimer = null
        return
      }
      if (retries >= QUERY_MAX_RETRIES) {
        this._queryRetryTimer = null
        return
      }
      retries++
      this._sendQuery()
      nextDelay = Math.min(nextDelay * 2, QUERY_RETRY_MAX_MS)
      this._queryRetryTimer = setTimeout(tick, nextDelay)
    }
    this._queryRetryTimer = setTimeout(tick, nextDelay)

    // Liveness watcher — fires every second, flips serverAlive false and
    // re-subscribes if we've gone silent past the grace window.
    this._livenessTimer = setInterval(() => this._checkLiveness(), 1000)
  }

  private _sendQuery(): void {
    this._postDiscovery({
      type: 'provider:query',
      payload: { requesterId: this.id },
    })
  }

  /**
   * Update the feature set. Re-posts `subscribe` on the current
   * provider's data channel.
   */
  setFeatures(features: DebugFeature[]): void {
    if (sameSet(this._features, features)) return
    this._features = [...features]
    this._resubscribe()
  }

  /**
   * Update the registry entry filter. Pass `null` for "every entry",
   * `[]` to stop all registry traffic, or a list of names to narrow.
   * Re-posts `subscribe` if the filter actually changed.
   */
  /**
   * Narrow which registry entries the provider should ship samples
   * for. `null` = all entries; `[]` = none; `[name, …]` = only these.
   * Metadata still flows regardless — only sample bytes are gated.
   */
  setRegistry(names: string[] | null): void {
    if (sameFilter(this._registrySelection, names)) return
    this._registrySelection = names === null ? null : [...names]
    this._resubscribe()
  }

  /** Same as `setRegistry`, but for debug buffers (the `buffers` feature). */
  setBuffers(names: string[] | null, stream?: boolean): void {
    const changed = !sameFilter(this._buffersSelection, names)
    const streamChanged = (stream ?? false) !== this._streamBuffers
    if (!changed && !streamChanged) return
    this._buffersSelection = names === null ? null : [...names]
    this._streamBuffers = stream ?? false
    this._resubscribe()
  }

  private _resubscribe(): void {
    if (this._subscribed && this._dataBus !== null) {
      this._postData({
        type: 'subscribe',
        payload: {
          id: this.id,
          features: this._features,
          registry: this._registrySelection ?? undefined,
          buffers: this._buffersSelection ?? undefined,
          streamBuffers: this._streamBuffers || undefined,
        },
      })
    }
  }

  /**
   * Manually switch to a different provider. No-op if unknown or if
   * already selected. Closes the old data channel and opens the new one.
   */
  selectProvider(providerId: string): void {
    if (!this._providers.has(providerId)) return
    if (this.state.selectedProviderId === providerId) return
    this._leaveDataChannel()
    this.state.selectedProviderId = providerId
    this._resetAccumulatedState()
    this._joinDataChannel(providerId)
    this._postData({
      type: 'subscribe',
      payload: {
        id: this.id,
        features: this._features,
        registry: this._registrySelection ?? undefined,
        buffers: this._buffersSelection ?? undefined,
      },
    })
    this._fire()
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true

    this._leaveDataChannel()
    this._subscribed = false
    if (this._ackTimer !== null) {
      clearInterval(this._ackTimer)
      this._ackTimer = null
    }
    if (this._livenessTimer !== null) {
      clearInterval(this._livenessTimer)
      this._livenessTimer = null
    }
    if (this._queryRetryTimer !== null) {
      clearTimeout(this._queryRetryTimer)
      this._queryRetryTimer = null
    }
    try { this._discoveryBus.close() } catch { /* already closed */ }
  }

  /**
   * Open a fresh per-provider data channel and start listening on it.
   * Caller is responsible for posting the initial `subscribe`.
   */
  private _joinDataChannel(providerId: string): void {
    this._dataBus = new BroadcastChannel(providerChannelName(providerId))
    this._dataHandler = (ev: MessageEvent<DebugMessage>) => {
      this._onDataMessage(ev.data)
    }
    this._dataBus.addEventListener('message', this._dataHandler)
  }

  /**
   * Send `unsubscribe` (if we have someone to tell) and close the data
   * channel. Idempotent — safe to call when there's no active channel.
   */
  private _leaveDataChannel(): void {
    if (this._dataBus !== null) {
      if (this._subscribed) {
        try {
          this._postData({ type: 'unsubscribe', payload: { id: this.id } })
        } catch { /* bus may already be closing */ }
      }
      if (this._dataHandler !== null) {
        try { this._dataBus.removeEventListener('message', this._dataHandler) } catch { /* ignore */ }
      }
      try { this._dataBus.close() } catch { /* already closed */ }
      this._dataBus = null
      this._dataHandler = null
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Handler for the shared discovery bus. Only discovery messages land
   * here by protocol; anything else is ignored.
   */
  private _onDiscoveryMessage(msg: DebugMessage | undefined): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return
    tracePerf(msg)

    switch (msg.type) {
      case 'provider:announce': {
        const id = msg.payload.identity.id
        this._providers.set(id, msg.payload.identity)
        this.state.providers = Array.from(this._providers.values())
        this._fire()
        if (this.state.selectedProviderId === null) this._pickProviderAndSubscribe()
        break
      }
      case 'provider:gone': {
        const id = msg.payload.id
        if (!this._providers.has(id)) return
        this._providers.delete(id)
        this.state.providers = Array.from(this._providers.values())
        if (this.state.selectedProviderId === id) {
          this._leaveDataChannel()
          this.state.selectedProviderId = null
          this._resetAccumulatedState()
          this._pickProviderAndSubscribe()
        }
        this._fire()
        break
      }
      default:
        break
    }
  }

  /**
   * Handler for the per-provider data channel. Everything here is
   * already implicitly addressed to us (we opened the channel with the
   * provider's id), so no per-message filtering is required beyond
   * matching our consumer `id` on `subscribe:ack`.
   */
  private _onDataMessage(msg: DebugMessage | undefined): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return
    tracePerf(msg)

    switch (msg.type) {
      case 'subscribe:ack': {
        if (msg.payload.id !== this.id) return
        this._markServerAlive()
        this._applyEnv(msg.payload.env)
        if (this._ackTimer === null) {
          this._ackTimer = setInterval(() => this._sendAck(), ACK_INTERVAL_MS)
        }
        this._fire()
        break
      }
      case 'data': {
        this._markServerAlive()
        this.state.frame = msg.payload.frame
        const features = msg.payload.features
        if (features.stats !== undefined) this._applyStats(features.stats)
        if (features.env !== undefined) this._applyEnv(features.env)
        if (features.registry !== undefined) this._applyRegistry(features.registry)
        if (features.buffers !== undefined) this._applyBuffers(features.buffers)
        this._fire()
        break
      }
      case 'buffer:chunk': {
        this._markServerAlive()
        const payload = msg.payload as BufferChunkPayload
        for (const cb of this._chunkListeners) {
          try { cb(payload) } catch { /* listener errors shouldn't break the bus */ }
        }
        break
      }
      case 'ping': {
        this._markServerAlive()
        break
      }
      default:
        break
    }
  }

  private _markServerAlive(): void {
    this._lastServerAt = Date.now()
    if (!this.state.serverAlive) {
      this.state.serverAlive = true
      this._fire()
    }
  }

  /**
   * Pick the best provider from the currently-known set and subscribe
   * to it. Preference: `user` over `system`; first-announced as
   * tiebreak. No-op if zero providers are known (we'll stay waiting;
   * any future `provider:announce` that arrives doesn't auto-trigger
   * this — call it again or restart discovery).
   */
  private _pickProviderAndSubscribe(): void {
    if (this.state.selectedProviderId !== null) return
    const providers = Array.from(this._providers.values())
    if (providers.length === 0) return
    const user = providers.find((p) => p.kind === 'user')
    const chosen = user ?? providers[0]!
    this.state.selectedProviderId = chosen.id
    this._joinDataChannel(chosen.id)
    this._postData({
      type: 'subscribe',
      payload: {
        id: this.id,
        features: this._features,
        registry: this._registrySelection ?? undefined,
        buffers: this._buffersSelection ?? undefined,
      },
    })
    this._fire()
  }

  /** Clear all feature-derived state so the next data packet can start fresh. */
  private _resetAccumulatedState(): void {
    this.state.frame = undefined
    this._applyStats(null)
    this._applyEnv(null)
    this.state.registry.clear()
    this.state.buffers.clear()
  }

  /**
   * Apply a stats batch. Null = reset (feature cleared / provider gone).
   * Otherwise: decode each typed array onto the matching Float32 ring
   * and update the scalar with the batch mean (natural smoothing for
   * the text label).
   */
  private _applyStats(batch: StatsPayload | null): void {
    if (batch === null) {
      this.state.drawCalls = undefined
      this.state.triangles = undefined
      this.state.primitives = undefined
      this.state.geometries = undefined
      this.state.textures = undefined
      this.state.cpuMs = undefined
      this.state.fps = undefined
      this.state.gpuMs = undefined
      this.state.heapUsedMB = undefined
      this.state.heapLimitMB = undefined
      const s = this.state.series
      s.fps.write = 0; s.fps.length = 0
      s.cpuMs.write = 0; s.cpuMs.length = 0
      s.gpuMs.write = 0; s.gpuMs.length = 0
      s.heapUsedMB.write = 0; s.heapUsedMB.length = 0
      s.drawCalls.write = 0; s.drawCalls.length = 0
      s.triangles.write = 0; s.triangles.length = 0
      s.primitives.write = 0; s.primitives.length = 0
      s.geometries.write = 0; s.geometries.length = 0
      s.textures.write = 0; s.textures.length = 0
      return
    }
    const count = batch.count
    if (count <= 0) return
    const s = this.state.series
    if (batch.fps)        this.state.fps        = this._ingestI16(s.fps,        batch.fps,        count, 0.1)
    if (batch.cpuMs)      this.state.cpuMs      = this._ingestU16(s.cpuMs,      batch.cpuMs,      count, 0.01)
    if (batch.gpuMs)      this.state.gpuMs      = this._ingestU16(s.gpuMs,      batch.gpuMs,      count, 0.01)
    if (batch.heapUsedMB) this.state.heapUsedMB = this._ingestU16(s.heapUsedMB, batch.heapUsedMB, count, 1)
    if (batch.drawCalls)  this.state.drawCalls  = this._ingestU32(s.drawCalls,  batch.drawCalls,  count)
    if (batch.triangles)  this.state.triangles  = this._ingestU32(s.triangles,  batch.triangles,  count)
    if (batch.primitives) this.state.primitives = this._ingestU32(s.primitives, batch.primitives, count)
    if (batch.geometries) this.state.geometries = this._ingestU32(s.geometries, batch.geometries, count)
    if (batch.textures)   this.state.textures   = this._ingestU32(s.textures,   batch.textures,   count)
    if (batch.heapLimitMB !== undefined) this.state.heapLimitMB = batch.heapLimitMB
  }

  /**
   * Append `count` samples from a scaled integer view to a Float32 ring;
   * return the batch mean (scaled). Zero-alloc past the ring itself.
   */
  private _ingestI16(ring: DevtoolsSeries, src: Int16Array, count: number, scale: number): number {
    const size = ring.data.length
    let sum = 0
    let w = ring.write
    for (let i = 0; i < count; i++) {
      const v = src[i]! * scale
      ring.data[w] = v
      sum += v
      w = (w + 1) % size
    }
    ring.write = w
    ring.length = Math.min(size, ring.length + count)
    return sum / count
  }
  private _ingestU16(ring: DevtoolsSeries, src: Uint16Array, count: number, scale: number): number {
    const size = ring.data.length
    let sum = 0
    let w = ring.write
    for (let i = 0; i < count; i++) {
      const v = src[i]! * scale
      ring.data[w] = v
      sum += v
      w = (w + 1) % size
    }
    ring.write = w
    ring.length = Math.min(size, ring.length + count)
    return sum / count
  }
  private _ingestU32(ring: DevtoolsSeries, src: Uint32Array, count: number): number {
    const size = ring.data.length
    let sum = 0
    let w = ring.write
    for (let i = 0; i < count; i++) {
      const v = src[i]!
      ring.data[w] = v
      sum += v
      w = (w + 1) % size
    }
    ring.write = w
    ring.length = Math.min(size, ring.length + count)
    return sum / count
  }

  /**
   * Apply a registry delta. `entries[name] === null` → remove;
   * `entries[name]` present → upsert a snapshot keyed by `name`.
   * A `null` batch (feature cleared) drops every entry.
   */
  private _applyRegistry(delta: RegistryPayload | null): void {
    if (delta === null) {
      this.state.registry.clear()
      return
    }
    if (!delta.entries) return
    const entries = delta.entries
    // `for…in` to avoid the `Object.entries` array allocation each
    // batch; mutate existing snapshots in place so steady state is
    // alloc-free past the first sight of each entry.
    for (const name in entries) {
      const d = entries[name]
      if (d === undefined) continue
      if (d === null) {
        this.state.registry.delete(name)
        continue
      }
      let snap = this.state.registry.get(name)
      const sample = d.sample ?? snap?.sample ?? EMPTY_SAMPLE
      if (snap === undefined) {
        snap = {
          name,
          kind: d.kind,
          version: d.version,
          count: d.count,
          sample,
          label: d.label,
        }
        this.state.registry.set(name, snap)
      } else {
        snap.kind = d.kind
        snap.version = d.version
        snap.count = d.count
        snap.sample = sample
        snap.label = d.label
      }
    }
  }

  /**
   * Apply a buffers delta. Metadata (width/height/version/pixelType)
   * ships regardless of the client's selection; `pixels` only arrives
   * when this entry is in the current selection. Retain the previous
   * `pixels` when the delta is metadata-only so the UI keeps showing
   * the last thumbnail while browsing.
   */
  private _applyBuffers(delta: BuffersPayload | null): void {
    if (delta === null) {
      this.state.buffers.clear()
      return
    }
    if (!delta.entries) return
    const entries = delta.entries
    for (const name in entries) {
      const d = entries[name]
      if (d === undefined) continue
      if (d === null) {
        this.state.buffers.delete(name)
        continue
      }
      let snap = this.state.buffers.get(name)
      const pixels = d.pixels ?? snap?.pixels ?? null
      const isFloat = d.pixelType === 'rgba16f' || d.pixelType === 'rgba32f'
      const display = d.display ?? (isFloat ? 'normalize' : 'colors')
      if (snap === undefined) {
        snap = {
          name,
          width: d.width,
          height: d.height,
          pixelType: d.pixelType,
          display,
          version: d.version,
          pixels,
          label: d.label,
        }
        this.state.buffers.set(name, snap)
      } else {
        snap.width = d.width
        snap.height = d.height
        snap.pixelType = d.pixelType
        snap.display = display
        snap.version = d.version
        snap.pixels = pixels
        snap.label = d.label
      }
    }
  }

  private _applyEnv(delta: EnvPayload | null): void {
    if (delta === null) {
      this.state.threeFlatlandVersion = undefined
      this.state.threeRevision = undefined
      this.state.backendName = undefined
      this.state.backendTrackTimestamp = undefined
      this.state.backendDisjoint = undefined
      this.state.gpuModeEnabled = undefined
      this.state.canvasWidth = undefined
      this.state.canvasHeight = undefined
      this.state.canvasPixelRatio = undefined
      return
    }
    if ('threeFlatlandVersion' in delta) this.state.threeFlatlandVersion = delta.threeFlatlandVersion ?? undefined
    if ('threeRevision' in delta) this.state.threeRevision = delta.threeRevision ?? undefined
    if (delta.backend !== undefined) {
      const b = delta.backend
      if (b === null) {
        this.state.backendName = undefined
        this.state.backendTrackTimestamp = undefined
        this.state.backendDisjoint = undefined
        this.state.gpuModeEnabled = undefined
      } else {
        if ('name' in b) this.state.backendName = b.name ?? undefined
        if ('trackTimestamp' in b) this.state.backendTrackTimestamp = b.trackTimestamp ?? undefined
        if ('disjoint' in b) this.state.backendDisjoint = b.disjoint ?? undefined
        if ('gpuModeEnabled' in b) this.state.gpuModeEnabled = b.gpuModeEnabled ?? undefined
      }
    }
    if (delta.canvas !== undefined) {
      const c = delta.canvas
      if (c === null) {
        this.state.canvasWidth = undefined
        this.state.canvasHeight = undefined
        this.state.canvasPixelRatio = undefined
      } else {
        if ('width' in c) this.state.canvasWidth = c.width ?? undefined
        if ('height' in c) this.state.canvasHeight = c.height ?? undefined
        if ('pixelRatio' in c) this.state.canvasPixelRatio = c.pixelRatio ?? undefined
      }
    }
  }

  private _checkLiveness(): void {
    const now = Date.now()
    const lag = this._lastServerAt === 0 ? now : now - this._lastServerAt
    this.state.serverLagMs = lag

    if (this._lastServerAt !== 0 && lag > SERVER_LIVENESS_MS) {
      // Server has gone silent. Flip to dead, then re-subscribe to
      // force a fresh snapshot when it comes back.
      if (this.state.serverAlive) {
        this.state.serverAlive = false
      }
      // Idempotent re-subscribe. Server's onSubscribe handler resets
      // the per-feature delta so we get a full snapshot on the next
      // data packet.
      if (this._dataBus !== null) {
        this._postData({
          type: 'subscribe',
          payload: {
        id: this.id,
        features: this._features,
        registry: this._registrySelection ?? undefined,
        buffers: this._buffersSelection ?? undefined,
      },
        })
      }
    }
    this._fire()
  }

  private _sendAck(): void {
    if (this._disposed || this._dataBus === null) return
    this._postData({ type: 'ack', payload: { id: this.id } })
  }

  private _postDiscovery(body: Omit<DebugMessage, 'v' | 'ts'>): void {
    try {
      this._discoveryBus.postMessage({ v: DEBUG_PROTOCOL_VERSION, ts: Date.now(), ...body })
    } catch { /* bus may be closing */ }
  }

  private _postData(body: Omit<DebugMessage, 'v' | 'ts'>): void {
    if (this._dataBus === null) return
    try {
      this._dataBus.postMessage({ v: DEBUG_PROTOCOL_VERSION, ts: Date.now(), ...body })
    } catch { /* bus may be closing */ }
  }

  /** Subscribe to state-change events. Returns an unsubscribe function. */
  addListener(cb: DevtoolsStateListener): () => void {
    this._listeners.add(cb)
    return () => { this._listeners.delete(cb) }
  }

  /** Explicit remove — equivalent to calling the unsubscribe returned from `addListener`. */
  removeListener(cb: DevtoolsStateListener): void {
    this._listeners.delete(cb)
  }

  /** Subscribe to incoming WebCodecs buffer chunks. Returns an unsubscribe function. */
  addChunkListener(cb: BufferChunkListener): () => void {
    this._chunkListeners.add(cb)
    return () => { this._chunkListeners.delete(cb) }
  }

  private _fire(): void {
    for (const cb of this._listeners) {
      try { cb(this.state) } catch { /* listener errors shouldn't break the bus */ }
    }
  }
}

// Cheap UUID v4 for consumer ids. Prefer `crypto.randomUUID()` when
// available; fall back to a hex-derived UUID otherwise.
/** Cheap equality for two small feature lists treated as sets. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (const v of a) if (!b.includes(v)) return false
  return true
}

/** Equality for registry filters (where `null` has a distinct meaning). */
function sameFilter(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return sameSet(a, b)
}

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
