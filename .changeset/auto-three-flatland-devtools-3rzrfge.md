---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Dashboard

- Vite plugin (`@three-flatland/devtools/vite`) bundles and injects the dashboard into dev builds
- Preact-based dashboard with panels: stats sparklines, batch inspector, buffer viewer, registry, protocol log, env info
- Stats panel: bucketed axis range for sparkline stability; axis hysteresis with trimmed max; GPU timestamp rows shown only when the GPU supports timing queries
- Bundled vendor copies of Preact + hooks (no Preact peer dependency required in consumer projects)

## Buffer Inspector

- Buffer subscription modal with pan/zoom (wheel zoom 0.25×–64×, drag, double-click to reset)
- Pixel format conversion on a worker thread: `rgba8`, `r8`, `rgba16f`, `rgba32f`; display modes: `colors`, `normalize`, `mono`, `signed`, `alpha`
- GPU row-padding (WebGPU 256-byte alignment) stripped correctly during conversion
- VP9 video encoding for streaming mode (8-bit formats only; float textures delivered as raw pixels)
- Modal/thumbnail selection sync: thumbnail defers to modal when open; modal notifies thumbnail of buffer changes

## Controls Pane

- Minimal mode: compact layout for the Tweakpane controls pane

This release brings a full browser-embedded GPU diagnostics dashboard wired to the Flatland debug protocol.

### 8fee8bdd23e8c2fe84987c1f4e4afb656b208330
feat: add build bundle task for dashboard and related inputs
Files: .gitignore, docs/astro.config.mjs, docs/package.json, docs/public/diagrams/devtools-dashboard.png, docs/public/diagrams/lighting-off-poster.jpg, docs/public/diagrams/lighting-off.webm, docs/public/diagrams/lighting-on-poster.jpg, docs/public/diagrams/lighting-on.webm, docs/public/diagrams/passfx-off-poster.jpg, docs/public/diagrams/passfx-off.webm, docs/public/diagrams/passfx-on-poster.jpg, docs/public/diagrams/passfx-on.webm, docs/public/llms.txt, docs/scripts/capture-screenshots.mjs, docs/src/components/AnnotatedImage.astro, docs/src/components/Compare.astro, docs/src/components/DevtoolsDemo.astro, docs/src/components/Mermaid.astro, docs/src/components/lazyOnView.ts, docs/src/content/docs/examples/lighting.mdx, docs/src/content/docs/getting-started/introduction.mdx, docs/src/content/docs/getting-started/quick-start.mdx, docs/src/content/docs/guides/animation.mdx, docs/src/content/docs/guides/baking.mdx, docs/src/content/docs/guides/batch-rendering.mdx, docs/src/content/docs/guides/debug-controls.mdx, docs/src/content/docs/guides/devtools.mdx, docs/src/content/docs/guides/flatland.mdx, docs/src/content/docs/guides/lighting.mdx, docs/src/content/docs/guides/loaders.mdx, docs/src/content/docs/guides/pass-effects.mdx, docs/src/content/docs/guides/shadows.mdx, docs/src/content/docs/guides/skia.mdx, docs/src/content/docs/guides/sprites.mdx, docs/src/content/docs/guides/tilemaps.mdx, docs/src/content/docs/guides/tsl-nodes.mdx, docs/src/content/docs/index.mdx, docs/src/content/docs/llm-prompts.mdx, docs/src/styles/retro-theme.css, docs/vite-plugins/copy-devtools.js, packages/devtools/package.json, packages/devtools/vite.config.bundle.ts, pnpm-lock.yaml, turbo.json
Stats: 44 files changed, 4362 insertions(+), 254 deletions(-)

### f6dee7bcd3614859b62a5253ed17d2534e777af5
feat: implement GPU timing detection and enhance stats visibility based on capabilities
Files: packages/devtools/src/dashboard/panels/stats.tsx, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/EnvCollector.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/detectGpuTiming.ts
Stats: 5 files changed, 112 insertions(+), 32 deletions(-)

### a363bd725c752cc0557a29b252e02c7a5b1ae3d0
feat: implement axis hysteresis with trimmed max for stable rendering
Files: packages/devtools/src/dashboard/panels/stats.tsx, packages/devtools/src/stats-graph.ts
Stats: 2 files changed, 114 insertions(+), 62 deletions(-)

### ec7d4cad8ab4900f516cb1c8817c6f8b95a616df
feat: add Preact module type definitions and implementation for devtools dashboard
Files: packages/devtools/package.json, packages/devtools/src/dashboard/vendor/hooks.module.d.ts, packages/devtools/src/dashboard/vendor/hooks.module.js, packages/devtools/src/dashboard/vendor/jsx-runtime.d.ts, packages/devtools/src/dashboard/vendor/jsx-runtime.js, packages/devtools/src/dashboard/vendor/jsx.d.ts, packages/devtools/src/dashboard/vendor/preact.module.d.ts, packages/devtools/src/dashboard/vendor/preact.module.js
Stats: 8 files changed, 3757 insertions(+), 1 deletion(-)

### 1e46be783c634037233c85caa62fc903287778ea
fix: correct typecheck script to specify tsconfig
Files: packages/devtools/package.json
Stats: 1 file changed, 1 insertion(+), 1 deletion(-)

### c69961f4211ccb9ae4ba6e43dee670a3b6a51041
feat: implement bucketed axis range for sparkline stability
Files: packages/devtools/src/dashboard/panels/stats.tsx, packages/three-flatland/src/debug/StatsCollector.ts
Stats: 2 files changed, 185 insertions(+), 26 deletions(-)

### 7bd24cb67f3f614627accd34c3547b0e7e54e419
feat: enhance shadow tracing with elevation-aware occlusion and signed SDF; improve material and sprite handling for debug tools
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/react/lighting/public/sprites/slime.json, packages/devtools/src/dashboard/app.tsx, packages/devtools/src/dashboard/client.ts, packages/devtools/src/dashboard/index.html, packages/devtools/src/dashboard/panels/batches.tsx, packages/devtools/src/devtools-client.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/BatchCollector.test.ts, packages/three-flatland/src/debug/BatchCollector.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/loaders/normalDescriptor.test.ts, packages/three-flatland/src/loaders/normalDescriptor.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 23 files changed, 3017 insertions(+), 157 deletions(-)

