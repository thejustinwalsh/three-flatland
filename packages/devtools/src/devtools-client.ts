import type {
  DebugFeature,
  DebugMessage,
  EnvPayload,
  ProviderIdentity,
  StatsPayload,
} from 'three-flatland/debug-protocol'
import {
  ACK_INTERVAL_MS,
  DEBUG_CHANNEL,
  DEBUG_PROTOCOL_VERSION,
  DISCOVERY_WINDOW_MS,
  SERVER_LIVENESS_MS,
} from 'three-flatland/debug-protocol'

/**
 * Construction options for `DevtoolsClient`.
 */
export interface DevtoolsClientOptions {
  /** Features to subscribe to. */
  features: DebugFeature[]
  /** Override the bus channel name (defaults to the protocol's standard). */
  channelName?: string
  /**
   * Optional first listener, equivalent to calling `addListener(cb)`
   * after construction. Kept as a convenience for the common single-
   * consumer case; multi-consumer callers should use `addListener` /
   * `removeListener` directly.
   */
  onChange?: (state: DevtoolsState) => void
}

/** Listener signature for `DevtoolsClient.addListener`. */
export type DevtoolsStateListener = (state: DevtoolsState) => void

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
  /** Engine frame counter from the most recent `data` packet. */
  frame?: number

  // --- Stats (merged from data.features.stats) -----------------------------
  drawCalls?: number
  triangles?: number
  geometries?: number
  textures?: number
  cpuMs?: number
  fps?: number
  gpuMs?: number
  gpuFrame?: number

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

  private _ch: BroadcastChannel
  private _features: DebugFeature[]
  private _listeners = new Set<DevtoolsStateListener>()

  private _ackTimer: ReturnType<typeof setInterval> | null = null
  private _livenessTimer: ReturnType<typeof setInterval> | null = null
  private _discoveryTimer: ReturnType<typeof setTimeout> | null = null
  private _lastServerAt = 0
  private _subscribed = false
  private _disposed = false

  /** Known providers by id — updated live via `provider:announce` + `provider:gone`. */
  private _providers = new Map<string, ProviderIdentity>()

  constructor(options: DevtoolsClientOptions) {
    this.id = generateUuid()
    this._features = [...options.features]
    if (options.onChange) this._listeners.add(options.onChange)
    this._ch = new BroadcastChannel(options.channelName ?? DEBUG_CHANNEL)
    this.state = {
      providers: [],
      selectedProviderId: null,
      serverAlive: false,
      serverLagMs: 0,
    }

    this._ch.addEventListener('message', (ev: MessageEvent<DebugMessage>) => {
      this._onMessage(ev.data)
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

    // Announce ourselves to the bus and ask who's out there.
    this._post({
      type: 'provider:query',
      payload: { requesterId: this.id },
    })

    // Give providers a moment to respond with `provider:announce`
    // before we pick one. Any announces we've already received
    // (producers that were constructed before we started) count too.
    this._discoveryTimer = setTimeout(() => {
      this._discoveryTimer = null
      this._pickProviderAndSubscribe()
    }, DISCOVERY_WINDOW_MS)

    // Liveness watcher — fires every second, flips serverAlive false and
    // re-subscribes if we've gone silent past the grace window.
    this._livenessTimer = setInterval(() => this._checkLiveness(), 1000)
  }

  /**
   * Update the feature set. Re-posts `subscribe` with the same consumer
   * id to the currently-selected provider.
   */
  setFeatures(features: DebugFeature[]): void {
    this._features = [...features]
    if (this._subscribed && this.state.selectedProviderId !== null) {
      this._post({
        type: 'subscribe',
        payload: {
          id: this.id,
          features: this._features,
          providerId: this.state.selectedProviderId,
        },
      })
    }
  }

  /** Tear down: unsubscribe, clear timers, close bus. Idempotent. */
  /**
   * Manually switch to a different provider (by UUID). Useful for UI
   * "pick provider" dropdowns. No-op if the id isn't a known provider.
   * If already subscribed, unsubscribes from the old provider first.
   */
  selectProvider(providerId: string): void {
    if (!this._providers.has(providerId)) return
    if (this.state.selectedProviderId === providerId) return
    // Unsubscribe from current provider.
    if (this.state.selectedProviderId !== null) {
      this._post({
        type: 'unsubscribe',
        payload: { id: this.id, providerId: this.state.selectedProviderId },
      })
    }
    this.state.selectedProviderId = providerId
    this._resetAccumulatedState()
    // Subscribe to the newly selected provider.
    this._post({
      type: 'subscribe',
      payload: { id: this.id, features: this._features, providerId },
    })
    this._fire()
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true

    if (this._subscribed && this.state.selectedProviderId !== null) {
      try {
        this._post({
          type: 'unsubscribe',
          payload: { id: this.id, providerId: this.state.selectedProviderId },
        })
      } catch { /* bus may already be closing */ }
    }
    this._subscribed = false
    if (this._ackTimer !== null) {
      clearInterval(this._ackTimer)
      this._ackTimer = null
    }
    if (this._livenessTimer !== null) {
      clearInterval(this._livenessTimer)
      this._livenessTimer = null
    }
    if (this._discoveryTimer !== null) {
      clearTimeout(this._discoveryTimer)
      this._discoveryTimer = null
    }
    try { this._ch.close() } catch { /* already closed */ }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _onMessage(msg: DebugMessage | undefined): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return

    switch (msg.type) {
      case 'provider:announce': {
        // Track every provider that announces itself, regardless of
        // whether we've picked one yet. UI can show the full list.
        const id = msg.payload.identity.id
        this._providers.set(id, msg.payload.identity)
        this.state.providers = Array.from(this._providers.values())
        this._fire()
        // If we've already completed discovery but a new provider shows
        // up, we don't auto-switch — user has to choose. If we haven't
        // selected anything yet (e.g., late-joining provider during
        // our discovery window), `_pickProviderAndSubscribe` will see
        // the updated map when it fires.
        break
      }
      case 'provider:gone': {
        const id = msg.payload.id
        if (!this._providers.has(id)) return
        this._providers.delete(id)
        this.state.providers = Array.from(this._providers.values())
        // If the provider we were subscribed to just left, fall back
        // to another one (preference rules) or mark nothing selected.
        if (this.state.selectedProviderId === id) {
          this.state.selectedProviderId = null
          this._resetAccumulatedState()
          this._pickProviderAndSubscribe()
        }
        this._fire()
        break
      }
      case 'subscribe:ack': {
        if (msg.payload.id !== this.id) return
        if (msg.payload.providerId !== this.state.selectedProviderId) return
        this._markServerAlive()
        this._applyEnv(msg.payload.env)
        if (this._ackTimer === null) {
          this._ackTimer = setInterval(() => this._sendAck(), ACK_INTERVAL_MS)
        }
        this._fire()
        break
      }
      case 'data': {
        if (msg.payload.providerId !== this.state.selectedProviderId) return
        this._markServerAlive()
        this.state.frame = msg.payload.frame
        const features = msg.payload.features
        if (features.stats !== undefined) this._applyStats(features.stats)
        if (features.env !== undefined) this._applyEnv(features.env)
        // atlas:*, registry features handled in later phases.
        this._fire()
        break
      }
      case 'ping': {
        if (msg.payload.providerId !== this.state.selectedProviderId) return
        this._markServerAlive()
        break
      }
      default:
        // Other types are consumer→server (our own sends) or RPC
        // targeted at others — ignore.
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
    this._post({
      type: 'subscribe',
      payload: { id: this.id, features: this._features, providerId: chosen.id },
    })
    this._fire()
  }

  /** Clear all feature-derived state so the next data packet can start fresh. */
  private _resetAccumulatedState(): void {
    this.state.frame = undefined
    this._applyStats(null)
    this._applyEnv(null)
  }

  /**
   * Apply a delta to the accumulated stats. Field rules (protocol):
   *   - absent    → no change
   *   - null      → clear (undefined in local state)
   *   - value     → overwrite
   */
  private _applyStats(delta: StatsPayload | null): void {
    if (delta === null) {
      // Feature cleared at the server — reset our stats slice.
      this.state.drawCalls = undefined
      this.state.triangles = undefined
      this.state.geometries = undefined
      this.state.textures = undefined
      this.state.cpuMs = undefined
      this.state.fps = undefined
      this.state.gpuMs = undefined
      this.state.gpuFrame = undefined
      return
    }
    if ('drawCalls' in delta) this.state.drawCalls = delta.drawCalls ?? undefined
    if ('triangles' in delta) this.state.triangles = delta.triangles ?? undefined
    if ('geometries' in delta) this.state.geometries = delta.geometries ?? undefined
    if ('textures' in delta) this.state.textures = delta.textures ?? undefined
    if ('cpuMs' in delta) this.state.cpuMs = delta.cpuMs ?? undefined
    if ('fps' in delta) this.state.fps = delta.fps ?? undefined
    if ('gpuMs' in delta) this.state.gpuMs = delta.gpuMs ?? undefined
    if ('gpuFrame' in delta) this.state.gpuFrame = delta.gpuFrame ?? undefined
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
      this._post({
        type: 'subscribe',
        payload: { id: this.id, features: this._features },
      })
    }
    this._fire()
  }

  private _sendAck(): void {
    if (this._disposed) return
    this._post({ type: 'ack', payload: { id: this.id } })
  }

  private _post(body: Omit<DebugMessage, 'v' | 'ts'>): void {
    try {
      this._ch.postMessage({ v: DEBUG_PROTOCOL_VERSION, ts: Date.now(), ...body })
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

  private _fire(): void {
    for (const cb of this._listeners) {
      try { cb(this.state) } catch { /* listener errors shouldn't break the bus */ }
    }
  }
}

// Cheap UUID v4 for consumer ids. Prefer `crypto.randomUUID()` when
// available; fall back to a hex-derived UUID otherwise.
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
