/**
 * Debug-bus protocol — types and constants shared between the core engine
 * (the message *producer*) and any consumer that wants to subscribe.
 *
 * This module is **types-only** at the JavaScript level (a handful of
 * small constants + the `stampMessage` helper are the only emitted
 * values). Importing it has no runtime cost: unused type imports erase
 * at compile time, and the few runtime exports are dead code unless a
 * subscriber actually constructs a `BroadcastChannel`.
 *
 * Both `three-flatland` (gated by `DEVTOOLS_BUNDLED`) and
 * `@three-flatland/devtools` import from this module. Third-party
 * adapters (websocket bridges, chrome extensions, etc.) do the same.
 *
 * ## Overview
 *
 * Many providers (Flatland's built-in system provider, user-created
 * providers for bare three.js apps or R3F, future remote adapters)
 * and many consumers (tweakpane panels, pop-out debuggers, remote
 * dashboards). Providers announce themselves on construction;
 * consumers discover providers via a `provider:query`, pick one by
 * preference (user > system), and subscribe to it.
 *
 *   provider → all:      `provider:announce { identity }`        on construct + on query
 *   provider → all:      `provider:gone { id }`                  on dispose
 *   consumer → all:      `provider:query {}`                     on start
 *   consumer → provider: `subscribe { id, features, providerId }`
 *   provider → consumer: `subscribe:ack { id, providerId, features, env }`
 *   provider → broadcast: `data { providerId, frame, features }` per frame
 *   provider → broadcast: `ping { providerId }`                  when idle
 *   consumer → provider: `ack { id }`                            ~1 Hz
 *   consumer → provider: `unsubscribe { id }`                    explicit leave
 *
 * Each provider maintains its own `Map<consumerId, { features,
 * lastAckAt }>`. Only handles subscribes / acks / unsubscribes whose
 * `providerId` matches its own id. Consumers filter incoming
 * `data` / `ping` / `subscribe:ack` by `providerId === chosen`.
 *
 * Identities are UUIDs (provider ids and consumer ids). Providers
 * additionally carry a `name` (human-readable) and a `kind`
 * (`'system'` for auto-constructed ones like Flatland's, `'user'` for
 * ones the application explicitly created). Consumers prefer `user`
 * over `system` when multiple are available.
 *
 * ## Delta semantics
 *
 * Every payload the server emits uses a cumulative / delta encoding to
 * minimise bandwidth and structured-clone overhead:
 *
 * - **Field absent** from the payload → *no change*; consumer keeps its
 *   previously-accumulated value.
 * - **Field === `null`** → *clear*; consumer resets the field to
 *   undefined (value ended / reset / removed — e.g. GPU resolves
 *   stalled).
 * - **Field present with a value** → new value; consumer overwrites.
 *
 * Fields the engine *always* emits (the monotonic `frame` counter on
 * stats) stay non-nullable in their TS type. Everything else is
 * `T | null | undefined` (omitted = no change).
 *
 * Server-side producers hold two scratch objects per feature:
 *   `_prev`  — last-sent snapshot (reference for diff)
 *   `_out`   — the compressed delta payload (reused, mutated each tick)
 *
 * On every `subscribe` (or fresh `subscribe` that changes features),
 * the producer's `resetDelta()` clears `_prev` so late-joining consumers
 * receive a full snapshot on the next tick.
 *
 * ## RPC messages (consumer ↔ consumer)
 *
 * UI-local state changes (selected buffer name, fullscreen toggle,
 * grid-all mode, tick rate slider) are relayed between consumers so
 * pop-out windows and main windows can sync. They are NOT interpreted
 * by the server — the server ignores the `rpc:*` prefix.
 *
 * Every RPC message carries a `target: string` (id of the recipient
 * consumer). Broadcast is deliberately omitted from v1; add-back later
 * via an optional-`target` extension if a multi-consumer sync use case
 * appears.
 */

// ─── Channel + version ──────────────────────────────────────────────────────

/** Channel name used by `new BroadcastChannel(DEBUG_CHANNEL)`. */
export const DEBUG_CHANNEL = 'flatland-debug'

/** Protocol version. Bumped on breaking schema changes. */
export const DEBUG_PROTOCOL_VERSION = 1

// ─── Timing constants ───────────────────────────────────────────────────────

/**
 * Consumer ack cadence. Consumers send `ack { id }` this often (starting
 * on `subscribe:ack` receipt, not at subscribe-send time — you don't
 * talk back if no one is talking to you).
 */
