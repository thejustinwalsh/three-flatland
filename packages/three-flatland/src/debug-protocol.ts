/**
 * Debug-bus protocol — types and constants shared between the core engine
 * (the message *producer*) and any consumer that wants to subscribe.
 *
 * This module is **types-only** at the JavaScript level (the channel-name
 * constant is the single emitted value). Importing it has no runtime cost:
 * unused type imports erase at compile time, and the channel name string
 * is dead code unless a subscriber actually constructs a `BroadcastChannel`.
 *
 * The schema is versioned via the `v` field on every message. Future
 * breaking changes bump the version; consumers should ignore messages
 * with unrecognised versions instead of crashing.
 *
 * Both `three-flatland` (gated by `DEVTOOLS_ENABLED`) and
 * `@three-flatland/devtools` import from this module. Third-party
 * adapters (websocket bridges, chrome extensions, etc.) do the same.
 *
 * ## Delta semantics
 *
 * To minimise bandwidth and structured-clone overhead (important at
 * 60Hz for `stats:frame`), payloads use a cumulative / delta encoding:
 *
 * - **Field absent** from the payload → *no change*; subscriber keeps
 *   its previously-accumulated value.
 * - **Field === `null`** → *clear*; subscriber resets the field to
 *   undefined.
 * - **Field present with a value** → new value; subscriber overwrites.
 *
 * Fields that the engine *always* has to emit (a frame counter, a
 * required identifier) stay non-nullable in their TS type. Everything
 * else is `T | null | undefined` (omitted = no change).
 *
 * Producers track "last-sent" state per topic and reset it on every
 * `ui:subscribe` so late-joining consumers receive a full snapshot
 * on the next dispatch. Subscribers should initialise their
 * accumulated state from the first message they see after subscribing.
 */

/** Channel name used by `new BroadcastChannel(DEBUG_CHANNEL)`. */
export const DEBUG_CHANNEL = 'flatland-debug'

/** Protocol version. Bumped on breaking schema changes. */
export const DEBUG_PROTOCOL_VERSION = 1

/**
 * Type helper: message body (type + payload) without the envelope.
 * Producers typically hold a long-lived scratch body of this shape,
 * mutate its payload each tick, then call `stampMessage(scratch)` and
 * `bus.postMessage(scratch)` — the scratch object is the message, and
 * `structuredClone` inside `postMessage` decouples it from the
 * subscriber's copy, so the producer can keep mutating for the next
 * send without interference.
 */
export type DebugMessageBody = Omit<DebugMessage, 'v' | 'ts'>

/**
 * Stamp a message body with the current envelope fields (`v`, `ts`)
 * **in place**. Returns the same object, narrowed to `DebugMessage`, so
 * callers can chain or assign.
 *
 * Mutation-based so producers can hold a single scratch message and
 * reuse it across every send — one allocation at construction, zero
 * allocations per send (aside from whatever payload construction
 * requires). Safe because `bus.postMessage()` structure-clones before
 * handing to subscribers; the producer's scratch is untouched by the
 * subscriber side and free to be mutated on the next tick.
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
// that `postMessage` uses is native-code and fast; adding a JS-level
// encode/decode pass before it would cost more than the bandwidth it
// saves. Keys stay full ("drawCalls", not "dc") — the in-process win is
// negative.
//
// When a `WebSocketTransport` (or any serialize-to-bytes transport) is
// added, its adapter is the right place for key compression and
// msgpack/CBOR encoding. Producers and consumers stay oblivious;
// compression lives at the wire boundary, scoped to where it matters.

/**
 * Topics carry independent producer/consumer pairs. A consumer subscribes
 * to the topics it cares about by sending `ui:subscribe` pings; producers
 * pause topics whose last ping is older than `STALE_PING_MS`.
 */
export type DebugTopic =
  | 'stats:frame'
  | 'stats:gpu'
  | 'env:info'
  | 'atlas:tick'
  | 'atlas:fullscreen'
  | 'registry:changed'

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

/**
 * Per-frame stats snapshot. Delta-encoded: only fields that changed since
 * the last dispatch are included. `frame` is always present (monotonic
 * engine counter, doubles as a "producer alive" heartbeat).
 */
export interface StatsFramePayload {
  /** Monotonic engine-render counter. Always present. */
  frame: number
  /** Omit = no change; null = clear; number = new value. See "Delta semantics". */
  drawCalls?: number | null
  triangles?: number | null
  geometries?: number | null
  textures?: number | null
  /** CPU time between begin/end markers, in ms. */
  cpuMs?: number | null
  /** Rolling-average frames per second, computed by the producer. */
  fps?: number | null
}

