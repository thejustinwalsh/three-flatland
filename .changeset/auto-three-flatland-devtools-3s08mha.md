---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


**Major devtools overhaul: bus protocol, GPU buffer inspection, and performance hardening**

### Debug bus protocol

- Two-channel `BroadcastChannel` design: shared discovery channel (`flatland-debug`) for `provider:query` / `announce` / `gone`; per-provider data channels (`flatland-debug:<id>`) for `subscribe` / `ack` / `data` / `ping`
- Multi-provider discovery: consumers auto-pick on start, prefer `user` over `system` providers, auto-switch on `provider:gone`; `client.selectProvider(id)` for manual override
- Delta-encoded `data` packets — absent field = no change, `null` = clear; zero-alloc scratch objects on the producer hot path
- Server-side idle ping every 2 s when no `data` has been sent; consumers detect dead providers after 5 s silence
- `FlatlandOptions.name` lets users distinguish multiple Flatland instances

### Client & panel

- `DevtoolsClient`: framework-agnostic bus consumer; multi-listener via `addListener` / `removeListener`; shared across panel + stats graph (single source of truth, no timing drift)
- `mountDevtoolsPanel` / `useDevtoolsPanel`: Tweakpane panel with Liveness, Perf, Scene, and Environment folders
- `createPane` / `usePane` auto-mount the devtools panel when `debug: true` — no separate `mountDevtoolsPanel` call needed
- `createDevtoolsProvider(opts?)` helper exported from the main package for vanilla three.js apps without a `Flatland` instance

### CPU typed-array registry (Phase B)

- `DebugRegistry`: engine code publishes CPU typed arrays via `registerDebugArray` / `touchDebugArray`; no-op when `DEVTOOLS_BUNDLED` is false
- `ForwardPlusLighting` publishes `lightCounts` and `tileScores`; `LightStore` publishes its DataTexture backing
- Registry blade in the pane: grouped by name prefix, collapsible, bandwidth-gated by visibility

### GPU buffer inspection (Phase C)

- `DebugTextureRegistry`: `DataTexture` paths copy CPU buffer; `RenderTarget` paths use async GPU readback
- `buffers-view` blade: thumbnail with `◀ name ▶` cycling, 240×120 canvas preview, four decode modes (`colors` / `normalize` / `mono` / `signed`)
- Fullscreen modal (click ⤢): collapsible sidebar with buffer list, aspect-correct main canvas, Esc to close; drives `client.setBuffers([active])` so only the inspected buffer is streamed
- `DebugTextureRegistry` `maxDim` cap (default 256 px) with lazy GPU `Downsampler` — a 1920×1080 SDF reads back at ~150 KB instead of 8 MB

### Worker bus transport

- `BusTransport` abstraction with `WorkerBusTransport` (spawns offload worker) and `InlineBusTransport` fallback
- Pool-based zero-alloc data path: `_flush` acquires a pool buffer, encoders `copyTypedTo` into successive offsets, buffer is transferred to the worker — no `structuredClone` on the render thread
- Pool tiers: small 4 KB × 8, large 2 MB × 4; fail-soft for oversized entries (metadata-only, one-shot warn)

### Performance fixes

- Stats graph replaced from SVG `<polyline>` to Canvas `ctx.beginPath/lineTo` — eliminates ~5 k template-literal allocs/s and CSS selector invalidations
- `_applyRegistry` / `_applyBuffers` mutate snapshots in place; `toFixed` results cached per display precision
- `StatsCollector.maybeResolveGpu` throttled from 60 Hz to 10 Hz — 6× fewer Promise closures
- `ImageData` for buffer thumbnails cached when source dimensions match — was ~400 KB/s of `Uint8ClampedArray` allocs at 4 Hz
- User Timing spans via `perfMeasure` / `perfStart` on Chrome's custom-track extension (`three-flatland` track group)

### Bug fixes

- R3F `useFrame` switched from positional priority `useFrame(cb, 1000)` to options-object form `useFrame(cb, { priority: 1000 })` — removes deprecation warning in all React examples
- Frame-boundary stats: switched from `scene.onBeforeRender`/`onAfterRender` hooks (which fired per internal pass) to explicit `beginFrame` / `endFrame` — FPS and draw-call counts now report logical frame rates regardless of how many internal render passes Flatland runs

Delivers a full end-to-end devtools system: live stats, CPU array inspection, GPU buffer thumbnails with fullscreen viewer, and a zero-alloc worker-offloaded data path.
