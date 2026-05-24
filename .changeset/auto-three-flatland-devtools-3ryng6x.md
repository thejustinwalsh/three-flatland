---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### Devtools dashboard

- New Vite plugin (`@three-flatland/devtools/vite`) bundles and serves a Preact-based dashboard at `/__devtools__`; panels: batches, GPU buffers, environment, stats, debug registry, protocol log
- Dashboard build task added to Turbo pipeline; produced bundle copied into docs at build time
- Standalone bundle usable outside the examples MPA via `vite.config.bundle.ts`

### Buffer viewer (GPU texture inspection)

- Live GPU buffer thumbnails in the pane (240×120, 4 Hz refresh) with `◀ name ▶` cycle controls; display modes: `colors`, `normalize`, `mono`, `signed` (red↔green diverging for SDFs)
- Fullscreen modal (Phase C): click `⤢` to open a collapsible sidebar tree + aspect-correct canvas; pan/zoom (wheel + drag), zoom clamped 0.25×–64×, double-click to reset
- WebCodecs VP9 encoding for stream mode: worker VP9-encodes readback pixels, consumer `VideoDecoder` draws `VideoFrame` directly to modal canvas; falls back to raw pixels when WebCodecs unavailable (Firefox, older Safari)
- All pixel-format conversion runs on the worker thread: `rgba8`, `r8`, `rgba16f` (manual half-float decode), `rgba32f`; GPU row-padding (WebGPU 256-byte alignment) handled correctly
- `DebugTextureRegistry` gains a `maxDim` cap per entry (default 256 for render targets) with a lazy GPU downsampler; a 1920×1080 SDF reads back at 256×144 instead of 8 MB per flush
- Texture readback moved to `endFrame()` (after all render passes complete) to prevent capturing partially rendered content
- SDF distance field and occlusion mask registered as debug textures

### Stats panel

- Stats collected into preallocated typed-array rings on the provider; flushed in 250 ms batches via `subarray` views (zero data copy)
- Canvas replaces SVG polyline in sparkline: eliminates per-rAF DOM mutations and `~5 k` selector-string allocations per second
- Snapshots mutated in place on the consumer (no per-batch object literals); `toFixed` strings cached per rounded value
- Bucketed axis range with hysteresis + trimmed max for stable Y-axis during load spikes
- GPU timing detection: `DevtoolsProvider` probes WebGPU timestamp query support and shows GPU ms only when available

### Pane hooks (React)

- `usePane`, `usePaneFolder`, `usePaneInput` rewritten for React 19.2: `useEffectEvent` replaces manual latest-ref patterns; `useState` lazy initializer for bundle construction
- Peer dependency bumped to React `^19.2.0`; workspace catalog and example `package.json` files updated
- `useFrame` priority argument switched to options-object form (positional form was deprecated in R3F)
- `usePaneInput` change handler gated on `mountedRef` to prevent post-unmount state updates under StrictMode

### DevtoolsProvider lifecycle

- Constructor is now side-effect-free; `start()` / `dispose()` manage channels, announce, and flush timer (both idempotent and multi-cycle)
- `Flatland.render()` lazy-starts the provider on first call
- `<DevtoolsProvider />` R3F component: passive sampler via default-phase `useFrame`, safe in production builds (no-ops when `DEVTOOLS_BUNDLED` is false)
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla Three.js apps that don't construct a `Flatland`
- `Flatland._debug` renamed to `_devtools` throughout

### Protocol

- Bus split into two `BroadcastChannel`s: shared discovery channel + per-provider data channel; `providerId` dropped from hot-path messages
- `DevtoolsClient` switches from single `onChange` to `addListener` / `removeListener`; listener errors caught individually
- `SubscriberRegistry` tracks per-consumer buffer selection; only the selected buffer's pixels hit the wire
- `perf-trace.ts` emits User Timing spans (`three-flatland` track group) on Chrome's custom-track extension for bus latency and per-flush CPU cost
- Controls minimal mode added to `create-pane`

### Fixes

- Modal thumbnail/selection sync: thumbnail defers to modal when open; modal notifies thumbnail of active buffer changes and open/close state
- Float textures (rgba16f/rgba32f) skip VP9 encoding (VideoEncoder expects 8-bit RGBA); raw pixels flow correctly
- `bus-worker.ts` URL uses extensionless import so both source and built-dist consumers resolve correctly
- Zoom info overlay always visible; reset button hidden at identity (not zoom display)
- `requestAnimationFrame` allocations eliminated: no per-rAF array/object literals on the consumer path

Delivers a fully-featured devtools dashboard with live GPU buffer inspection, VP9-streamed fullscreen texture viewer, React 19.2-compatible pane hooks, and a zero-allocation stats pipeline.