### 03376a02befaffaaeff5e0cc96cc60bc1b080f62
feat: controls minimal mode
Files: packages/devtools/src/create-pane.ts, packages/devtools/src/theme.ts
Stats: 2 files changed, 218 insertions(+), 11 deletions(-)

### c0474381fb62580efa161347fa90a393b5b2ea7c
fix: update typecheck path, clean up dashboard tsconfig, and enhance registry panel visuals
Files: packages/devtools/package.json, packages/devtools/src/dashboard/index.html, packages/devtools/src/dashboard/panels/protocol-log.tsx, packages/devtools/src/dashboard/panels/registry.tsx, packages/devtools/src/dashboard/tsconfig.json, packages/devtools/tsconfig.dashboard.json, packages/devtools/tsup.config.ts
Stats: 7 files changed, 668 insertions(+), 90 deletions(-)

### d71fd3080912395f5ff7e7250411457b2b731f93
feat: vite plugin for devtools dashboard
Files: examples/vite.config.ts, packages/devtools/package.json, packages/devtools/src/dashboard/app.tsx, packages/devtools/src/dashboard/client.ts, packages/devtools/src/dashboard/export.ts, packages/devtools/src/dashboard/hooks.ts, packages/devtools/src/dashboard/index.html, packages/devtools/src/dashboard/index.tsx, packages/devtools/src/dashboard/panels/buffers.tsx, packages/devtools/src/dashboard/panels/env.tsx, packages/devtools/src/dashboard/panels/header-stats.tsx, packages/devtools/src/dashboard/panels/producer-select.tsx, packages/devtools/src/dashboard/panels/protocol-log.tsx, packages/devtools/src/dashboard/panels/registry.tsx, packages/devtools/src/dashboard/panels/stats.tsx, packages/devtools/src/dashboard/protocol-store.ts, packages/devtools/src/devtools-client.ts, packages/devtools/src/vite-plugin.ts, packages/devtools/tsconfig.dashboard.json, packages/devtools/tsconfig.json, packages/devtools/tsup.config.ts, pnpm-lock.yaml
Stats: 22 files changed, 3540 insertions(+), 13 deletions(-)

### c227ab4942cee2a203e734be02c14b5119bdef85
feat: enhance debug protocol with buffer subscription and effect field location
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 22 files changed, 673 insertions(+), 221 deletions(-)

### a0a0d9c879d267f0e1a8495e5549dd75f565c254
fix: sync modal and thumbnail buffer selection
The thumbnail view's syncSelection() was overwriting the modal's
buffer subscription on every state change listener callback — killing
the stream subscription and resetting the selection back to whatever
the thumbnail showed.

Fix: thumbnail defers to modal when it's open. Modal notifies
thumbnail of active buffer changes and open/close state via callbacks.
When modal closes, thumbnail resumes driving the selection.

New BuffersViewHandle methods: setModalOpen(), setActiveFromModal().
New BuffersModalOptions callbacks: onActiveChange, onOpen, onClose.
Files: packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts
Stats: 3 files changed, 38 insertions(+), 9 deletions(-)

### 9b3d3c83728c1bec5e2b3d7c310f15339e7c32b1
fix: sync stream subscription when switching buffers in modal
Files: packages/devtools/src/buffers-modal.ts
Stats: 1 file changed, 7 insertions(+), 1 deletion(-)

### 11440df5e3318221e120973adc73488d7fec86b2
refactor: unified worker conversion + GPU row padding + alpha display
All pixel format conversion now happens on the worker thread. Provider
ships raw bytes in native format, worker converts to display-ready
RGBA8, then broadcasts as buffer:raw (or VP9-encodes for stream mode).
Consumer receives RGBA8 only — no decoder math on main thread or
consumer side.

Pipeline:
  Provider → __convert__(raw bytes, pixelType, display, pixelsByteLength)
  Worker: convertToRGBA8() → RGBA8
    ├─ stream: VP9 encode → buffer:chunk
    └─ raw:    buffer:raw  → putImageData directly

Key fixes:
- Pass actual pixel byte length separately from pool buffer size.
  Pool buffers are 2MB; pixel data is ~900KB. Without this, padding
  detection computed wildly wrong row strides (~7KB instead of 3KB).
- GPU row padding: WebGPU aligns bytesPerRow to 256. three.js r183
  does NOT strip this padding. Converter detects it from data byte
  length and reads with correct row stride.
- Worker bounces pool buffer AFTER conversion (was bouncing before,
  detaching the ArrayBuffer mid-read).
- New 'alpha' display mode reads the A channel as greyscale. Used
  by occlusion mask where RGB=(0,0,0) and data is in alpha only.
- Removed all consumer-side decoder functions from buffers-view.ts
  and buffers-modal.ts.
- Square corners on modal canvas (removed border-radius).

pixel-convert.ts handles: rgba8, r8, rgba16f (f16→f32 via manual
half-float decode), rgba32f. Each with display modes: colors,
normalize, mono, signed, alpha. 11 unit tests including GPU row
padding scenarios.
Files: packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/devtools-client.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/bus-transport.ts, packages/three-flatland/src/debug/bus-worker.ts, packages/three-flatland/src/debug/pixel-convert.test.ts, packages/three-flatland/src/debug/pixel-convert.ts, packages/three-flatland/src/lights/OcclusionPass.ts
Stats: 10 files changed, 561 insertions(+), 416 deletions(-)

### 2760e2e5fa0c4470c208aadc966b1ef10bf3e4eb
fix: prevent paint() from wiping decoder output + skip float encoding
Two fixes for the fullscreen modal:

