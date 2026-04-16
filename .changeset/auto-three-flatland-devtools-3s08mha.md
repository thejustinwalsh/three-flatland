---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**DevtoolsClient (new)**
- Framework-agnostic bus consumer; `start()` / `dispose()` lifecycle
- `addListener(cb)` / `removeListener(cb)` multi-listener API (replaces single `onChange`)
- Accumulates delta state per the debug protocol; `setFeatures([...])` re-subscribes with updated feature list
- Liveness watcher: flips `serverAlive` false after `SERVER_LIVENESS_MS` silence, auto-resubscribes

**mountDevtoolsPanel / useDevtoolsPanel (new)**
- Readonly Tweakpane folder with live FPS, CPU ms, GPU ms, draw calls, triangles, env snapshot
- `options.client` lets callers share a pre-existing `DevtoolsClient` so lifecycle is caller-owned
- `createPane` / `usePane` auto-mount the panel when `debug: true` — no separate mount call needed

**Multi-provider discovery**
- `provider:announce` / `provider:query` / `provider:gone` protocol; 150 ms collection window
- `selectProvider(id)` manual override; auto-switch on `provider:gone` matching selection
- `user` providers preferred over `system` providers; `FlatlandOptions.name` distinguishes instances

**Debug buffers view**
- `buffers-view.ts` blade: `◀ name ▶` arrows cycle registered buffers, 240×120 thumbnail
- Four display modes: `colors`, `normalize`, `mono`, `signed` (red/green diverging, good for SDFs)
- `setBuffers(names | null)` mirrors `setRegistry` for visibility-driven bandwidth control

**Debug registry view**
- Grouped collapsible blade for CPU typed-array entries published via `registerDebugArray` / `touchDebugArray`
- Visibility-driven throttling: collapse pane → `features: []`; collapse registry → `registryFilter: []`
- `ForwardPlusLighting` publishes `lightCounts` + `tileScores`; `LightStore` publishes its DataTexture

**Performance**
- Stats graph replaced SVG polyline with Canvas `ctx.beginPath` / `lineTo` — eliminates ~5 k string allocs/s and CSS selector invalidation
- `textContent` writes deduplicated via boxed cache — only re-assigns on actual value change
- `StatsCollector.maybeResolveGpu` throttled from 60 Hz to 10 Hz, reducing Promise closure churn 6×
- `DebugTextureRegistry` `maxDim` cap (default 256): large RTs blitted to downsampled scratch before readback — 1920×1080 SDF reads at 256×144 (~150 KB) instead of ~8 MB per drain
- `ImageData` cached across paints when source dimensions match, eliminating ~400 KB/s Uint8ClampedArray allocation

**perf-trace.ts (new)**
- `perfMeasure` / `perfStart` emit User Timing spans on Chrome's custom-track extension
- Convention: `trackGroup = 'three-flatland'`, tracks `devtools` / `lighting` / `sprites` / `sdf`
- Per-message byte counts attached as entry properties after latency measurement

This release delivers a complete debuggability stack: a bus-driven devtools panel, live GPU texture inspection, CPU typed-array registry, and near-zero render-thread overhead via a worker-offloaded buffer pool.