export const ACK_INTERVAL_MS = 1000

/**
 * Server drops a consumer whose `lastAckAt` is older than this window.
 * 3× ack cadence = 2 missed acks of grace. Covers typical GC pauses /
 * tab backgrounding hiccups; a genuinely dead consumer gets cleaned up
 * within a few seconds. Consumers that return after a long stall
 * recover by re-subscribing with the same id.
 */
export const ACK_GRACE_MS = 3000

/**
 * Window after which a feature's cached value (e.g. GPU ms) is
 * considered stale and the producer emits `null` once to tell
 * consumers to clear their display. `stats:gpu` is the canonical case:
 * when the async resolve queue drains and no new timings arrive within
 * this window, the cached `gpuMs` transitions to `null`.
 */
export const FEATURE_STALE_MS = 2000

/**
 * Server emits a `ping` broadcast when no `data` packet has been sent
 * in this window — lets consumers distinguish "idle server" from "dead
 * server" without requiring per-tick broadcasts. Faster than
 * `ACK_GRACE_MS` on purpose: the server gives consumers at least one
 * liveness signal per their ack cycle before they would time it out.
 */
export const IDLE_PING_MS = 2000

/**
 * Consumer-side grace window: if no server message (`data`, `ping`, or
 * `subscribe:ack`) arrives in this window, the consumer should
 * presume the server is gone and re-subscribe to recover. Sized at
 * ~2× `IDLE_PING_MS` so one missed ping survives, two doesn't.
 *
 * Implemented by consumers (devtools package, future remote
 * dashboards); documented here so the cross-party contract is in one
 * place.
 */
export const SERVER_LIVENESS_MS = 5000

/**
 * Consumer discovery window: after sending `provider:query`, collect
 * `provider:announce` responses for this long before picking one.
 * Short enough to not delay startup; long enough to hear back from
 * providers in the same process (BroadcastChannel is effectively
 * immediate in-process).
 */
export const DISCOVERY_WINDOW_MS = 150

// ─── Devtools build gate ────────────────────────────────────────────────────

/**
 * **Layer 1 (build-time): `DEVTOOLS_BUNDLED`.** A module-scoped `const`
 * evaluated from `import.meta.env.DEV` and
 * `import.meta.env.VITE_FLATLAND_DEVTOOLS`, both of which Vite / esbuild
 * / rollup (with appropriate `define`) inline at build time. When both
 * resolve to falsy, the constant folds to `false`, every
 * `if (DEVTOOLS_BUNDLED)` branch becomes dead code, terser removes it,
 * and no devtools code ends up in the output. Zero bytes, zero runtime
 * cost. Tree-shake guarantee, not tree-shake hope.
 *
 * **Layer 2 (runtime): `isDevtoolsActive()`.** Only reachable when
 * `DEVTOOLS_BUNDLED` is true. Reads `window.__FLATLAND_DEVTOOLS__` as
 * an opt-out (false disables an otherwise-bundled build). Cannot
 * enable what isn't bundled — rogue clients can't "hack devtools on"
 * in prod.
 *
 * | Build flag | `window.__FLATLAND_DEVTOOLS__` | Enabled? |
 * |---|---|---|
 * | `DEV=true` or `VITE_FLATLAND_DEVTOOLS=true` | undefined | yes (default on) |
 * | `DEV=true` or `VITE_FLATLAND_DEVTOOLS=true` | false     | no (user disabled) |
 * | `DEV=true` or `VITE_FLATLAND_DEVTOOLS=true` | true      | yes (explicit) |
 * | neither                                    | anything  | no (code not in bundle) |
 */
export const DEVTOOLS_BUNDLED: boolean = (() => {
  const env = (import.meta as { env?: Record<string, unknown> }).env
  if (env?.['DEV'] === true) return true
  if (env?.['VITE_FLATLAND_DEVTOOLS'] === 'true') return true
  return false
})()

export function isDevtoolsActive(): boolean {
  if (typeof window === 'undefined') return true
  const flag = (window as { __FLATLAND_DEVTOOLS__?: boolean }).__FLATLAND_DEVTOOLS__
  return flag !== false
}

// ─── Provider identity ──────────────────────────────────────────────────────

