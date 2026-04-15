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

/**
 * Shared discovery ("bonjour") channel. ONLY carries discovery traffic:
 * `provider:query` (consumer → all), `provider:announce` / `provider:gone`
 * (provider → all). Every provider and every consumer subscribes here.
 * Kept deliberately low-noise so it scales to many providers / consumers
 * without turning into a firehose.
 */
export const DISCOVERY_CHANNEL = 'flatland-debug'

/**
 * Legacy alias — kept briefly for in-flight imports. Prefer
 * `DISCOVERY_CHANNEL` for the discovery bus name.
 * @deprecated
 */
export const DEBUG_CHANNEL = DISCOVERY_CHANNEL

/**
 * Per-provider data channel name. A provider opens one of these named
 * after its own UUID; subscribed consumers open the same channel by id
 * once they've picked a provider from discovery. All subscribe /
 * ack / data / ping / subscribe:ack traffic flows here — implicitly
 * addressed, so the messages don't carry a `providerId` field.
 */
export function providerChannelName(providerId: string): string {
  return `flatland-debug:${providerId}`
}

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
 * Producer batches per-frame stats samples and flushes them on this
 * cadence. 250 ms ≈ 15–30 samples per batch at typical frame rates —
 * fast enough that the graph scroll reads as motion rather than
 * per-second steps; slow enough to stay well under the bus rate limit.
 */
export const STATS_BATCH_MS = 250

/**
 * Maximum samples held in the producer's ring. Any frames that arrive
 * beyond this within a single batch window are dropped (oldest wins —
 * they'd otherwise overwrite the tail of the same batch). Sized for
 * 4 s @ 60 Hz / 2 s @ 120 Hz — plenty for a 500 ms flush.
 */
export const STATS_RING_SIZE = 240

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
  | 'buffers'
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
 * Stats payload — a batch of per-frame samples collected on the producer
 * over a short window (default 500 ms) and shipped together so the bus
 * isn't hammered at render rate. Each typed array holds `count` samples
 * for frames `[startFrame, startFrame + count - 1]`. Arrays may be
 * shorter if the window was clipped, so always read by `count`.
 *
 * Scaled encodings keep payloads compact (see table). Consumers decode
 * into whatever view they want (typically Float32Array for display).
 *
 *   | field        | encoding          | decode            |
 *   |--------------|-------------------|-------------------|
 *   | fps          | Int16Array  × 10  | fps = raw / 10    |
 *   | cpuMs        | Uint16Array × 100 | ms  = raw / 100   |
 *   | gpuMs        | Uint16Array × 100 | ms  = raw / 100   |
 *   | heapUsedMB   | Uint16Array × 1   | mb  = raw         |
 *   | drawCalls    | Uint32Array × 1   | n   = raw         |
 *   | triangles    | Uint32Array × 1   | n   = raw         |
 *   | geometries   | Uint32Array × 1   | n   = raw         |
 *   | textures     | Uint32Array × 1   | n   = raw         |
 *
 * Fields are optional so the producer can omit what isn't subscribed /
 * isn't available in the current environment (e.g. `gpuMs` when
 * `trackTimestamp` is off, `heapUsedMB` on Safari).
 */
