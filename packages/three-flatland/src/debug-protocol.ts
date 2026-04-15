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
 */

/** Channel name used by `new BroadcastChannel(DEBUG_CHANNEL)`. */
export const DEBUG_CHANNEL = 'flatland-debug'

/** Protocol version. Bumped on breaking schema changes. */
export const DEBUG_PROTOCOL_VERSION = 1

/**
 * Topics carry independent producer/consumer pairs. A consumer subscribes
 * to the topics it cares about by sending `ui:subscribe` pings; producers
 * pause topics whose last ping is older than `STALE_PING_MS`.
 */
export type DebugTopic =
  | 'stats:frame'
  | 'stats:gpu'
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

/** Stats payload — one frame's snapshot of `renderer.info.render`. */
export interface StatsFramePayload {
  frame: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  /** CPU time between begin/end markers, in ms. */
  cpuMs?: number
  /** Rolling-average frames per second, computed by the producer. */
  fps?: number
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
 * Discriminated union of all debug-bus messages. Every variant is
 * structured-clone-safe (no functions, no DOM nodes, no class instances).
 */
export type DebugMessage =
  // Producers → subscribers (data)
  | { v: 1; type: 'stats:frame'; payload: StatsFramePayload }
  | { v: 1; type: 'stats:gpuReady'; payload: StatsGpuReadyPayload }
  | { v: 1; type: 'registry:changed'; payload: RegistryChangedPayload }
  // Producers → subscribers (liveness probe)
  | { v: 1; type: 'ui:ping'; payload: UiSubscribePayload }
  // Subscribers → producers (liveness + lifecycle)
  | { v: 1; type: 'ui:subscribe'; payload: UiSubscribePayload }
  | { v: 1; type: 'ui:unsubscribe'; payload: UiSubscribePayload }
  | { v: 1; type: 'ui:pong'; payload: UiSubscribePayload }
  // UI-local state (cross-window-portable)
  | { v: 1; type: 'registry:select'; payload: RegistrySelectPayload }
  | { v: 1; type: 'ui:expand'; payload: UiToggleOnPayload }
  | { v: 1; type: 'ui:gridAll'; payload: UiToggleOnPayload }
  | { v: 1; type: 'tick:set'; payload: TickSetPayload }

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