/**
 * Provider classification. `system` providers are auto-constructed by
 * a framework (Flatland constructs one per instance). `user` providers
 * are explicitly created by app code — e.g., a bare three.js app that
 * called `new DevtoolsProvider({ scene, name: 'my-game' })` or mounted
 * the React `<DevtoolsProvider>` under its `<Canvas>`. When multiple
 * providers are on the bus, consumers prefer `user` (an explicit
 * app-level opt-in) over `system` (framework default).
 */
export type ProviderKind = 'system' | 'user'

export interface ProviderIdentity {
  /** UUID. Stable for the provider's lifetime. */
  id: string
  /** Human-readable name, shown in the consumer UI. */
  name: string
  /** `system` = auto-constructed; `user` = explicitly created. */
  kind: ProviderKind
}

// ─── Features ───────────────────────────────────────────────────────────────

/**
 * Subscribable features. Each one corresponds to an optional slot in the
 * server's `data` packet payload. `stats` is unified (the former
 * `stats:frame` + `stats:gpuReady` — gpu ms lives in the same packet,
 * cached on the server between async resolves).
 */
export type DebugFeature =
  | 'stats'
  | 'env'
  | 'atlas:tick'
  | 'atlas:fullscreen'
  | 'registry'

/** Categories help the UI group registered buffers. Free-form string accepted. */
export type DebugCategory = 'lighting' | 'materials' | 'post' | 'sprites' | (string & {})

/** Source kind for a registered debug buffer. */
export type DebugBufferKind = 'texture' | 'storage' | 'cpu-array'

/** Format hint — used by Phase 1 shaders / CPU presenters to pick a renderer. */
export type DebugFormat =
  | 'rgba8'
  | 'rgba-premul'
  | 'sdf-distance'
  | 'depth-linear'
  | 'normal-xyz'
  | 'tile-light-count'
  | 'tile-light-indices'
  | 'float-array'
  | 'uint-array'

// ─── Feature payloads (delta-encoded) ───────────────────────────────────────

/**
 * Stats payload. Carried on the `stats` feature when at least one field
 * changed since the last emit.
 *
 * Every field is delta: absent = no change, `null` = clear, value = new.
 * There's no always-present "heartbeat" field — if nothing changed, the
 * `stats` feature is omitted from the `data` packet entirely, and if no
 * other feature has fresh content either, no packet is emitted at all.
 * Consumers rely on the top-level `DataPayload.frame` (always set by the
 * server when a packet is emitted) to correlate data with an engine
 * frame.
 */
export interface StatsPayload {
  /** Delta: omit = unchanged, null = clear, number = new. */
  drawCalls?: number | null
  triangles?: number | null
  geometries?: number | null
  textures?: number | null
  /** CPU time between begin/end markers, in ms. */
  cpuMs?: number | null
  /** Rolling-average FPS (producer-computed). */
  fps?: number | null
  /** Latest async-resolved GPU frame time, ms. Server caches across ticks. */
  gpuMs?: number | null
  /**
   * Engine frame the cached `gpuMs` was resolved from. Useful to
   * correlate GPU timing with the top-level `DataPayload.frame` (which
   * is the *current* frame at packet emit time, typically a few frames
   * ahead of `gpuFrame` because of async readback).
   */
  gpuFrame?: number | null
}

/**
 * Environment info. First full snapshot delivered in `subscribe:ack.env`.
 * Subsequent deltas arrive on the `env` feature in `data` packets when
 * something changes (in practice: canvas resize / DPI switch).
 */
export interface EnvPayload {
  threeFlatlandVersion?: string | null
  threeRevision?: string | null
  backend?: EnvBackendDelta | null
  canvas?: EnvCanvasDelta | null
}

export interface EnvBackendDelta {
  /** Renderer backend class name, e.g. `'WebGPUBackend'` / `'WebGLBackend'`. */
  name?: string | null
  /** Whether the renderer was constructed with `trackTimestamp: true`. */
  trackTimestamp?: boolean | null
  /**
   * WebGL-only: `true` if `EXT_disjoint_timer_query_webgl2` is available.
   * `null` when the backend isn't WebGL.
   */
  disjoint?: boolean | null
  /**
   * Derived: can we actually resolve GPU timestamps on this backend?
   * True iff `trackTimestamp && (backend !== WebGL || disjoint)`.
   */
  gpuModeEnabled?: boolean | null
}

export interface EnvCanvasDelta {
  width?: number | null
  height?: number | null
  pixelRatio?: number | null
}

