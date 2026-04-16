---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New features:**
- `DevtoolsClient` + `mountDevtoolsPanel` / `useDevtoolsPanel`: bus-driven readonly debug pane with Perf, Scene, Environment, and Liveness folders
- Multi-provider discovery protocol: `provider:announce/query/gone` messages; consumer auto-selects user provider over system provider, auto-switches on disconnect
- `createPane` / `usePane` auto-mount the devtools panel when `debug: true` — no separate `mountDevtoolsPanel` call needed
- Phase B `DebugRegistry`: engine publishes CPU typed arrays (e.g. `lightCounts`, `tileScores`) via `registerDebugArray`/`touchDebugArray`; collapsible registry blade; per-entry subscribe filter gates bandwidth
- Phase C `DebugTextureRegistry` + buffers view: live GPU buffer thumbnails (240×120 canvas) with `colors`/`normalize`/`mono`/`signed` display modes; `maxDim` cap (default 256) downsamples large render targets via GPU `Downsampler` before readback
- `perf-track.ts`: `perfMeasure`/`perfStart` emit User Timing spans on Chrome's custom-track extension (`trackGroup: 'three-flatland'`), covering flush CPU time and bus-receive latency

**Performance:**
- Stats graph rewritten from SVG polyline to Canvas — eliminates ~5k string allocations/s and CSS selector invalidations per rAF
- `StatsCollector.maybeResolveGpu` throttled from 60 Hz to 10 Hz, reducing Promise/closure churn 6×
- Buffers view caches `ImageData` across paints when dimensions match; 1920×1080 SDF reads back at 256×144 (~150 KB) instead of 8 MB
- `textContent` writes deduped via boxed cache holders

**Fixes:**
- Shared `DevtoolsClient` across stats graph, stats row, and devtools panel — single source of truth, no timing drift between readouts
- Protocol rename: `registryFilter`/`atlasFilter` → `registry`/`buffers` for consistency with the `features` shape

Comprehensive devtools upgrade delivering bus-driven provider discovery, live GPU buffer inspection with downsampled readback, and significantly reduced allocation overhead on the debug hot path.
