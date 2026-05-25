---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/devtools

### New features

- **Devtools dashboard** — Vite plugin (`@three-flatland/devtools/vite`) serves a live dashboard at `/__devtools__` with panels for stats, registry arrays, GPU buffers, environment, and a protocol log
- **Debug buffer viewer** — live GPU buffer thumbnails in the Tweakpane pane with `◀ name ▶` cycling; click `⤢` to open a fullscreen modal with pan/zoom, aspect-correct canvas, and sidebar group tree
- **Fullscreen modal** — WebCodecs VP9 streaming for live buffer inspection; falls back to raw-pixel path on browsers without `VideoEncoder`; four display modes: `colors`, `normalize`, `mono`, `signed`
- `createDevtoolsProvider(opts?)` helper for vanilla three.js apps that don't construct a `Flatland` instance — returns a live provider or a no-op stub in production
- `<DevtoolsProvider name="...">` React component — passive sampler using `useFrame` default phase, safe inside and outside `<Canvas>`
- Multi-provider discovery protocol — `provider:announce`/`query`/`gone` messages; consumer picks the best provider (`user` over `system`), auto-switches on disconnect
- `FlatlandOptions.name?: string` — label for the system provider (useful when running multiple Flatland instances)
- `DevtoolsClient.addListener()` / `removeListener()` multi-listener API (was single `onChange` callback)
- GPU timing detection — `detectGpuTiming()` probes backend capability; stats panel shows GPU time row only when supported
- Axis hysteresis with trimmed max and bucketed range for sparkline stability
- Controls minimal mode on the Tweakpane pane

### Performance

- Devtools subsystem fully dead-stripped from production bundles via inlined `process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true'` gate — eager bundle: 45.4 KB → 36.3 KB
- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()`/`dispose()` lifecycle prevents cost in discarded R3F reconciler renders
- Stats canvas replaces SVG polyline — eliminates per-frame DOM mutations and selector-string allocations
- `StatsCollector.maybeResolveGpu` throttled from 60 Hz to 10 Hz — 6× reduction in GPU query Promise churn
- Snapshots mutated in place on state updates (no per-batch object allocation); `toFixed` results cached per display-precision integer
- `DebugTextureRegistry` caps readback via `maxDim` per entry (default 256 for render targets) — 1920×1080 SDF reads back at 256×144 instead of 8 MB
- Pixel conversion moved to the bus worker thread; GPU row-padding (WebGPU 256-byte alignment) detected and stripped on the worker

### Bug fixes

- Pane hooks rewritten with `useEffectEvent` (React 19.2 stable) — eliminates "refs during render" React Compiler diagnostics; peer requirement bumped to `react@^19.2.0`
- `usePane` drops `useFrame` dependency; stats self-tick via `driver: 'raf'` — works outside `<Canvas>`
- `usePaneInput` change handler gated on `mountedRef.current` — prevents state update on unmounted component after deferred disposal
- `useFrame` priority passed as options object (was positional) — removes R3F deprecation warning
- Modal thumbnail selection and stream subscription properly synchronized — thumbnail no longer overwrites modal's buffer subscription
- Float textures (`rgba16f`/`rgba32f`) skip VP9 encoding path; `Float32Array` preserved from readback (not wrapped as `Uint8Array`)
- Modal `paint()` skipped when `VideoDecoder` is active — prevents canvas reset overwriting decoder output
- Bus worker resolved via extensionless URL — works from both source (`bus-worker.ts`) and dist (`bus-worker.js`)
- Frame-boundary stats fixed — FPS and draw-call counts now bracket the full logical frame, not individual internal render passes
- Type-aware lint errors resolved across `buffers-modal`, `dashboard/export`, `dashboard/panels/stats`, `devtools-client`, `use-pane-input`, `vite-plugin`
- Typecheck script corrected to specify tsconfig

### Removed

- `DEVTOOLS_BUNDLED` public re-export removed (use the inlined gate directly)
- Positional `useFrame(cb, priority)` API dropped in favour of `useFrame(cb, { priority })`

Delivers a production-safe devtools subsystem with zero bundle cost in production builds, a live GPU buffer inspector, and a multi-provider dashboard.