/**
 * Runtime environment snapshot — versions, backend capabilities, canvas
 * dimensions. Produced on the `env:info` topic: subscribe to receive.
 *
 * Delta-encoded per the rules at the top of this file. Most fields
 * (versions, backend capabilities) are fixed at renderer construction
 * and only appear in the first snapshot after subscribe; only
 * `canvas.{width,height,pixelRatio}` change at runtime (on resize /
 * DPI switch) and produce deltas afterwards.
 *
 * Re-subscribing forces the producer to reset its delta tracker and
 * re-emit a full snapshot — that's the re-query path.
 */
export interface EnvInfoPayload {
  /** three-flatland package VERSION constant. */
  threeFlatlandVersion?: string | null
  /** Three.js REVISION string (e.g. `'183'`). */
  threeRevision?: string | null
  backend?: EnvBackendDelta | null
  canvas?: EnvCanvasDelta | null
}

/** Nested delta for backend info — all fields optional/nullable. */
export interface EnvBackendDelta {
  /** Renderer backend class name, e.g. `'WebGPUBackend'` / `'WebGLBackend'`. */
  name?: string | null
  /** Whether the renderer was constructed with `trackTimestamp: true`. */
  trackTimestamp?: boolean | null
  /**
   * WebGL-only: `true` if `EXT_disjoint_timer_query_webgl2` is available.
   * `null` when the backend isn't WebGL (distinguished from "value
   * cleared" by subscribers via context — this is a rare enough nuance
   * to tolerate).
   */
  disjoint?: boolean | null
  /**
   * Derived: can we actually resolve GPU timestamps on this backend?
   * True iff `trackTimestamp && (backend !== WebGL || disjoint)`.
   */
  gpuModeEnabled?: boolean | null
}

/** Nested delta for canvas dimensions. */
export interface EnvCanvasDelta {
  width?: number | null
  height?: number | null
  pixelRatio?: number | null
}

/** GPU timestamp readback for a specific past frame. Arrives async. */
export interface StatsGpuReadyPayload {
  frame: number
  /** GPU frame time in ms, resolved via `resolveTimestampsAsync`. */
  gpuMs: number
}

/** Registry change event — fired whenever a buffer is registered or unregistered. */
export interface RegistryChangedPayload {
  names: string[]
}

/** Subscribe / unsubscribe ping — listener heartbeat per topic. */
export interface UiSubscribePayload {
  topic: DebugTopic
}

/** UI-local state events (cross-window-portable when popout lands). */
export interface RegistrySelectPayload {
  name: string
}
export interface UiToggleOnPayload {
  on: boolean
}
export interface TickSetPayload {
  hz: number
}

/**
 * Envelope shared by every message on the bus. Held as a separate shape
 * rather than duplicated into every union variant — readability wins.
 *
 * `ts` is `Date.now()` milliseconds, stamped by the producer at post
 * time. Subscribers use it for:
 *   - Graphing data on a real time axis (stats:frame isn't strictly
 *     uniform — renders may stall or batch).
 *   - Computing latency (current `Date.now()` - `msg.ts`) to detect
 *     slow bus delivery or backgrounded-tab throttling.
 *   - Interpolating between values when `stats:frame` arrives faster
 *     or slower than the subscriber's own render cadence.
 *   - Ordering messages across a pop-out window / websocket bridge
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
  // Producers → subscribers (data)
  | { type: 'stats:frame'; payload: StatsFramePayload }
  | { type: 'stats:gpuReady'; payload: StatsGpuReadyPayload }
  | { type: 'env:info'; payload: EnvInfoPayload }
  | { type: 'registry:changed'; payload: RegistryChangedPayload }
  // Producers → subscribers (liveness probe)
  | { type: 'ui:ping'; payload: UiSubscribePayload }
  // Subscribers → producers (liveness + lifecycle)
  | { type: 'ui:subscribe'; payload: UiSubscribePayload }
  | { type: 'ui:unsubscribe'; payload: UiSubscribePayload }
  | { type: 'ui:pong'; payload: UiSubscribePayload }
  // UI-local state (cross-window-portable)
  | { type: 'registry:select'; payload: RegistrySelectPayload }
  | { type: 'ui:expand'; payload: UiToggleOnPayload }
  | { type: 'ui:gridAll'; payload: UiToggleOnPayload }
  | { type: 'tick:set'; payload: TickSetPayload }
)

/**
 * Liveness protocol — producer-driven ping/pong with self-healing.
 *
 * **Happy path:**
 *   1. Subscriber sends `ui:subscribe {topic}` once on mount.
 *   2. Producer registers the topic and starts a timer that sends
 *      `ui:ping {topic}` every `PING_INTERVAL_MS`.
 *   3. Each listening subscriber responds with `ui:pong {topic}` on every
 *      ping it receives.
 *   4. Producer records the most recent pong time per topic. If no pong
 *      arrives within `PONG_WINDOW_MS`, the topic is presumed dead — the
 *      timer shuts down, the topic is removed, and production pauses.
 *
 * **Grace window sizing:** pong window is 3× the ping interval — two
 * missed pings of slack. Enough to ride out typical scheduling jitter
 * (GC pauses, short devtools-panel animations) without false timeouts,
 * tight enough that a crashed subscriber is cleaned up promptly. A
 * genuinely long stall (debugger pause, tab backgrounding) will time
 * out; the subscriber recovers via re-subscribe (see below).
 *
 * **Self-healing (subscriber recovery):**
 *   - If a subscriber is dropped by the producer (due to lag, tab
 *     backgrounding, whatever), the producer stops sending pings for
 *     that topic. The subscriber can detect this by watching for pings
 *     itself — if it hasn't seen a ping on a topic it's subscribed to
 *     within ~2× `PING_INTERVAL_MS`, it's been dropped.
 *   - Recovery is just a fresh `ui:subscribe {topic}` message. Producer
 *     re-adds the topic, pings resume, everyone's back in sync. No
 *     explicit "reconnect" handshake — the normal subscribe path IS the
 *     reconnect path.
 *   - Because of this, subscribers should treat `ui:subscribe` as
 *     idempotent and call it liberally on any suspicion of drop.
 *
 * **Zero-cost idle:** when no topics are tracked, the producer's
 * ping timer is `null` — literally no recurring work, no bus traffic,
 * no allocations. The next `ui:subscribe` fires the engine back up.
 */

