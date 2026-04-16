---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New APIs:**
- `DevtoolsClient`: framework-agnostic BroadcastChannel consumer; `addListener`/`removeListener`, `selectProvider(id)`, `setFeatures()`, `setRegistry()`, `setBuffers()`, auto-reconnect on liveness timeout
- `mountDevtoolsPanel(pane)` / `useDevtoolsPanel(pane)` (React): readonly Tweakpane folder with Liveness, Perf, Scene, and Environment sub-folders
- `createPane` / `usePane` auto-mount the devtools panel when `debug: true` — no separate `mountDevtoolsPanel` call needed

**Registry & Buffers blades:**
- Registry blade: collapsible group cycling (`◀ name ▶`), visibility-driven bandwidth throttle — only the active group's typed arrays are sent over the bus
- Buffers blade: live GPU buffer thumbnails (240×120 canvas), `colors`/`normalize`/`mono`/`signed` display modes, `maxDim` GPU downsampling (render targets >256px blitted to scratch RT before readback)
- `LightStore.lightsTexture` and `ForwardPlusLighting._tileTexture` published as named debug buffers (`lightStore.lights`, `forwardPlus.tiles`)

**Multi-provider discovery:**
- `provider:announce/query/gone` protocol; `DevtoolsClient` picks `user` providers over `system` providers; auto-switches on `provider:gone`
- `DevtoolsState` exposes `providers: ProviderIdentity[]` + `selectedProviderId`

**Performance:**
- Stats graph: replaced SVG polyline with Canvas `lineTo` — eliminates ~5k template-literal allocs/s and CSS selector invalidations
- `StatsCollector.maybeResolveGpu` throttled 60 Hz → 10 Hz (6× Promise/closure reduction)
- `ImageData` cached across paints when source dimensions match (~400 KB/s saved at 4 Hz thumb refresh)
- `perf-track.ts`: `perfMeasure`/`perfStart` helpers emit User Timing spans on the `three-flatland` custom Chrome track; `tracePerf` emits `bus:<type>` spans per inbound message

**Bug fixes:**
- FPS and draw-call stats now bracket the full logical frame via shared `DevtoolsClient` — fixes ~6× inflated FPS in multi-pass scenes and timing drift between stats graph and devtools panel

This release delivers the complete `@three-flatland/devtools` consumer surface: bus-driven live stats, CPU typed-array registry, GPU buffer thumbnails, and multi-provider support — all zero-cost when not bundled.
