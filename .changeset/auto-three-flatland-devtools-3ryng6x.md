---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


## @three-flatland/devtools

### Dashboard & build
- Vite plugin (`vite-plugin-devtools-panel`) bundles the pane as a standalone HTML asset colocated with the Vite server (no CDN / separate dev server required)
- `createPane({ driver })` — `manual` driver lets the host call `bundle.update()` from its own frame loop; R3F hook auto-hooks into `useFrame(update, 1000)`
- All 10 vanilla-three examples migrated to `driver: 'manual'` + `updateDevtools()` — no more implicit rAF double-ticking

### React 19.2 migration
- `useEffectEvent` replaces `useCallback` + `useRef` pairs for stable callback refs in `usePane`, `usePaneInput`, `usePaneFolder`, `usePaneButton`, `useStatsMonitor`
- `useDevtoolsPanel` — single hook composing the panel lifecycle (subscribe → ack → data → ping) with correct React 19 cleanup semantics
- `DevtoolsClient` multi-listener: `addListener(cb)` / `removeListener(cb)` replaces single `onChange` callback; errors caught per-listener; `options.client` lets `createPane` share a client with `mountDevtoolsPanel`

### Production dead-stripping
- `DEVTOOLS_BUNDLED` compile-time gate wraps all provider/registry paths — tree-shakers drop the entire debug surface in prod; `registerDebugArray` / `touchDebugArray` / `registerDebugTexture` all no-op when false
- Bundle size: 45.4 KB → 36.3 KB (minified, prod build)

### GPU timestamp ownership
- `StatsCollector` acquires the timestamp query set from Three's renderer; `DevtoolsProvider` no longer holds the set itself — eliminates double-acquire errors when multiple providers are alive
- `maybeResolveGpu` throttled from 60 Hz to 10 Hz (every 6 frames) — 6× fewer Promise allocations while keeping the GPU query pool drained

### Bus performance & protocol
- Stats flushed as preallocated typed-array rings via `subarray` views (zero copy); client decodes into Float32 series on arrival
- Protocol split: shared discovery on `flatland-debug`, per-provider data on `flatland-debug:<id>` — `providerId` removed from hot-path messages
- `BusPool` 256 KB medium tier added — prevents head-of-line blocking when a single large stats frame saturates the small pool; stats flushed as `subarray` views
- `setRegistry` / `buffers` replace old `setRegistryFilter` / `atlasFilter` on the subscribe payload (consistent naming with `features` array)
- Idle pings keep liveness when all features are disabled

### Debug registry
- `DebugRegistry` (Phase B): engine publishes CPU typed arrays via `registerDebugArray` / `touchDebugArray`; `ForwardPlusLighting` publishes `lightCounts` + `tileScores`; `LightStore` publishes its DataTexture backing
- Per-entry filter on subscribe means only the visible group's data hits the wire; metadata always ships so group cycling works before any sample is requested
- Visibility-driven bandwidth: collapsing pane → `features: []`; collapsing registry → narrow filter

### Debug buffers viewer (Phase C)
- `DebugTextureRegistry`: `RenderTarget` paths use async readback (`renderer.readRenderTargetPixelsAsync`), one in-flight per entry; `maxDim` cap (default 256) downsamples large RTs via TSL `NodeMaterial` blit before readback (1920×1080 SDF → 256×144, ~150 KB vs 8 MB)
- `lightStore.lights` and `forwardPlus.tiles` textures published automatically
- `buffers-view` blade: `◀ name ▶` arrows cycle registered buffers; 240×120 thumbnail; four display modes: `colors`, `normalize`, `signed` (red↔green diverging for SDFs), `mono`; fullscreen expand modal with pan/zoom
- WebCodecs VP9 streaming for fullscreen high-res buffer inspection (fallback to `putImageData`)
- Per-pixel format conversion on worker thread — keeps readback off the main thread

### Performance micro-optimisations
- `devtools-client.ts` / `stats-graph.ts`: eliminated per-batch object-literal allocations and per-rAF string allocations
- Stats graph: `<canvas>` + `ctx.lineTo` replaces SVG `<polyline>` — no DOM mutation, no selector-string alloc at 60 Hz; `textContent` writes deduplicated via boxed cache
- `ImageData` cached across paints when source dimensions match (was allocating ~100 KB `Uint8ClampedArray` per thumb refresh at 4 Hz)
- `perf-track.ts`: `perfMeasure` / `perfStart` emit User Timing spans on Chrome's `devtools` custom track — provider flush CPU span and bus-receive latency visible in Performance panel

This release completes the debug dashboard pipeline: typed-array stats, live GPU-buffer thumbnails with async readback, VP9 fullscreen streaming, and a Vite plugin for zero-config panel embedding — while shrinking the prod bundle by ~20 %.