/** Producer sends `ui:ping` this often while any topic is active. */
export const PING_INTERVAL_MS = 1000

/**
 * Producer drops a topic if no pong arrives within this window. 3× the
 * ping interval = 2 missed pings of grace before declaring the topic
 * dead. Genuinely long stalls (debugger pause, backgrounded tab) will
 * time out; the subscriber heals via re-subscribe — see the protocol
 * block above.
 */
export const PONG_WINDOW_MS = 3000

/**
 * Gate semantics — two layers:
 *
 * **Layer 1 (build-time): `DEVTOOLS_BUNDLED`.** A module-scoped `const`
 * evaluated from `import.meta.env.DEV` and `import.meta.env.VITE_FLATLAND_DEVTOOLS`,
 * both of which Vite/esbuild/rollup (with appropriate `define`) inline at
 * build time. When both resolve to falsy, the constant folds to `false`,
 * every `if (DEVTOOLS_BUNDLED)` branch becomes dead code, terser removes
 * it, and no devtools code ends up in the output. Zero bytes, zero runtime
 * cost. This is the tree-shake guarantee — a plain function call with the
 * same logic is not contractually foldable, so we avoid it.
 *
 * **Layer 2 (runtime): `window.__FLATLAND_DEVTOOLS__`.** Only read when
 * the code is in the bundle (Layer 1 was truthy). Lets a user who *did*
 * build with devtools disable them on specific pages / session by
 * assigning `false` before Flatland constructs. A user who did *not*
 * build with devtools can't enable them at runtime — there's nothing in
 * the bundle to activate. Use the build flag, not the window flag, to
 * turn devtools on.
 *
 * **Global name collision**: the `__FLATLAND_DEVTOOLS__` naming follows
 * the established React / Redux / Vite devtools convention
 * (`__REACT_DEVTOOLS_GLOBAL_HOOK__`, `__REDUX_DEVTOOLS_EXTENSION__`,
 * etc.). If you run a different "Flatland" you collide — unlikely given
 * the project-specific branding.
 *
 * Result table:
 *
 * | Build flag | `window.__FLATLAND_DEVTOOLS__` | Enabled? |
 * |---|---|---|
 * | DEV=true OR VITE_FLATLAND_DEVTOOLS=true | undefined | yes (default on) |
 * | DEV=true OR VITE_FLATLAND_DEVTOOLS=true | false | no (user disabled) |
 * | DEV=true OR VITE_FLATLAND_DEVTOOLS=true | true | yes (explicit) |
 * | Neither | anything | no (code not in bundle) |
 */

/**
 * Build-time constant — foldable to `false` in plain prod builds so the
 * whole devtools subsystem tree-shakes out. Evaluated once at module
 * load; every call site reads the already-folded value.
 */
export const DEVTOOLS_BUNDLED: boolean = (() => {
  const env = (import.meta as { env?: Record<string, unknown> }).env
  if (env?.['DEV'] === true) return true
  if (env?.['VITE_FLATLAND_DEVTOOLS'] === 'true') return true
  return false
})()

/**
 * Runtime gate — cheap check callable from inside a `DEVTOOLS_BUNDLED`
 * branch. Returns `false` if the user has explicitly set
 * `window.__FLATLAND_DEVTOOLS__ = false`, otherwise `true`.
 *
 * In prod bundles with no flag set, this function itself is tree-shaken
 * because every caller is behind `if (DEVTOOLS_BUNDLED)` which folds to
 * `false`.
 */
export function isDevtoolsActive(): boolean {
  if (typeof window === 'undefined') return true
  const flag = (window as { __FLATLAND_DEVTOOLS__?: boolean }).__FLATLAND_DEVTOOLS__
  return flag !== false
}
