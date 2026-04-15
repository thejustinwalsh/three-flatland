# Debug Buffer Atlas

Status: design — spikes pending
Target: dev-only introspection of GPU textures, storage buffers, and CPU-side
instance arrays across effects, passes, and materials.

## Goals

- Dev-only, **zero runtime and zero bundle cost** in production. No "is debug
  enabled?" branch shipping to prod. If the consumer doesn't opt in, none of
  this exists in their bundle.
- One unified registry: effects/passes/materials call `register(...)` on attach
  and `unregister(...)` on dispose. Registry doesn't know their internals.
- Live preview in tweakpane (PIP), with a button to expand into a fullscreen
  overlay that sits below tweakpane but above the game canvas.
- Predictable GPU cost. All registered textures render into a single atlas on
  a throttled tick; PIP reads one slot. Adding more registered buffers doesn't
  blow out VRAM or per-frame shader cost unboundedly.
- Pure GPU path wherever possible (`copyTextureToTexture` when formats/sizes
  align, single-pass blit shader otherwise). CPU readback only for data that's
  CPU-resident in the first place (`Float32Array` instance/light buffers).

## Non-goals

- TSL node graph visualization (structural, not value-based) — separate tool.
- Production-facing diagnostics (performance overlays, Sentry reporting, etc.)
  — this is a developer workflow tool, not a telemetry system.
- Video recording / timeline scrubbing of buffers — potential follow-up;
  out of scope for v1.

## Package split

**`three-flatland` (core)** — ships a thin interface and attach point only:

```ts
export interface DebugBufferRef {
  name: string
  category?: 'lighting' | 'materials' | 'post' | 'sprites' | string
  kind: 'texture' | 'storage' | 'cpu-array'
  format?: DebugFormat  // interpretation hint, see taxonomy below
  get(): Texture | GPUBuffer | Float32Array
}

export interface DebugRegistry {
  register(buf: DebugBufferRef): void
  unregister(name: string): void
}

class Flatland {
  debug?: DebugRegistry  // undefined unless attached
  attachDebug(reg: DebugRegistry): this
}
```

Core has no implementation, no imports of the debug package, no shaders, no
canvas code. Footprint = one optional field on `Flatland` and ~30 lines of
type declarations. Effects call `this.flatland.debug?.register(...)` — it's
a no-op optional chain when unattached.

**`@three-flatland/debug` (new package)** — the whole machinery:
`DebugRegistryImpl`, atlas allocator, Phase 1 format shaders, PIP presenter,
fullscreen presenter, tweakpane plugin. Nothing in this package is referenced
by core.

## Opt-in pattern

Consumer's `main.ts`:

```ts
const flatland = new Flatland({ viewSize: 400 })
// ... wire up scene, renderer, pane ...

if (import.meta.env.DEV) {
  const { DebugRegistryImpl, mountDebugUI } = await import('@three-flatland/debug')
  const debug = new DebugRegistryImpl(renderer)
  flatland.attachDebug(debug)
  mountDebugUI(pane, debug)
}
```

Prod build: Vite replaces `import.meta.env.DEV` with `false`, the entire `if`
block becomes dead code, the dynamic `import()` expression is never emitted,
`@three-flatland/debug` is not in the bundle. Zero bytes.

Dev build: the `import()` resolves lazily to its own chunk. Game loads
immediately; debug chunk arrives async while effects are initializing.

## Zero-cost enforcement

- **Static-import prohibition in core.** ESLint `no-restricted-imports` on
  `@three-flatland/debug` under `packages/three-flatland/src/`. Any attempt to
  statically reference the debug package from core fails CI.
- **Bundle grep in CI.** Build one example in prod mode, grep output for known
  debug symbols (`DebugRegistryImpl`, atlas shader string literals). Fail if
  any present.
- **`sideEffects: false`** on `@three-flatland/debug/package.json`.
- **No top-level registrations.** All shader / plugin / singleton work happens
  inside `DebugRegistryImpl`'s constructor or `mountDebugUI()`. Module import
  alone must not register anything globally.

