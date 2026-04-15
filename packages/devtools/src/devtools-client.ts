import type {
  DebugFeature,
  DebugMessage,
  EnvPayload,
  StatsPayload,
} from 'three-flatland/debug-protocol'
import {
  ACK_INTERVAL_MS,
  DEBUG_CHANNEL,
  DEBUG_PROTOCOL_VERSION,
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
   * Called whenever the accumulated state changes (new data packet,
   * liveness state flip, subscribe:ack processed). The argument is a
   * live reference to the same state object every call — callers can
   * read from it or trigger UI refreshes.
   */
  onChange?: (state: DevtoolsState) => void
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

  // --- Liveness (client-tracked) -----------------------------------------
  /** Is the server considered alive? False after `SERVER_LIVENESS_MS` silence. */
  serverAlive: boolean
  /** ms since the last server message. */
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
  private _onChange: ((state: DevtoolsState) => void) | undefined

  private _ackTimer: ReturnType<typeof setInterval> | null = null
  private _livenessTimer: ReturnType<typeof setInterval> | null = null
  private _lastServerAt = 0
  private _subscribed = false
  private _disposed = false

  constructor(options: DevtoolsClientOptions) {
    this.id = generateUuid()
    this._features = [...options.features]
    this._onChange = options.onChange
    this._ch = new BroadcastChannel(options.channelName ?? DEBUG_CHANNEL)
    this.state = { serverAlive: false, serverLagMs: 0 }

    this._ch.addEventListener('message', (ev: MessageEvent<DebugMessage>) => {
      this._onMessage(ev.data)
    })
  }

  /**
   * Send the initial `subscribe` and begin the liveness watcher. Idempotent
   * — calling again while already started is a no-op.
   */
  start(): void {
    if (this._disposed || this._subscribed) return
    this._subscribed = true
    this._post({
      type: 'subscribe',
      payload: { id: this.id, features: this._features },
    })

    // Liveness watcher — fires every second, flips serverAlive false and
    // re-subscribes if we've gone silent past the grace window.
    this._livenessTimer = setInterval(() => this._checkLiveness(), 1000)
  }

  /**
   * Update the feature set. Sends a fresh `subscribe` with the same id;
   * server treats it as an idempotent update (adds/removes features).
   */
  setFeatures(features: DebugFeature[]): void {
    this._features = [...features]
    if (this._subscribed) {
      this._post({
        type: 'subscribe',
        payload: { id: this.id, features: this._features },
      })
    }
  }

  /** Tear down: unsubscribe, clear timers, close bus. Idempotent. */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true

    if (this._subscribed) {
      try {
        this._post({ type: 'unsubscribe', payload: { id: this.id } })
      } catch { /* bus may already be closing */ }
      this._subscribed = false
    }
    if (this._ackTimer !== null) {
      clearInterval(this._ackTimer)
      this._ackTimer = null
    }
    if (this._livenessTimer !== null) {
      clearInterval(this._livenessTimer)
      this._livenessTimer = null
    }
    try { this._ch.close() } catch { /* already closed */ }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _onMessage(msg: DebugMessage | undefined): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return

    // Any server-originated message refreshes our liveness clock.
    if (msg.type === 'data' || msg.type === 'ping' || msg.type === 'subscribe:ack') {
      this._lastServerAt = Date.now()
      if (!this.state.serverAlive) {
        this.state.serverAlive = true
        this._fire()
      }
    }

    switch (msg.type) {
      case 'subscribe:ack': {
        if (msg.payload.id !== this.id) return // addressed to a different consumer
        // Bootstrap env from the ack.
        this._applyEnv(msg.payload.env)
        // Start the ack cadence.
        if (this._ackTimer === null) {
          this._ackTimer = setInterval(() => this._sendAck(), ACK_INTERVAL_MS)
        }
        this._fire()
        break
      }
      case 'data': {
        this.state.frame = msg.payload.frame
        const features = msg.payload.features
        if (features.stats !== undefined) this._applyStats(features.stats)
        if (features.env !== undefined) this._applyEnv(features.env)
        // atlas:*, registry features handled in later phases.
        this._fire()
        break
      }
      case 'ping':
        // Already refreshed liveness above; nothing else to do.
        break
      default:
        // Other types are consumer→server (our own sends) or RPC
        // targeted at others — ignore.
        break
    }
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

  private _fire(): void {
    this._onChange?.(this.state)
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