1. When VideoDecoder is active, skip the raw-pixel paint() path in
   refresh(). In stream mode the provider strips pixels from the data
   batch, so snap.pixels is null — paint() was resetting the canvas
   to 1×1, overwriting the decoder's output every state change.

2. Only VP9-encode rgba8/r8 textures. Float textures (rgba16f/rgba32f)
   fall through with raw pixels intact — the VideoEncoder expects 8-bit
   RGBA input, and feeding it float bytes produces garbage. The
   consumer's CPU decoder handles float data correctly.

Also preserve Float32Array from readback (don't wrap as Uint8Array)
so the consumer's decoders see the correct typed array.
Files: packages/devtools/src/buffers-modal.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 5 files changed, 17 insertions(+), 10 deletions(-)

### 2ece830bbedd6d77b9628193de1bec91b0d9308a
fix: always show zoom level, only hide reset at identity
Files: packages/devtools/src/buffers-modal.ts
Stats: 1 file changed, 2 insertions(+), 1 deletion(-)

### 1fb3f81627cb55f10779cd064f0875a38476df64
fix: move zoom controls to top-left to avoid docs page overlap
Files: packages/devtools/src/buffers-modal.ts
Stats: 1 file changed, 19 insertions(+), 14 deletions(-)

### c3624a92a83afdf7a86b4cd019ab03140b4e42ff
fix: modal pan/zoom — clip overflow, extents, info overlay
- Wheel listener on main container (not canvas) — prevents page scroll
  via preventDefault+stopPropagation on the parent area
- overflow:hidden on main clips transformed canvas to its container
- Zoom clamped to 0.25×–64×
- Zoom info overlay (bottom-right): shows zoom level + pan offset,
  hidden at default 1.0× position
- Reset button (bottom-left) + double-click canvas to reset
- Drag events on main (not canvas) so dragging works even when canvas
  is smaller than the viewport area
- Cleanup: window mousemove/mouseup listeners removed on dispose
Files: packages/devtools/src/buffers-modal.ts
Stats: 1 file changed, 68 insertions(+), 22 deletions(-)

### 388ed1e7b6019b68dd45240f7d24f4b31a4de11c
feat: modal pan/zoom + register SDF/occlusion debug textures
Modal:
- Mouse wheel zoom centered on cursor, drag to pan
- Reset transform on buffer switch + modal open
- Canvas cursor changes to grab/grabbing during interaction

New debug texture registrations:
- sdf.distanceField (RenderTarget, rgba16f, display: signed) — the
  signed distance field, viewport-sized, shows wall distances as a
  diverging red/green gradient
- occlusion.mask (RenderTarget, rgba8, display: mono) — binary
  occlusion silhouette, viewport-sized, white=solid black=empty
Files: packages/devtools/src/buffers-modal.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 3 files changed, 82 insertions(+)

### 8b3ae9bfdb04385b87ee8bb9e642d6e2cdce7ba5
feat: WebCodecs VP9 encoding for fullscreen buffer streaming
Adds worker-side VP9 video encoding for the fullscreen buffer modal.
When the modal opens, the provider encodes readback pixels via
VideoEncoder on the bus worker thread and broadcasts EncodedVideoChunks.
The consumer decodes them via VideoDecoder and draws VideoFrames
directly to the modal canvas. Thumbnails stay on the existing raw-pixel
path.

Architecture:
- StreamEncoder class in bus-worker.ts wraps VideoEncoder (VP9,
  quantizer mode, realtime latency, 4fps hint)
- Raw pixel buffer transferred to worker, copied into VideoFrame,
  bounced back to pool immediately (encoder has its own copy)
- Encoded chunks broadcast as 'buffer:chunk' messages on the existing
  BroadcastChannel
- Worker probes codec support on init, reports back to producer

Protocol:
- BufferChunkPayload type (name, frame, capturedAt, dims, codec, data)
- SubscribePayload.streamBuffers flag triggers encode path
- Force keyframe on new subscriber + dimension change + every ~2s

Provider (DevtoolsProvider._flush):
- Stream mode: drain metadata only (no raw pixels in data batch),
  post __encode__ requests to worker with pixel buffers
- Non-stream mode: unchanged raw-pixel path

Consumer (buffers-modal.ts):
- Creates VideoDecoder on first chunk, reconfigures on dimension change
- Waits for keyframe before decoding (handles late join)
- Falls back to raw-pixel paint() when WebCodecs unavailable

Fallback: VideoEncoder.isConfigSupported() probed async on worker init.
When unsupported (Firefox, older Safari), stream flag is silently
ignored and raw pixels flow as before.
Files: packages/devtools/src/buffers-modal.ts, packages/devtools/src/devtools-client.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/bus-transport.ts, packages/three-flatland/src/debug/bus-worker.ts
Stats: 7 files changed, 503 insertions(+), 24 deletions(-)

### 2a8ea7a857a6ae3414c54af22e25e8e963002c5a
fix: React lifecycle overhaul + DevtoolsProvider pure constructor
DevtoolsProvider class:
- Constructor is now side-effect-free (no BroadcastChannel, no Worker,
  no announce, no timer). Safe to construct speculatively from R3F
  reconciler — discarded renders produce inert objects that GC cleanly.
- Explicit start()/dispose() lifecycle. start() opens channels, announces,
  starts flush timer. dispose() tears down and broadcasts provider:gone.
  Both idempotent, multi-cycle (start→dispose→start works).
- Flatland.render() lazy-starts on first call; vanilla and React paths
  both activate only when render() is actually invoked.

React hooks:
- usePane: dropped useFrame dependency entirely. Stats graph now self-ticks
  via driver:'raf' (own requestAnimationFrame). Works whether usePane is
  called inside or outside <Canvas> context.
- usePaneFolder/usePaneInput: switched from deferred-disposal (setTimeout
  hack) to useLayoutEffect with [parent, key] deps. Cleanup disposes
  immediately, re-binds when parent identity changes (StrictMode remount).
- New <DevtoolsProvider /> component: passive sampler using default-phase
  useFrame (endFrame→beginFrame per tick). Does NOT take over R3F's render
  slot. Gated by DEVTOOLS_BUNDLED + isDevtoolsActive() so it's safe in
  production builds.

React examples:
- Added <DevtoolsProvider name="..."/> to all non-Flatland React examples
  (animation, basic-sprite, batch-demo, knightmark, skia, template,
  tilemap, tsl-nodes).
- pass-effects: migrated raw pane.addBinding to usePaneInput.

Renamed Flatland._debug → _devtools throughout.
Files: examples/react/animation/App.tsx, examples/react/basic-sprite/App.tsx, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/pass-effects/App.tsx, examples/react/skia/App.tsx, examples/react/template/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, packages/devtools/src/create-pane.ts, packages/devtools/src/react.ts, packages/devtools/src/react/devtools-provider.tsx, packages/devtools/src/react/use-pane-folder.test.tsx, packages/devtools/src/react/use-pane-folder.ts, packages/devtools/src/react/use-pane-input.test.tsx, packages/devtools/src/react/use-pane-input.ts, packages/devtools/src/react/use-pane.test.tsx, packages/devtools/src/react/use-pane.ts, packages/devtools/tsup.config.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/createDevtoolsProvider.ts, packages/three-flatland/src/index.ts
Stats: 23 files changed, 441 insertions(+), 264 deletions(-)

### 3ddeb5193432982abb6b9ade022512a1862f73d5
fix: drop useFrame priority, gate usePaneInput change handler
Two regressions surfaced by the React examples after the v10 useFrame
deprecation cleanup:

(A) `[useFrame] Job with id "_r_0_" already exists, replacing` warning
+ stats showing `FPS --`. Cause: `useFrame(update, { priority: 1000 })`
collided with the example's `useFrame(flatland.render, { phase:
'render' })` callback under StrictMode's mount → cleanup → remount
cycle (R3F's auto-generated job IDs from `useId()` clash on remount).
The pane's `update()` doesn't actually need a specific frame ordering
— it only repaints from the (always-current) bus state. Dropped the
priority option entirely; runs default phase / priority alongside
the example's other update-phase callbacks.

(B) "Can't perform a React state update on a component that hasn't
mounted yet" warning. Cause: `usePaneInput`'s Tweakpane `change`
listener can fire between React's cleanup pass and our `setTimeout(0)`
deferred-disposal of the binding, calling `setValueState` on an
unmounted component. Gated the listener bodies on the existing
`mountedRef.current` so late events become no-ops. 25/25 React hook
tests still pass.
Files: packages/devtools/src/react/use-pane-input.ts, packages/devtools/src/react/use-pane.ts
Stats: 2 files changed, 23 insertions(+), 20 deletions(-)

### b2ebc705eeec022c4a13f24da108aea6c62d6a2b
fix: R3F useFrame priority API + createDevtoolsProvider helper for non-Flatland apps
(1) usePane: switch from positional `useFrame(cb, 1000)` to options-
object `useFrame(cb, { priority: 1000 })`. R3F deprecated the positional
form; the warning now goes away in every React example.

(2) New `createDevtoolsProvider(opts?)` helper exported from
`three-flatland`. Returns a real `DevtoolsProvider` when
`DEVTOOLS_BUNDLED && isDevtoolsActive()`, otherwise a no-op stub
(`beginFrame`/`endFrame` do nothing — terser strips the call sites in
prod builds via the build-time const fold).

Use case: vanilla three.js examples that don't construct a `Flatland`.
Flatland constructs its provider internally; non-Flatland apps had no
way to opt in, so their devtools pane stayed blank. `basic-sprite`
(three) updated to demonstrate the pattern — other vanilla examples
follow the same recipe (import + construct + bracket the
`renderer.render(...)` call with `beginFrame` / `endFrame`).
Files: examples/three/basic-sprite/main.ts, packages/devtools/src/react/use-pane.ts, packages/three-flatland/src/debug/createDevtoolsProvider.ts, packages/three-flatland/src/index.ts
Stats: 4 files changed, 79 insertions(+), 2 deletions(-)

### c32068ea2f27195d3493c2e7d2dcc72990a8a456
feat: fullscreen buffer viewer modal (Phase C)
Click the ⤢ on any buffer thumbnail to open a fullscreen modal with:

- Left sidebar: collapsible group tree (one row per registered buffer,
  grouped by name prefix). Click a row to switch active. Active row
  highlighted with the retro-cyan accent. Sidebar defaults expanded;
  ◀/▶ at the top toggles.
- Main area: aspect-correct canvas (`object-fit: contain` math, manual
  so it works on canvas across browsers). Backing matches source 1:1
  with `image-rendering: pixelated` so the pixel grid stays sharp at
  any zoom.
- Header: title, dimensions × format chip, ✕ close button.
- Esc closes; outer-click does NOT close (modal is intentionally
  sticky to avoid losing inspection state).
- Selection drives `client.setBuffers([active])` so only the buffer
  the user is looking at gets streamed; closing restores whatever the
  in-pane thumbnail's selection was.

`addBuffersView` gained an `onExpand?: (name) => void` callback option;
`createPane` wires it to a lazily-built `createBuffersModal(client)`.
Modal DOM is mounted at construction with `display: none` so the first
expand is instant. Same four decode paths as the in-pane thumbnail
(`colors` / `normalize` / `mono` / `signed`) — duplicated for self-
containment; promote to a shared module if a third consumer ever needs
them.
Files: packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts
Stats: 3 files changed, 523 insertions(+), 5 deletions(-)

### 0aa3c88df5ba9ed6944264f6db7a9fce56bcc63f
perf: mutate snapshots in place + cache toFixed strings
(3) `_applyRegistry` / `_applyBuffers` now look up the existing
`Map.get(name)` snapshot and mutate its fields in place when present;
only the first sight of an entry allocates a new snapshot literal.
Switched from `Object.entries()` to `for…in` to drop the per-batch
key/value array allocation.

(4) `stats-graph` caches the `toFixed` result per mode, keyed by the
rounded-to-display-precision integer. Most rAF frames the lerped
value's rounded display value hasn't changed (fps wiggling in the
high 59s but rounding to 60), so we hit the cache and skip the
string allocation entirely. Cache is per-mode so cycling fps↔ms
doesn't trash hits.

Together: kills the last per-batch object literals on the consumer
side and most of the per-rAF string churn in the stats graph. Tests
514/514 pass.
Files: packages/devtools/src/devtools-client.ts, packages/devtools/src/stats-graph.ts
Stats: 2 files changed, 76 insertions(+), 30 deletions(-)

### 9b6608b4db0cbd89c62f040cf1dab4df83620cdc
perf: dedupe rAF allocs, gate registry/buffer payloads, add timing tracks
Canvas replaces SVG polyline in stats-graph: per-rAF `setAttribute('points', longString)`
was (a) allocating ~5k template-literal fragments per second and (b) invalidating
CSS selectors up the `.tp-cntv` chain, showing up in heap profiles as thousands of
selector-string allocations. `ctx.beginPath` / `lineTo` is pure path state, no DOM
mutation, no strings. Also dedupes `textContent` writes via boxed cache holders —
only re-assigns when the rendered text actually changes.

Throttles `StatsCollector.maybeResolveGpu` from every frame (60 Hz) to every 6
frames (10 Hz). Drops the Promise + `.then`/`.catch` closure churn by 6× while
still keeping three's GPU query pool drained and yielding fresh timings every
batch.

Buffers view: caches the `ImageData` across paints when source dimensions match.
Was allocating a fresh ~100 KB `Uint8ClampedArray` per render (~400 KB/s at 4 Hz
thumb refresh).

`DebugTextureRegistry` gains a `maxDim` cap per entry (default 256 for render
targets, 0 / no-op for DataTextures) and a lazy-allocated GPU `Downsampler`.
Render targets larger than `maxDim` get blitted into an aspect-fit scratch RT
(TSL `NodeMaterial` + fullscreen quad) before readback, so a 1920×1080 SDF
reads back at 256×144 (~150 KB) instead of 8 MB per drain.

Buffer display modes shipped (`colors` / `normalize` / `mono` / `signed`) with
format-driven defaults (byte → colors, float → normalize). Signed uses a
red↔green diverging palette around mid-grey — good fit for SDFs later.

`perf-track.ts` introduces a single-helper API (`perfMeasure` / `perfStart`)
that emits User Timing spans on Chrome's custom-track extension
(`detail.devtools`). Convention: trackGroup `three-flatland`, tracks lowercase
(`devtools`, `lighting`, `sprites`, `sdf`). Provider's per-flush CPU span and
consumer's bus-receive latency spans all land on the `devtools` track.
`tracePerf` attaches per-message byte counts as entry properties (walked on
the receive side, done after the latency `end` timestamp so the walk doesn't
pollute the measurement).
Files: packages/devtools/src/buffers-view.ts, packages/devtools/src/perf-trace.ts, packages/devtools/src/stats-graph.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/debug/perf-track.ts
Stats: 8 files changed, 467 insertions(+), 71 deletions(-)

### 7e4a4326945a4063ab0ad811d9ce60f0a5792172
feat: debug buffers (Phase C MVP) — registry, readback, thumbnail blade
Adds a parallel pipeline to the CPU-array registry for visualising live
GPU buffers in the pane.

Protocol:
- New `buffers` feature (`subscribe.features` + `subscribe.buffers` for
  per-entry selection). Renames `registryFilter`/`atlasFilter` →
  `registry`/`buffers` on the subscribe payload to match `features` shape.
- `BuffersPayload.entries[name]: BufferDelta` with `width`, `height`,
  `pixelType`, `version`, `display`, optional `pixels`. Metadata always
  ships so the UI lists available buffers; pixels are gated by selection.
- `BufferDisplayMode = 'colors' | 'normalize' | 'mono' | 'signed'` with
  format-driven defaults (byte → colors, float → normalize).

Provider:
- `DebugTextureRegistry` mirrors `DebugRegistry`. `DataTexture` paths
  copy the CPU buffer; `RenderTarget` paths use `renderer.readRenderTargetPixelsAsync`,
  one in-flight at a time per entry. Caches latest sample.
- `_setActiveTextureRegistry` + `registerDebugTexture` /
  `touchDebugTexture` / `unregisterDebugTexture` — mirrors the array sink,
  no-op when `DEVTOOLS_BUNDLED` is false.
- `SubscriberRegistry` tracks per-consumer `buffers` selection + caches
  the union; `DevtoolsProvider._flush` drains via `buffersSelection()`.

Engine:
- `LightStore.lightsTexture` published as `lightStore.lights`.
- `ForwardPlusLighting._tileTexture` published as `forwardPlus.tiles`.

Client:
- `state.buffers: Map<name, BufferSnapshot>`. `_applyBuffers` decodes
  metadata-or-full deltas, retains last-seen `pixels` when only metadata
  ships. `setBuffers(names | null)` mirrors `setRegistry`.
- `tracePerf(msg)` (`perf-trace.ts`) emits `bus:<type>` `performance.measure`
  spans on every inbound bus message — visible in Chrome DevTools
  Performance → Timings as bars from sender ts to receive now.

UI:
- `buffers-view.ts` blade: single row, `◀ name ▶` arrows cycle the flat
  list of every registered buffer, 240×120 thumbnail with overlays
  (dimensions/format chip bottom-left, expand `⤢` button bottom-right —
  expand stubs to a console.info, fullscreen modal lands next).
- ResizeObserver keeps the canvas backing locked to the rendered CSS
  size × DPR (the missing piece behind earlier "tiny in upper-left"
  bugs).
- Stretch-to-fill draw: every source pixel maps somewhere in the
  thumbnail (deliberately distorts wide-and-short buffers so all data
  is visible — the fullscreen viewer is for aspect-correct inspection).
- Four decoders selected by `display`: `colors`, `normalize`,
  `signed` (red↔green diverging), `mono`. Normalize forces α=1 so
  unused-but-zero cells render as black instead of vanishing.
- Same dark-overlay treatment + collapse-by-default + visibility-driven
  selection narrowing as `registry-view`.

Renames for clarity: `setRegistryFilter` → `setRegistry`, `atlasFilter` →
`buffers` on the subscribe payload; provider's `atlasFilter()` →
`buffersSelection()`. The selection field on the subscribe is named
after the feature it selects within, matching the existing `features`
top-level array.
Files: packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/devtools/src/perf-trace.ts, packages/devtools/src/registry-view.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightStore.ts
Stats: 13 files changed, 1077 insertions(+), 64 deletions(-)

### f4cfde0af82059d33b1b60f4cbddd872b065531d
feat: batched typed-array stats, DebugRegistry, two-channel bus
Stats pipeline now collects per-frame samples into preallocated typed-array
rings on the provider and flushes in 250ms batches via `subarray` views
(zero data copy). Client decodes on arrival into Float32 series rings +
scalar batch means for the text label. Graph interpolates between batches
for smooth motion from a 4 Hz stream; `driver: 'manual'` lets the host
drive `bundle.update()` from its own frame loop (R3F hook uses
`useFrame(update, 1000)` automatically).

Protocol split into two BroadcastChannels: shared discovery (`flatland-debug`)
for `provider:query` / `announce` / `gone`, and per-provider data channels
(`flatland-debug:<id>`) for subscribe / ack / data / ping. `providerId`
dropped from the hot-path messages since routing is now implicit.

New Phase B DebugRegistry lets engine code publish CPU typed arrays via
the module-level `registerDebugArray` / `touchDebugArray` sink (no-op
when `DEVTOOLS_BUNDLED` is false — zero cost in prod). ForwardPlusLighting
publishes `lightCounts` + `tileScores`; LightStore publishes its DataTexture
backing. Pane renders them in a grouped, collapsible registry blade with
cycle arrows — starts collapsed, reveals itself once entries exist. Per-
entry filter on the subscribe protocol means only the visible group's
typed arrays hit the wire; metadata (name/kind/count) always ships so
group cycling works before any sample is requested.

Visibility-driven bandwidth throttling: collapsing the main pane sets
`features: []`; collapsing the registry sets `registryFilter: []`;
switching groups narrows the filter to the active group's entries.
Idle pings keep liveness alive even when every feature is off.

Other: Phase A stats polish — primitives (lines+points) added as a
stats field, heap sampling moved to producer (removes the consumer's
direct `performance.memory` access), first-class `createPane({ driver })`.
Registry view: grouped by name prefix, ◀ name ▶ header cycles groups,
clicking the header toggles collapse, darker translucent background
sinks the blade visually. All 10 vanilla-three examples migrated to
`driver: 'manual'` + `updateDevtools()`. Docs guide rewritten against
current API.
Files: docs/src/content/docs/guides/debug-controls.mdx, examples/react/CLAUDE.md, examples/react/animation/App.tsx, examples/react/basic-sprite/App.tsx, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/lighting/App.tsx, examples/react/pass-effects/App.tsx, examples/react/skia/App.tsx, examples/react/template/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, examples/three/animation/main.ts, examples/three/basic-sprite/main.ts, examples/three/batch-demo/main.ts, examples/three/knightmark/main.ts, examples/three/lighting/main.ts, examples/three/pass-effects/main.ts, examples/three/skia/main.ts, examples/three/template/main.ts, examples/three/tilemap/main.ts, examples/three/tsl-nodes/main.ts, packages/devtools/src/create-pane.test.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/devtools/src/devtools-panel.ts, packages/devtools/src/index.ts, packages/devtools/src/provider-switcher.ts, packages/devtools/src/react.ts, packages/devtools/src/react/use-devtools-panel.ts, packages/devtools/src/react/use-pane-button.test.tsx, packages/devtools/src/react/use-pane-folder.test.tsx, packages/devtools/src/react/use-pane-input.test.tsx, packages/devtools/src/react/use-pane.test.tsx, packages/devtools/src/react/use-pane.ts, packages/devtools/src/react/use-stats-monitor.ts, packages/devtools/src/registry-view.ts, packages/devtools/src/stats-graph.ts, packages/devtools/src/stats-row.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightStore.ts
Stats: 49 files changed, 2125 insertions(+), 1875 deletions(-)

### b28189d2117ada0d440e053d4f400071aca2dee8
refactor: share one DevtoolsClient across panel + stats graph/row
Before: createPane mounted the devtools panel (bus-driven) AND wired
\`wireSceneStats\` (direct scene-hook) independently. The stats graph/row
got their numbers via the scene hook; the new devtools folder got them
via the bus. Two paths, two subscriptions on the bus, timing mismatch:
scene-hook measured per-renderer.render, bus measured per-Flatland-frame.
Numbers drifted.

Now: createPane constructs ONE \`DevtoolsClient\` when \`debug: true\`. The
panel subscribes to it for its readonly blades. The stats graph + stats
row subscribe to the same client and feed \`stats.update()\` +
\`stats.gpuTime()\` from the same state. Single source of truth, numbers
match.

## Multi-listener client

\`DevtoolsClient\` switches from single \`onChange\` callback to
\`addListener(cb)\` / \`removeListener(cb)\` (with a convenience
\`onChange\` option that just seeds the first listener). Listener
errors are caught individually so one bad handler can't break the
bus.

## mountDevtoolsPanel can share a client

\`options.client\` lets callers provide a pre-existing \`DevtoolsClient\`.
When shared:
- Panel calls \`addListener\` + \`removeListener\`, doesn't call
  \`client.start()\` or \`client.dispose()\` — caller owns the client
  lifecycle.
- Panel seeds its display from whatever state the client already has
  (relevant when createPane constructs the client and then hands it to
  the panel — announces may already have arrived).

## Fallback path

When \`debug: false\` OR the bus isn't available (e.g., test
environment lacking BroadcastChannel), the legacy \`wireSceneStats\`
scene-hook path still runs when \`scene\` is passed — so the stats
graph/row keep working in environments that don't have (or don't want)
the bus. When the bus IS available, \`wireSceneStats\` is skipped
entirely; no duplicate subscription, no duplicate timing work.

## Net behaviour in the lighting example

- Open React or three lighting example
- One bus subscription fires (from the shared client)
- Stats graph shows same FPS as the devtools panel's FPS reading
- Stats row (draws/tris/geoms/texs) shows same values as the panel
- GPU timing (when backend supports it) flows through the same path
- Devtools panel \`server: alive\` confirms the producer is live
- Everything measures on the same frame boundary (Flatland.beginFrame
  → endFrame), so no timing divergence

CI verified: typecheck / lint / test / build all green.
Files: packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/devtools/src/devtools-panel.ts
Stats: 3 files changed, 105 insertions(+), 32 deletions(-)

### b67afe823042c3fb609a517513bcfb7f3c75cfd6
feat: multi-provider discovery protocol
Rename \`Producer\` → \`Provider\` (we're a broadcaster; "provider"
describes the role). Add a discovery protocol so consumers can find
providers without hardcoded assumptions, pick by preference, and
auto-switch when providers appear/disappear.

## Protocol additions

- \`provider:announce { identity }\` — provider → all, on construct +
  in response to every \`provider:query\`. Identity carries
  \`{ id, name, kind }\`.
- \`provider:query {}\` — consumer → all, on start (discovery).
- \`provider:gone { id }\` — provider → all, on dispose.
- Every server-emitted message (\`data\`, \`ping\`, \`subscribe:ack\`)
  now tags \`providerId\` so consumers filter by selected provider.
- \`subscribe\` / \`unsubscribe\` / \`ack\` carry an optional
  \`providerId\` targeting; providers ignore messages addressed to a
  different id.
- \`DISCOVERY_WINDOW_MS = 150ms\` constant — consumer collects
  announces for this long before picking.

## Provider identity

\`\`\`ts
interface ProviderIdentity {
  id: string          // UUID
  name: string        // 'flatland', 'my-engine', etc.
  kind: 'system' | 'user'
}
\`\`\`

\`kind\` is package-private. External callers of \`new DevtoolsProvider()\`
always get \`user\`; public \`DevtoolsProviderOptions\` has no \`kind\`
field. System providers are constructed via a package-internal
\`DevtoolsProvider._createSystem()\` factory that Flatland uses. Enforced
by the type system — consumers can't synthesize a system provider.

## Selection

Consumer on \`start()\`:
1. Send \`provider:query\`.
2. Collect \`provider:announce\` responses over \`DISCOVERY_WINDOW_MS\`.
   Any providers that existed before the client started are already in
   the known map via their announces, so late start still sees them.
3. \`_pickProviderAndSubscribe\` picks best: \`user\` over \`system\`.
   First-announced as tiebreak.
4. \`subscribe { providerId }\` targets that one.
5. Filters all \`data\` / \`ping\` / \`subscribe:ack\` by matching
   \`providerId === selected\`.

Auto-switch: on \`provider:gone\` matching the current selection,
clears accumulated state + calls \`_pickProviderAndSubscribe\` again
to fall back to a remaining provider. No user intervention needed.

Manual override: \`client.selectProvider(id)\` unsubscribes from
current + subscribes to the given id. UI dropdown in Commit B will
drive this.

## Flatland integration

- \`FlatlandOptions.name?: string\` — defaults to \`'flatland'\`.
  Lets users distinguish multiple Flatland instances in the UI
  (\`name: 'main-game'\`, \`name: 'minimap'\`).
- Flatland constructs its provider via \`DevtoolsProvider._createSystem\`,
  flagged \`kind: 'system'\`.

## User-created providers

\`new DevtoolsProvider({ name: 'my-engine' })\` — always \`kind: 'user'\`.
When the app also has a Flatland instance, the consumer's preference
rule picks \`user\` so the app's provider is the default selection.
Flatland's system provider sits in the dropdown (Commit B will add the
dropdown).

Bare three.js + R3F-specific helpers (\`createDevtoolsProvider({ scene })\`,
\`<DevtoolsProvider>\` component) are deferred to Commit B.

## Panel behaviour during discovery

The panel mounts immediately when \`createPane\` runs in a
devtools-enabled build. Before discovery completes, liveness shows
\`server: waiting\` + stats show 0/"unknown" placeholders. After
subscribe:ack arrives (~150ms later), values populate. No UI jank —
layout is stable from first paint.

\`DevtoolsState\` gains \`providers: ProviderIdentity[]\` +
\`selectedProviderId: string | null\` so the UI can show the list
(Commit B).

CI verified: typecheck / lint / test / build all green.
Files: packages/devtools/src/devtools-client.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DevtoolsProducer.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts
Stats: 5 files changed, 720 insertions(+), 381 deletions(-)

### 4eae867094d83640e8518bc2707051cbf633252f
fix: frame-boundary stats + turnkey createPane auto-mount
## Multi-pass frame-counting bug

DevtoolsProducer / StatsCollector were hooking \`scene.onBeforeRender\`
and \`scene.onAfterRender\`, treating every \`renderer.render()\` call
as a separate frame. Flatland runs several internal render passes per
logical frame (SDF pass, occlusion pass, main render, post-processing),
so FPS reported ~6× the real rate (360 instead of 60) and per-render
stats didn't aggregate across passes.

Switched to explicit frame boundaries:

- \`StatsCollector.beginFrame(now, renderer)\` — snapshots
  \`renderer.info.render.calls\` + \`.triangles\` as the "before"
  reference, marks CPU start time.
- \`StatsCollector.endFrame(renderer)\` — computes \`cpuMs\`,
  per-frame \`drawCalls\` + \`triangles\` deltas, increments frame
  counter, updates FPS from interval between consecutive \`endFrame\`
  calls.
- \`DevtoolsProducer.beginFrame(now, renderer)\` / \`endFrame(renderer)\`
  — forward to stats + broadcast a data packet from \`endFrame\`.
- \`Flatland.render()\` wraps its entire body with \`beginFrame\` at
  top + \`endFrame\` at bottom. Every internal \`renderer.render()\`
  contributes to the aggregate totals.

Result: FPS, cpuMs, draw calls, triangles all report the logical
user-visible frame stats, regardless of how many internal passes the
engine runs. Matches the existing stats graph's FPS (which brackets
the whole rAF tick).

Removed the \`scene\` constructor arg from \`DevtoolsProducer\` and
\`StatsCollector\` (nothing hooks the scene anymore). Also removed
\`setAutoSend\` — begin/end IS the timing contract.

Bare three.js apps call \`beginFrame\` / \`endFrame\` around their rAF
tick or their \`renderer.render()\` call — same API, no scene hook
mystery.

## Turnkey createPane auto-mount

\`createPane\` / \`usePane\` now auto-mount the devtools bus panel when
\`debug: true\` (the default). Consumer code doesn't have to call
\`mountDevtoolsPanel\` or \`useDevtoolsPanel\` separately. If no
producer is broadcasting, the panel shows \`server: dead\` + zeros
instead of error. If BroadcastChannel isn't available (test
environments), mount is skipped silently.

Both lighting examples updated to drop the explicit mount calls —
\`createPane({ scene: flatland.scene })\` / \`usePane()\` alone now
produce both the existing stats graph/row AND the new bus-driven
devtools folder.

\`use-pane.test.tsx\`'s strict-mode test opts out via \`debug: false\`
— the test uses \`vi.runAllTimers()\` which infinite-loops on the
ack/liveness \`setInterval\`s; opt-out keeps the test focused on
pane lifecycle.

CI verified: typecheck / lint / test / build all green.
Files: examples/react/lighting/App.tsx, examples/three/lighting/main.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/react/use-pane.test.tsx, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/DevtoolsProducer.ts, packages/three-flatland/src/debug/StatsCollector.ts
Stats: 7 files changed, 151 insertions(+), 216 deletions(-)

### 356972d19bc9bb7495eaa11773605a99f40cc866
feat: DevtoolsClient + mountDevtoolsPanel + useDevtoolsPanel
Consumer side of the debug bus. Subscribes to the producer, accumulates
delta state per the protocol, renders a readonly tweakpane panel.
Wires into both three/lighting and react/lighting examples for
verification.

## DevtoolsClient

Framework-agnostic bus consumer (`packages/devtools/src/devtools-client.ts`).

- Generates a stable UUID v4 id per instance (uses `crypto.randomUUID`
  when available, hex-derived fallback otherwise).
- Sends `subscribe { id, features }` on `start()`.
- On `subscribe:ack` (addressed to its own id): applies bootstrap env,
  starts 1 Hz `ack` timer.
- On `data`: merges delta into accumulated `DevtoolsState` using
  protocol rules — absent field = no change, `null` = clear to
  undefined, value = new.
- On any server message (`data` / `ping` / `subscribe:ack`): refreshes
  liveness clock.
- Liveness watcher fires every second: if no server message in
  `SERVER_LIVENESS_MS`, flips `serverAlive` false and posts a fresh
  `subscribe` (idempotent re-subscribe — normal subscribe path IS the
  reconnect path).
- `dispose()` sends `unsubscribe`, clears timers, closes the channel.
- `setFeatures()` re-posts subscribe with updated feature list (server
  handles idempotently).

## mountDevtoolsPanel

Reference UI (`packages/devtools/src/devtools-panel.ts`). Mounts a
`Devtools` folder on the given tweakpane Pane with four sub-folders:

- **Liveness** (collapsed) — `server` (alive/dead), `lag ms`
- **Perf** — FPS, CPU ms, GPU ms, frame counter
- **Scene** — draws, triangles, geometries, textures
- **Environment** (collapsed) — backend name, GPU timing on/off,
  canvas WxH, DPR, three revision, flatland version

Binds a display object that's updated on every client `onChange`,
then calls `folder.refresh()` to tick all the monitors. Returns a
handle with `dispose()` that tears down both the client and the
folder.

## useDevtoolsPanel (React)

Hook form (`packages/devtools/src/react/use-devtools-panel.ts`).
Mounts on first render, disposes on unmount. Wrapped in try/catch
for strict-mode double-mount robustness.

## Package wiring

- `peerDependencies` + `peerDependenciesMeta` entries added for
  `three-flatland` (the types-only `/debug-protocol` subpath is all
  this package consumes, but pnpm needs the link).
- `devDependencies.three-flatland = "workspace:*"` so the monorepo
  resolves locally.
- `packages/devtools/src/index.ts` + `react.ts` export the new
  surfaces alongside the existing createPane / usePane.

## Examples wired

- `examples/three/lighting/main.ts`: adds `mountDevtoolsPanel(pane)`
  after `createPane({ scene: flatland.scene })`.
- `examples/react/lighting/App.tsx`: adds `useDevtoolsPanel(pane)` in
  the `App` component right after `usePane()`.

Reload either — the Devtools folder shows live FPS, draw calls,
triangles, CPU/GPU timing (when backend supports it), and the full
env snapshot. Liveness folder confirms the ack/ping cycle is working.

CI verified: typecheck / lint / test / build all green.
Files: examples/react/lighting/App.tsx, examples/three/lighting/main.ts, packages/devtools/package.json, packages/devtools/src/devtools-client.ts, packages/devtools/src/devtools-panel.ts, packages/devtools/src/index.ts, packages/devtools/src/react.ts, packages/devtools/src/react/use-devtools-panel.ts, pnpm-lock.yaml
Stats: 9 files changed, 538 insertions(+), 2 deletions(-)