## Format taxonomy

`DebugFormat` is an interpretation hint used by Phase 1 shaders and CPU
presenters to pick the right conversion. Initial set:

| Format                | Source kind | Shader behavior                              |
|-----------------------|-------------|----------------------------------------------|
| `rgba8` (default)     | texture     | sample as-is                                 |
| `rgba-premul`         | texture     | un-premultiply before display                |
| `sdf-distance`        | texture     | single-channel → grayscale + isoline overlay |
| `depth-linear`        | texture     | linearize + grayscale                        |
| `normal-xyz`          | texture     | remap `xyz*0.5+0.5` to color                 |
| `tile-light-count`    | storage     | indexed-by-fragment, false-color ramp (0→N)  |
| `tile-light-indices`  | storage     | hash-to-color on indices, edge lines         |
| `float-array`         | cpu-array   | CPU canvas grid with value text / cell color |
| `uint-array`          | cpu-array   | same as float-array with integer formatting  |

New formats are added by registering a shader variant under a format key in
the debug package. Registry entries declaring an unknown format fall back to
`rgba8` with a warning.

## Pipeline

### Phase 1 — write-to-atlas

Runs at a throttled tick rate (default 15 Hz, configurable 1–60 via tweakpane
slider). Skipped entirely when:

- tweakpane folder is collapsed, AND
- fullscreen overlay is collapsed

Per-tick:

1. For each registered `texture` / `storage` buffer, run its format-specific
   shader, rendering into the buffer's assigned atlas slot (viewport/scissor
   to slot rect, aspect-fit with letterbox — margins a distinctive dim
   magenta so "buffer is smaller than slot" is visually distinct from
   "buffer is black").
2. For each registered `cpu-array` buffer, upload to a small GPU staging
   texture (dev-only allocation), then run the same slot-write path. Keeps
   one unified atlas; no mixed CPU/GPU presenter.

Atlas default: 1024×1024 `bgra8unorm`, 16 slots of 256×256 (4×4 grid). Sizes
configurable; total VRAM = ~4 MB at default.

### Phase 2 — PIP present

Always runs when tweakpane folder is open. Copies selected slot from atlas
to the tweakpane's small canvas via `copyTextureToTexture` when slot size
equals canvas size (pure DMA, no shader). Falls back to a one-pass blit
shader for aspect mismatch.

Tweakpane canvas: fixed ~256×256 square (or canvas size configurable on
plugin init). Always shows the currently selected buffer.

### Phase 3 — fullscreen present (optional)

Active only while the fullscreen overlay is expanded. Runs the selected
buffer's format shader **directly into the fullscreen canvas's swapchain
texture at window resolution**. Does not go through the atlas — gives max
fidelity, no slot-size compression. Aspect-fit with letterbox.

The fullscreen canvas is its own `GPUCanvasContext` on the same `GPUDevice`,
configured with `usage: RENDER_ATTACHMENT | COPY_DST`. Z-index 9998, below
tweakpane (9999), above the game canvas.

Toggle sources:
- Expand button in tweakpane
- ESC key
- Click on overlay (outside tweakpane)

When collapsed, the fullscreen canvas element is unmounted from the DOM
(reclaims swapchain VRAM). Re-mount on next expand.

## Slot allocator

`AtlasAllocator` with:

- Fixed slot count at init time.
- Free list; register takes from front, unregister adds to back.
- Slot assignment is stable for the lifetime of a registered buffer.
- Defrag pass on fold→expand transitions (when we're not drawing anyway)
  if fragmentation wastes >25% of slots.

Register returns the slot index for the debug package's own bookkeeping;
consumers don't see it.

## Tweakpane plugin shape

`mountDebugUI(pane: Pane, registry: DebugRegistry): void` — mounts one folder
under the given pane with:

- Radio-bar selector populated from `registry.list()`, updates when registry
  changes (internal subscription).
- Canvas child element (HTMLCanvasElement) for the PIP preview.
- Expand button — toggles fullscreen presenter.
- Grid-all toggle — swaps PIP from "one slot" to "full atlas" (free mode
  since all slots are already being written Phase 1).
- Tick rate slider (1–60 Hz) bound to Phase 1 scheduler.
- Visibility gates driven by tweakpane's `'fold'` event, plus
  `document.visibilityState` listener, plus `IntersectionObserver` on the
  canvas (all three must indicate "not visible" to skip Phase 1).

## Pure GPU paths (fast path ladder)

**Tier 1 — `copyTextureToTexture`** — same format, same size, source has
`COPY_SRC` usage, dest has `COPY_DST` usage. Pure DMA. Used for Phase 2
when slot size matches canvas size, and any time format conversion isn't
needed.

**Tier 2 — single blit shader** — format conversion or scaling required.
Fullscreen draw with a format-specific fragment. Used for Phase 1 always,
Phase 2 when aspect differs, Phase 3 always.

**Tier 3 — CPU readback** — only for screenshot/capture feature (post-v1).
Never in the hot path.

## Required three-flatland core changes

- `Flatland.debug?: DebugRegistry` field + `attachDebug(reg)` method.
- `RenderTarget` usage flag exposure. Atlas + fullscreen canvas RTs need
  `COPY_SRC | COPY_DST | RENDER_ATTACHMENT`. Current `RenderTarget` options
  may not expose WebGPU usage bits — spike to confirm (see Spikes below).
- `renderer.getDevice()` accessor confirmed reachable from outside the core
  (also a spike — Three.js's `WebGPURenderer` API surface).

## Message bus

Communication between the registry, tweakpane UI, PIP presenter, and
fullscreen presenter goes through a transport-abstracted message bus.
**Bus carries commands and state-change events only. It never carries
pixel data.** All rendering stays local to the single shared `GPUDevice`.

```ts
interface DebugTransport {
  send(msg: DebugMessage): void
  on(handler: (msg: DebugMessage) => void): () => void
}
```

**v1 ships `BroadcastChannelTransport` as the only implementation.** Reasons:

- **Yields between UI event and engine response.** `postMessage`
  enqueues the listener as a task on the event loop, not synchronously.
  A tweakpane click handler returns immediately; the browser can repaint
  and flush input before the registry handler runs. With a synchronous
  `EventEmitter`, a click that triggers heavy downstream work (Phase 1
  rebuild, shader variant compile, etc.) stalls the tab inside the
  click handler. This is the single best reason to prefer
  BroadcastChannel — everything else is a tie. Note: not parallelism,
  not Worker-style isolation, just macrotask-granularity breathing room
  between events.
- **Structured-clone enforces POD message discipline from day one.** No
  closures, class instances, or DOM refs leak into the bus by accident
  — the transport will reject them. Keeps the wire format future-proof.
- **Pop-out debugger window is zero additional work** when it lands:
  open `window.open(...)`, construct a new
  `BroadcastChannel('flatland-debug')` in it, it's on the bus.
- **Works in Node 15+ and jsdom** so test harnesses need no polyfill.
- **No meaningful perf gap** vs an in-process `EventEmitter` for our
  use case. The bus carries human-speed commands, not per-frame data.
  Structured-clone on `{ type, payload }` is microseconds — dwarfed by
  the benefit of not blocking UI handlers.

Future transports that slot into the same abstraction:

- **`PostMessageTransport`** — cross-origin iframe scenarios where
  BroadcastChannel's same-origin constraint bites.
- **`WebSocketTransport`** — remote debugger, headless CI, native host
  drivers. Same message schema, serialized to the wire.

`DebugRegistryImpl` and `mountDebugUI` take a transport at construction;
default constructs a `BroadcastChannelTransport('flatland-debug')`.
Callers pass a different transport only when they need one.

### BroadcastChannel semantic note

Per spec, a `BroadcastChannel` does **not** receive its own sent
messages — only other `BroadcastChannel` instances on the same channel
name receive them. This is correct pub/sub: the registry shouldn't hear
its own `registry:changed`. Treat it as a guardrail, not a quirk. If a
component needs to react to state it itself published, it should update
its local state directly (not round-trip through the bus).

### Topics and the pause-on-no-listeners protocol

Producers publish on *topics*. Listeners advertise interest via
`ui:subscribe` pings once per second per topic; producer pauses topics
whose last ping is >2s old. No explicit refcount — ping-presence *is*
the refcount.

| Topic                | What it feeds        | Pauses when nobody's listening |
|----------------------|---------------------|-------------------------------|
| `stats:frame`        | FPS, drawCalls, triangles | Skip `renderer.info` snapshot, skip dispatch. Near-zero anyway since `info.render` is already populated, but no structured-clone cost. |
| `stats:gpu`          | async GPU timestamps | Stop scheduling `resolveTimestampsAsync`. Removes query-pool churn — meaningful cost saved. |
| `atlas:tick`         | Phase 1 shader passes for all registered buffers | Dominant cost of the whole system. Skip when PIP folder is collapsed. |
| `atlas:fullscreen`   | Phase 3 direct format shader at window res | Skip when overlay is collapsed. |
| `registry:changed`   | set of registered buffer names | Always produced. No cost — fires only on register/unregister. |

Consumer-side auto-wiring (in `@three-flatland/devtools`): tweakpane
folder `'fold'` event → post `ui:unsubscribe` for that folder's topic;
`'unfold'` → post `ui:subscribe` + start the 1s ping interval. Window
close / tab hidden → stop pinging → producer auto-pauses on timeout.

### Message schema (POD, versioned)

All payloads are structured-clone compatible. No DOM nodes, no functions,
no `ImageBitmap` (see "Snapshots" below for why).

```ts
type Topic =
  | 'stats:frame'
  | 'stats:gpu'
  | 'atlas:tick'
  | 'atlas:fullscreen'
  | 'registry:changed'

type DebugMessage =
  // Producers → subscribers
  | { v: 1, type: 'stats:frame', payload: {
      frame: number
      drawCalls: number
      triangles: number
      geometries: number
      textures: number
      cpuMs?: number
      fps?: number
    } }
  | { v: 1, type: 'stats:gpuReady', payload: { frame: number, gpuMs: number } }
  | { v: 1, type: 'registry:changed', payload: { names: string[] } }

  // Subscribers → producers
  | { v: 1, type: 'ui:subscribe',   payload: { topic: Topic } }
  | { v: 1, type: 'ui:unsubscribe', payload: { topic: Topic } }

  // UI-local state (sent across windows when pop-out lands)
  | { v: 1, type: 'registry:select', payload: { name: string } }
  | { v: 1, type: 'ui:expand',       payload: { on: boolean } }
  | { v: 1, type: 'ui:gridAll',      payload: { on: boolean } }
  | { v: 1, type: 'tick:set',        payload: { hz: number } }
```

The `v` tag is the protocol version. Future breaking changes bump it and
the receivers route by version.

### Why no pixel data on the bus

A previous draft included a `frame:preview` message carrying
`ImageBitmap`s for pop-out windows. Removed. Reasoning:

- Local debug rendering requires a shared `GPUDevice`. Every renderer
  (PIP canvas, fullscreen overlay canvas, and any future in-process
  pop-out that wants GPU) pulls the device off the main
  `WebGPURenderer`. Multiple `GPUCanvasContext`s on one device is free;
  cross-window WebGPU device sharing is not generally supported and
  would add platform-quirk surface for no gain.
- Pop-out windows that *want* visuals should receive commands only and
  either (a) render nothing, just act as remote controllers, or (b) opt
  into the separate Snapshot feature (see below).
- Keeps the hot-path message bus tiny and fast. High-frequency state
  churn (selection changes, tick-rate changes) doesn't compete with
  multi-megabyte pixel payloads.

### Back-pressure and origin

- `BroadcastChannel` (v1): no built-in back-pressure. Rate-limit
  high-frequency producers at the sender (debounce scroll-driven
  IntersectionObserver jitter, coalesce rapid slider drag events, etc.).
- `PostMessageTransport` (future): validate `event.origin` on receive;
  hard-fail unexpected origins even in same-window setups.
- `WebSocketTransport` (future): auth tokens, message size caps,
  drop-on-slow-receiver for high-rate streams.

## Snapshots (separate feature, not in v1)

Capturing a buffer as image data is explicitly *not* a message-bus
concern. It's a separate capability, opt-in and off the hot path.

API shape:

```ts
debug.snapshot(name: string, format: 'png' | 'raw'): Promise<Blob>
```

Implementation: Tier 3 CPU readback (`mapAsync` on a staging buffer or
`readPixels` on a canvas). Used for:

- PNG export from tweakpane ("save current buffer")
- Sending frames to a remote debugger over `WebSocketTransport` (where
  cost is acceptable because the remote debugger is off by default)
- Regression tests that pixel-compare against golden images

Snapshots are explicit request/response, not streamed over the bus.
Users who want "live remote preview" pay the cost consciously by calling
`snapshot()` in a loop — the system doesn't decide for them.

## Phased rollout

Sequence is strict: each phase depends on the previous. Inside a phase,
sub-tasks can fan out to parallel agents where flagged.

**Phase 0 — rename `@three-flatland/devtools` → `@three-flatland/devtools`.**
Mechanical, single-agent. Prereq for everything else so we don't churn
the package name mid-flight. 58 files touched, changeset entry announces
the rename, `npm deprecate` on published alpha versions post-merge.

**Phase A — bus + `StatsCollector` in core.**
- `DEVTOOLS_ENABLED` gate in Flatland: `import.meta.env.DEV ||
  import.meta.env.VITE_FLATLAND_DEVTOOLS === 'true' ||
  window.__FLATLAND_DEVTOOLS__ === true`.
- Inside the gate: open `BroadcastChannel('flatland-debug')`, construct
  `StatsCollector` that hooks `scene.onAfterRender`, reads
  `renderer.info.render / .memory`, resolves GPU timestamps async,
  dispatches `stats:frame` / `stats:gpuReady`.
- Ping-protocol listener: `ui:subscribe` / `ui:unsubscribe` messages
  update per-topic "last-ping" timestamps. Producers pause topics with
  stale pings (>2s).
- Core has no reference to `@three-flatland/devtools` — not even types.
  Message schema in a shared types-only module.
- CI grep check: prod bundle without any flag contains zero references
  to `BroadcastChannel` or stats symbols.
- Parallelizable sub-tasks: schema types, StatsCollector, ping protocol.

**Phase B — `DebugRegistry` + CPU-array presenter.**
- Core adds `DebugRegistry` interface + gated impl that dispatches
  `registry:changed` on the bus.
- Effects call `flatland.debug?.register({ name, kind, format, get })`.
- First adopter: `LightStore` registers its `Float32Array` instance data.
- In devtools package: CPU presenter subscribes to `registry:changed` +
  fetches values each Phase 1 tick, renders `Float32Array` buffers as
  text tables in a tweakpane folder.
- Consumer API lands: `mountDevtoolsUI({ pane })` under dynamic `import()`
  gated on `if (import.meta.env.DEV)`.
- Parallelizable: registry impl, CPU presenter, LightStore registration.

**Phase C — GPU atlas + PIP presenter. Critical for lighting debug.**
- `AtlasAllocator`: 16 slots of 256×256 in a 1024² `bgra8unorm` RT,
  free-list, stable slot IDs.
- Phase 1 format shaders: `rgba8`, `sdf-distance`, `depth-linear`,
  `normal-xyz`.
- Phase 2 PIP presenter: Tier 1 `copyTextureToTexture` when slot/canvas
  sizes match, Tier 2 blit shader for aspect mismatch.
- Tweakpane canvas plugin: radio-bar selector, PIP canvas child, subscribes
  to `atlas:tick` via ping protocol.
- First adopters: `SDFGenerator.sdfTexture`, `OcclusionPass.renderTarget`.
- Parallelizable (5 agents): allocator, rgba8+sdf-distance shaders,
  depth+normal shaders, PIP presenter, Tier 1/Tier 2 path selection.

**Phase D — storage buffers + fullscreen overlay.**
- `tile-light-count` + `tile-light-indices` format shaders (storage buffer
  sources — fragment shader binds read-only storage, indexes by fragment
  coord).
- Fullscreen presenter: second HTMLCanvasElement, own GPUCanvasContext on
  shared device, Phase 3 direct-to-canvas at window res.
- Expand button in tweakpane, ESC key, click-outside-overlay to collapse.
- First adopter: `ForwardPlusLighting` tile buffers.
- Parallelizable (3 agents): storage-buffer shaders, fullscreen canvas +
  context, expand-button UI + key handlers.

**Phase E — polish.**
- Grid-all mode.
- Tick-rate slider.
- Snapshot feature (PNG export, CPU readback).
- Defrag pass.

## Spikes (before implementation)

1. **Vite tree-shakes dynamic import under `import.meta.env.DEV`.** Build a
   minimal example with `if (import.meta.env.DEV) await import('./heavy')`
   in prod mode, confirm `heavy.js` not emitted. Plus: confirm no reference
   to `@three-flatland/debug` module-id leaks into the prod bundle.
2. **`RenderTarget` usage flags.** Check `packages/three-flatland/src` for
   any `RenderTarget` construction with custom usage — if three.js doesn't
   expose this, we need a small wrapper or upstream API touchup.
3. **`renderer.getDevice()` stable API.** Confirm we can pull the
   `GPUDevice` off `WebGPURenderer` without private-field access.
4. **Tweakpane folder `'fold'` event.** Verify the event name / payload in
   the tweakpane version the project ships.
5. **Two `GPUCanvasContext` on one `GPUDevice`.** Smoke-test a proof-of-
   concept blit from a three.js-owned texture into a second canvas's current
   texture via `copyTextureToTexture`.

## Caveats

- **WebGL fallback**: the GPU-only paths assume WebGPU. If the engine ever
  falls back to WebGL, the debug system falls back to Tier 3 (CPU readback)
  or is disabled with a warning. Document as "debug viewer requires WebGPU."
- **Atlas slot resolution**: a 4096² shadow atlas previewed into a 256² slot
  loses a lot. Fullscreen mode exists for exactly this. Consider documenting
  "use fullscreen to inspect detail."
- **Staleness**: Phase 1 at 15 Hz means the PIP lags main render by up to
  66 ms. Fine for debugging, not suitable for any gameplay-relevant
  decisions (not that anyone should).
- **Colorspace**: debug canvases configured with same format as main canvas
  (usually `bgra8unorm` srgb-encoded). Phase 1/2/3 shaders must be careful
  about srgb-vs-linear if source RTs are in linear space. Document per
  format entry.
- **Slot assignment churn**: hot-reload scenarios may re-register buffers
  frequently, fragmenting slots. Defrag helper handles it; shouldn't bite
  day-to-day.

## First concrete milestone

Phase A lands:
- Consumer opts in via `if (import.meta.env.DEV)` dynamic import block.
- LightStore registered via `flatland.debug?.register(...)` from inside the
  lighting system, gated on `import.meta.env.DEV`.
- Tweakpane folder shows a text-table view of the light array.
- CI check: `example-react-lighting` prod bundle contains zero reference to
  the debug package.

That alone validates the whole opt-in / zero-cost design. GPU machinery
follows in Phase B.
