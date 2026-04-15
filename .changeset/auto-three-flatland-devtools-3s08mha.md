---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


**Devtools panel (`createPane` / `usePane`)**

- `createPane({ debug: true })` and `usePane()` now auto-mount the devtools bus panel — no separate `mountDevtoolsPanel` / `useDevtoolsPanel` call needed
- Devtools folder sub-sections: Liveness, Perf (FPS/CPU/GPU/frame), Scene (draws/triangles/geometries/textures), Environment (backend/canvas/versions)
- Single shared `DevtoolsClient` drives both the bus panel and the stats graph/row from one source of truth, eliminating timing divergence
- `DevtoolsClient.addListener(cb)` / `removeListener(cb)` for multi-consumer subscriptions; errors in one listener are caught individually

**Multi-provider discovery**

- `provider:announce` / `provider:query` / `provider:gone` discovery protocol over a shared `flatland-debug` channel
- Consumers auto-select best provider (`user` kind over `system`); auto-switch on provider disconnect
- `client.selectProvider(id)` for manual override
- `ProviderIdentity`: `{ id, name, kind }` — `FlatlandOptions.name` distinguishes multiple Flatland instances in the UI
- `DevtoolsProvider._createSystem()` internal factory enforces system vs. user kind at the type level

**DebugRegistry (CPU typed-array inspector)**

- `registerDebugArray` / `touchDebugArray` / `unregisterDebugArray` module-level sinks (no-op when `DEVTOOLS_BUNDLED` is false)
- ForwardPlusLighting publishes `lightCounts` and `tileScores`; LightStore publishes its DataTexture backing
- Pane registry blade: grouped by name prefix, collapsible, cycle arrows, visibility-driven bandwidth throttling — only selected group's data hits the wire
- Renamed: `setRegistryFilter` → `setRegistry`; subscribe payload field `registryFilter` → `registry`

**GPU buffer viewer (Phase C)**

- `DebugTextureRegistry`: registers `DataTexture` and `RenderTarget` instances; async readback via `renderer.readRenderTargetPixelsAsync` (one in-flight per entry); `maxDim` cap (default 256) with lazy GPU `Downsampler` to avoid 8 MB readbacks
- `LightStore.lightsTexture` published as `lightStore.lights`; `ForwardPlusLighting._tileTexture` published as `forwardPlus.tiles`
- Buffers view blade: `◀ name ▶` cycle arrows, 240×120 canvas thumbnail, four display modes: `colors`, `normalize`, `signed` (red/green diverging), `mono`
- Subscribe payload field `atlasFilter` → `buffers`; `buffersSelection()` API

**Stats pipeline & performance**

- Stats batched into preallocated typed-array rings on the provider, flushed every 250ms via `subarray` (zero data copy); graph interpolates between batches for smooth display at 4 Hz
- Stats graph ported from SVG polyline to Canvas — eliminates per-rAF DOM string allocations (~5k/s) and CSS selector invalidations; `textContent` deduped via cached holders
- `StatsCollector.maybeResolveGpu` throttled from 60 Hz to 10 Hz (6× less Promise churn)
- `perf-track.ts`: `perfMeasure` / `perfStart` helpers emit User Timing spans on Chrome's custom track (`three-flatland` track group); bus-receive latency spans on the `devtools` track
- `tracePerf(msg)` emits `bus:<type>` spans visible in Chrome DevTools Performance → Timings

**Protocol**

- Two-channel split: shared discovery channel (`flatland-debug`) + per-provider data channel (`flatland-debug:<id>`)
- `subscribe` / `subscribe:ack` / `data` / `ping` / `unsubscribe` messages; delta encoding (absent = no change, `null` = clear); zero-alloc hot path via scratch objects
- Idle `ping` emitted every 2s when data is quiet so consumers can distinguish idle from dead provider
- `provider:query` / `provider:announce` / `provider:gone` for discovery

## BREAKING CHANGES

- Subscribe payload fields renamed: `registryFilter` → `registry`, `atlasFilter` → `buffers`; third-party bus subscribers must update their subscribe messages
- `DevtoolsClient.onChange` option is now a convenience seed for `addListener`; callers using a single callback are unaffected, but direct field assignment is no longer supported
- `setRegistryFilter` renamed to `setRegistry` on `DevtoolsClient`

This release delivers the complete devtools panel (Phase A–C): live stats, CPU typed-array inspection, and GPU buffer visualization, all wired through a single bus-driven client with multi-provider discovery.