/** Registry-changed payload. TBD; stub for Phase B. */
export interface RegistryPayload {
  added?: string[] | null
  removed?: string[] | null
}

/** Atlas tick payload. TBD; stub for Phase C. */
export interface AtlasTickPayload {
  /** Placeholder — actual fields land in Phase C. */
  _placeholder?: never
}

/** Atlas fullscreen payload. TBD; stub for Phase D. */
export interface AtlasFullscreenPayload {
  _placeholder?: never
}

/**
 * Provider data packet — emitted *only* when at least one subscribed
 * feature has fresh content. Not a heartbeat; silence means "nothing
 * changed." If a consumer needs a liveness signal beyond this, it can
 * rely on `subscribe:ack` (provider-alive confirmation) and its own ack
 * timer (provider-drops-on-stale).
 *
 * `providerId` tags every packet so consumers can filter — a consumer
 * that subscribed to provider X ignores packets from provider Y. `frame`
 * is always set when a packet goes out — ties the packet's contents to
 * a specific engine render so consumers can correlate data with a
 * frame number. Each feature slot is delta-encoded: absent = no change
 * for that feature, `null` = feature cleared/gone, object = new/changed
 * payload to merge into consumer state.
 */
export interface DataPayload {
  /** UUID of the provider that emitted this packet. */
  providerId: string
  /** Engine render frame this packet was emitted from. */
  frame: number
  features: {
    stats?: StatsPayload | null
    env?: EnvPayload | null
    'atlas:tick'?: AtlasTickPayload | null
    'atlas:fullscreen'?: AtlasFullscreenPayload | null
    registry?: RegistryPayload | null
  }
}

// ─── Lifecycle payloads ─────────────────────────────────────────────────────

/** Consumer → provider: start/update subscription. Idempotent on same id + features. */
export interface SubscribePayload {
  /** Consumer UUID. */
  id: string
  features: DebugFeature[]
  /**
   * Target provider id. The only provider that should act on this
   * message is the one whose id matches. Absent = unaddressed; current
   * implementation ignores unaddressed subscribes so the consumer must
   * complete discovery first.
   */
  providerId?: string
}

/**
 * Provider → consumer: subscription confirmation. Echoes features
 * actually honoured + carries one-shot bootstrap env info so the
 * consumer knows capabilities (e.g. Safari WebGPU lacks GPU timestamp
 * queries) without having to subscribe to env just to find out.
 */
export interface SubscribeAckPayload {
  id: string
  /** UUID of the provider that accepted the subscribe. */
  providerId: string
  features: DebugFeature[]
  env: EnvPayload
}

/** Consumer → provider: explicit leave. */
export interface UnsubscribePayload {
  id: string
  /** Target provider id. Only that provider acts on it. */
  providerId?: string
}

/**
 * Consumer → provider: "I'm still alive." Cadence: `ACK_INTERVAL_MS`.
 * Provider drops the consumer after `ACK_GRACE_MS` without one.
 */
export interface AckPayload {
  id: string
  /** Target provider id. Only that provider acts on it. */
  providerId?: string
}

/**
 * Provider → consumers: idle liveness signal. Empty payload (presence
 * + envelope `ts` are the info).
 */
export interface PingPayload {
  /** UUID of the provider that sent the ping. Consumers filter on this. */
  providerId: string
}

// ─── Provider discovery ─────────────────────────────────────────────────────

/**
 * Provider → all: "I'm here." Sent on provider construction and in
 * response to every `provider:query`. Consumers track the full set of
 * announced providers, pick one, and subscribe to that id specifically.
 */
export interface ProviderAnnouncePayload {
  identity: ProviderIdentity
}

/**
 * Consumer → all: "Any providers out there?" Providers reply with
 * `provider:announce`. Consumer aggregates responses over a short
 * discovery window before choosing one.
 */
export interface ProviderQueryPayload {
  /** UUID of the consumer asking. Informational; providers don't filter on it. */
  requesterId?: string
}

/**
 * Provider → all: "I'm leaving." Sent on `dispose()`. Consumers
 * currently subscribed to this provider should drop it from their
 * known-providers map and fall back to another one if available (or
 * re-run discovery).
 */
export interface ProviderGonePayload {
  id: string
}

// (`PingPayload` moved above; it now carries `providerId` for filtering.)

// ─── RPC payloads (consumer ↔ consumer; server ignores) ─────────────────────

/** Base shape — every RPC carries the recipient's id. */
export interface RpcTargetPayload {
  target: string
}