export interface StatsPayload {
  /** Frame index of the first sample in every array. */
  startFrame: number
  /** Number of valid samples. Arrays may be longer; only read `count`. */
  count: number
  /** FPS × 10 (one sample per frame). */
  fps?: Int16Array
  /** CPU frame time ms × 100. */
  cpuMs?: Uint16Array
  /** GPU frame time ms × 100 (async-resolved; may be stale or absent). */
  gpuMs?: Uint16Array
  /** JS heap MB (rounded) per frame. Absent on Safari / Firefox. */
  heapUsedMB?: Uint16Array
  /** Raw counts per frame. */
  drawCalls?: Uint32Array
  triangles?: Uint32Array
  /** lines + points (aggregated primitive count). */
  primitives?: Uint32Array
  geometries?: Uint32Array
  textures?: Uint32Array
  /**
   * JS heap limit in MB. Static per environment so carried as a scalar,
   * not an array. Set only on the first batch (then omitted).
   */
  heapLimitMB?: number
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

/**
 * Kind tag for a registered CPU array. Determines how the pane
 * presents it — histogram / sparkline for 1D numeric data, min/max
 * tables for vector kinds, bit strips for flag arrays.
 */
export type RegistryEntryKind =
  | 'float'      // Float32Array — scalar 1D
  | 'uint'       // Uint32Array  — scalar 1D, integer
  | 'int'        // Int32Array   — scalar 1D, signed integer
  | 'float2'     // Float32Array interpreted as vec2 pairs
  | 'float3'     // vec3 triples
  | 'float4'     // vec4 quads
  | 'bits'       // Uint32Array interpreted as a bitmask

/**
 * One entry in the registry delta. `version` bumps whenever the host
 * mutates or replaces the buffer — absent between batches means "no
 * change since last emit". Typed-array `sample` is shipped by
 * structured-cloned copy (small enough at registry sizes; switch to
 * transferList or atlas textures in Phase C for anything large).
 */
export interface RegistryEntryDelta {
  kind: RegistryEntryKind
  /** Monotonic — incremented by the provider each time it re-samples. */
  version: number
  /** Number of valid elements (typed arrays may be padded at the end). */
  count: number
  /**
   * The sample itself. Typed array view; consumers should treat it as
   * owned-by-the-message (structured-cloned copy). Absent when the
   * consumer's filter excludes this entry — name/kind/count still
   * arrive so the UI knows the entry exists and can be selected, but
   * the (often large) typed-array payload is omitted.
   */
  sample?: Float32Array | Uint32Array | Int32Array
  /** Optional human label (defaults to the entry name). */
  label?: string
}

/**
 * Registry feature payload. Sent on the `registry` feature of the data
 * packet. Delta rules:
 *   - `entries[name]` absent → no change for that entry.
 *   - `entries[name] = null` → entry removed.
 *   - `entries[name] = delta` → new / updated.
 */
export interface RegistryPayload {
  entries?: Record<string, RegistryEntryDelta | null>
}

/**
 * Pixel type tag for a texture snapshot. Controls client-side
 * interpretation + range remapping. MVP only does `rgba8`; float and
 * half-float land when a proper downsample pass is added.
 */
export type TexturePixelType = 'rgba8' | 'r8' | 'rgba16f' | 'rgba32f'

/**
 * How the consumer should visualise a buffer's pixels.
 *
 * - `colors`     — Treat as display-ready RGB(A). Floats are clamped
 *                  to `[0, 1]`. Use for color textures, tone-mapped HDR.
 * - `normalize`  — Per-channel auto-normalise: scan min/max, remap to
 *                  `[0, 1]`. Default for float buffers; reveals data
 *                  whose natural range isn't 0..1 (positions, indices,
 *                  intensities).
 * - `mono`       — Treat the first channel as luminance, render
 *                  greyscale. Good for masks / single-value buffers.
 *                  Auto-normalises.
 * - `signed`     — Centre 0 as mid-grey; positives push red, negatives
 *                  push green. Auto-symmetric range. Use for SDFs and
 *                  signed deltas.
 *
 * Defaults when the producer doesn't specify:
 *   - byte formats (`rgba8`, `r8`)            → `colors`
 *   - float formats (`rgba16f`, `rgba32f`)    → `normalize`
 */
export type BufferDisplayMode = 'colors' | 'normalize' | 'mono' | 'signed'

/**
 * One registered debug buffer's metadata + optional sample. Same
 * shape pattern as `RegistryEntryDelta` — metadata always ships (so
 * the UI can list/cycle available buffers), `pixels` only ships when
 * the consumer's selection includes this name.
 */
export interface BufferDelta {
  width: number
  height: number
  pixelType: TexturePixelType
  /** Monotonic; bumps on re-sample or re-register. */
  version: number
  /**
   * CPU-side readback. Absent when the consumer didn't ask for samples.
   * Row-major, tightly packed, origin top-left. For `rgba8` / `r8` a
   * `Uint8Array`; for float variants a `Float32Array`. Half-float is
   * expanded to Float32 on the provider so the client doesn't need a
   * Float16 parser.
   */
  pixels?: Uint8Array | Float32Array
  /** Optional human label (falls back to the entry name). */
  label?: string
  /** How the consumer should visualise this buffer. See `BufferDisplayMode`. */
  display?: BufferDisplayMode
}

/**
 * `buffers` feature payload. Each key is a registered buffer name;
 * value `null` means unregistered. Metadata ships regardless of the
 * consumer's selection so the UI can list available buffers; pixels
 * are gated by the selection.
 */
export interface BuffersPayload {
  entries?: Record<string, BufferDelta | null>
}

/**
 * Provider data packet — emitted on each batch flush when subscribed
 * features have fresh content. Silence = "nothing changed". Carried on
 * the per-provider data channel, so it's implicitly addressed — no
 * `providerId` field needed.
 */
export interface DataPayload {
  /** Engine render frame this packet was emitted from. */
  frame: number
  features: {
    stats?: StatsPayload | null
    env?: EnvPayload | null
    buffers?: BuffersPayload | null
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
   * Registry entry selection. Only meaningful when `'registry'` is in
   * `features`.
   *   - `undefined` — ship every entry (default).
   *   - `[]`        — consumer wants no entries right now.
   *   - `[name, …]` — consumer only wants these entries.
   * Provider takes the *union* of all consumers' selections (any
   * consumer that omits the field forces no-filter drain).
   */
  registry?: string[]
  /**
   * Buffer selection — same semantics as `registry`, for the
   * `'buffers'` feature. Readback is expensive, so consumers are
   * expected to send a short list (typically one name at a time).
   */
  buffers?: string[]
}

/**
 * Provider → consumer: subscription confirmation. Echoes features
 * actually honoured + carries a one-shot bootstrap env snapshot so the
 * consumer knows capabilities without having to subscribe to env just
 * to find out.
 */
export interface SubscribeAckPayload {
  id: string
  features: DebugFeature[]
  env: EnvPayload
}

/** Consumer → provider: explicit leave. */
export interface UnsubscribePayload {
  id: string
}

/**
 * Consumer → provider: "I'm still alive." Cadence: `ACK_INTERVAL_MS`.
 * Provider drops the consumer after `ACK_GRACE_MS` without one.
 */
export interface AckPayload {
  id: string
}

/** Provider → consumers: idle liveness signal. Presence is the info. */
export interface PingPayload {}

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
