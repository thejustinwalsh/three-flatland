---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

### Dashboard and Vite plugin

- New Vite plugin (`@three-flatland/devtools/vite`) injects the devtools dashboard as a dev-server overlay
- Full dashboard with panels: stats (FPS/frame time/GPU timing), batches, buffers, environment, registry, protocol log
- Dashboard built with vendored Preact (no consumer bundle impact) and bundled separately via `vite.config.bundle.ts`

### Buffer inspector

- Live GPU buffer thumbnail blade: cycles registered buffers with `◀/▶`, 240×120 preview with dimensions/format overlay and expand button
- Fullscreen buffer modal: collapsible buffer list, aspect-correct canvas, Esc to close, drives `client.setBuffers([active])` for streaming only the viewed buffer
- WebCodecs VP9 stream mode: when open, the worker encodes readback pixels as VP9 on the bus worker thread; consumer decodes via `VideoDecoder` directly to the modal canvas; falls back to raw pixels on Firefox/older Safari
- Pixel format conversion moved to worker thread: rgba8, r8, rgba16f (manual half-float decode), rgba32f — with GPU row-padding detection (WebGPU aligns `bytesPerRow` to 256)
- Display modes: `colors`, `normalize`, `mono`, `signed` (diverging red/green for SDFs), `alpha`
- Debug textures registered for SDF distance field and occlusion mask; pan/zoom on modal canvas (wheel + drag, 0.25×–64× clamp, double-click to reset)
- `DebugTextureRegistry` downsample cap: render targets larger than `maxDim` (default 256) are blitted to a scratch RT before readback, reducing a 1920×1080 SDF from 8 MB to ~150 KB per drain

### Stats graph

- Canvas-based sparkline replaces SVG polyline — eliminates per-frame `setAttribute` DOM mutations and template-literal string allocation
- Bucketed axis range with hysteresis for stable Y-axis without jitter
- GPU timestamp query detection: stats panel shows GPU timing rows only when the adapter reports `timestamp-query` support
- `toFixed` string cache: per-mode integer-keyed cache eliminates string allocations when the displayed value hasn't changed

### Pane hooks (React)

- `usePane`, `usePaneFolder`, `usePaneInput` rewritten for React 19.2: uses `useEffectEvent` for latest-value reads, `useState` lazy initializer for bundle, `useLayoutEffect` with `[parent, key]` deps for cleanup — no more "refs during render" diagnostics
- Minimum React peer bumped to `^19.2.0`
- `usePane` drops `useFrame` dependency; stats graph self-ticks via its own `requestAnimationFrame`
- `usePaneInput` change handler gated on `mountedRef.current` to prevent state updates on unmounted components
- New `<DevtoolsProvider name="..." />` React component for non-Flatland R3F apps

### Production dead-strip

- All devtools call sites gated on inlined `process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true'` — esbuild/Vite statically replaces and dead-strips the entire devtools subsystem in production consumer builds
- `DevtoolsProvider` lazy-loaded via dynamic `import()` so `BatchCollector`, texture registries, and the bus worker never enter the production module graph
- `three-flatland` full bundle: 45.4 KB → 36.3 KB (production, devtools excluded)
- ECS schedule perf-track instrumentation gated on dev mode only (not `FL_DEVTOOLS`), so production Knightmark demos no longer pay per-system measurement overhead

### Bug fixes

- Bus worker resolved via extensionless URL so both `source` (`.ts`) and `dist` (`.js`) consumers resolve the correct sibling
- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()`/`dispose()` lifecycle, idempotent and multi-cycle
- Fixed `process` global type errors in source-mode consumers: module-local `declare const process` added to gating files, no `@types/node` required
- Fixed buffer modal/thumbnail selection sync: thumbnail defers to modal when open; modal notifies thumbnail via callbacks
- Fixed modal stream mode: `paint()` no longer resets canvas when `VideoDecoder` is active; float textures skip VP9 encoding

`@three-flatland/devtools` delivers a full GPU-buffer inspector, Preact-powered dashboard, WebCodecs streaming, and production-safe dead-stripping — with a React 19.2 hook API for Tweakpane panes.