export interface RpcRegistrySelectPayload extends RpcTargetPayload {
  name: string
}
export interface RpcUiTogglePayload extends RpcTargetPayload {
  on: boolean
}
export interface RpcTickSetPayload extends RpcTargetPayload {
  hz: number
}

// ─── Envelope + discriminated union ─────────────────────────────────────────

/**
 * Envelope shared by every message on the bus.
 *
 * `ts` is `Date.now()` milliseconds, stamped by the producer at post
 * time. Consumers use it for:
 *   - Graphing data on a real time axis (frames aren't perfectly
 *     uniform — stalls, GC pauses).
 *   - Computing latency (`Date.now() - msg.ts`) to detect slow bus
 *     delivery or backgrounded-tab throttling.
 *   - Interpolating between stats samples when the consumer's display
 *     rate differs from the producer's emit rate.
 *   - Ordering messages across a pop-out window / websocket transport
 *     where delivery order isn't guaranteed.
 *
 * `Date.now()` (wall clock) is used instead of `performance.now()`
 * (monotonic, per-origin) so timestamps stay comparable across pop-out
 * windows and remote consumers.
 */
export interface DebugMessageEnvelope {
  v: 1
  ts: number
}

/**
 * Discriminated union of all debug-bus messages. Every variant is
 * structured-clone-safe (no functions, no DOM nodes, no class instances).
 * Every variant carries the `DebugMessageEnvelope` fields (`v`, `ts`).
 */
export type DebugMessage = DebugMessageEnvelope & (
  // Discovery (both directions)
  | { type: 'provider:announce'; payload: ProviderAnnouncePayload }
  | { type: 'provider:query'; payload: ProviderQueryPayload }
  | { type: 'provider:gone'; payload: ProviderGonePayload }
  // Consumer → provider (lifecycle)
  | { type: 'subscribe'; payload: SubscribePayload }
  | { type: 'unsubscribe'; payload: UnsubscribePayload }
  | { type: 'ack'; payload: AckPayload }
  // Provider → consumer (lifecycle + data + liveness)
  | { type: 'subscribe:ack'; payload: SubscribeAckPayload }
  | { type: 'data'; payload: DataPayload }
  | { type: 'ping'; payload: PingPayload }
  // Consumer ↔ consumer (providers ignore; `rpc:` prefix)
  | { type: 'rpc:registry:select'; payload: RpcRegistrySelectPayload }
  | { type: 'rpc:ui:expand'; payload: RpcUiTogglePayload }
  | { type: 'rpc:ui:gridAll'; payload: RpcUiTogglePayload }
  | { type: 'rpc:tick:set'; payload: RpcTickSetPayload }
)

/**
 * Type helper: message body (type + payload) without the envelope.
 * Producers hold a long-lived scratch body of this shape, mutate its
 * payload each tick, then call `stampMessage(scratch)` +
 * `bus.postMessage(scratch)`.
 */
export type DebugMessageBody = Omit<DebugMessage, 'v' | 'ts'>

/**
 * Stamp a message body with the current envelope fields (`v`, `ts`) **in
 * place**. Returns the same object narrowed to `DebugMessage`.
 *
 * Mutation-based so producers hold one scratch message and reuse it
 * across every send — one allocation at construction, zero allocations
 * per send (aside from payload fill, which also uses scratch).
 * `bus.postMessage()` structure-clones before delivery, so the
 * producer's scratch is untouched by consumers and safe to mutate on
 * the next tick.
 */
export function stampMessage<T extends DebugMessageBody>(body: T): T & DebugMessageEnvelope {
  const stamped = body as T & { v: 1; ts: number }
  stamped.v = DEBUG_PROTOCOL_VERSION
  stamped.ts = Date.now()
  return stamped
}

// ─── Wire format ────────────────────────────────────────────────────────────
//
// For same-process `BroadcastChannel` (v1's only transport), messages are
// posted as-is with verbose field names. The structured-clone algorithm
// `postMessage` uses is native-code and fast; adding a JS-level encode
// pass before it would cost more than the bandwidth saved. Keys stay
// full ("drawCalls", not "dc") — the in-process win is negative.
//
// When a `WebSocketTransport` (or any serialize-to-bytes transport) is
// added, its adapter is the right place for key compression and
// msgpack/CBOR encoding. Producers and consumers stay oblivious;
// compression lives at the wire boundary, scoped to where it matters.
