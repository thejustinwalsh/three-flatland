---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### Devtools dashboard (Vite plugin)

- New Vite plugin (`@three-flatland/devtools/vite`) embeds a standalone Preact dashboard at `/__devtools__`
- Dashboard panels: stats graph, batches, buffer registry, environment, protocol log, producer switcher
- Batches panel shows live draw-call and sprite batch data from `BatchCollector`

### Fullscreen buffer viewer

- Click `⤢` on any buffer thumbnail to open a fullscreen modal with sidebar group tree, aspect-correct canvas, and header with buffer metadata
- Pan (drag) and zoom (mouse wheel centered on cursor) with reset on buffer switch; double-click resets transform
- Buffer selection drives stream subscription — only the active buffer is streamed when modal is open
- Thumbnail defers to modal selection when modal is open; resumes driving selection on close
- Stream mode: WebCodecs VP9 encoding on bus worker thread; `VideoDecoder` on consumer; fallback to raw pixels when WebCodecs unavailable (Firefox, older Safari)

### Pixel format conversion

- Worker-side conversion for all texture formats: `rgba8`, `r8`, `rgba16f` (half-float decode), `rgba32f`
- Display modes: `colors`, `normalize`, `mono`, `signed` (red/green diverging), `alpha`
- GPU row-padding (WebGPU 256-byte `bytesPerRow` alignment) handled automatically

### Debug protocol & streaming

- Buffer subscription protocol: `subscribe.buffers` for per-entry selection; `BufferDelta` metadata always ships, pixels gated by selection
- Debug texture readbacks moved to end-of-frame (after all render passes) — eliminates partial-frame captures
- `forceKeyframe` on buffer switch in stream mode — decoder starts immediately after switch
- Registered debug textures: SDF distance field, occlusion mask, JFA intermediates, radiance cascades

### React hooks & lifecycle

- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()` / `dispose()` lifecycle (both idempotent)
- New `<DevtoolsProvider />` R3F component — passive sampler, gated by `DEVTOOLS_BUNDLED` + `isDevtoolsActive()`
- `usePane` no longer depends on `useFrame`; stats graph self-ticks via own `requestAnimationFrame`
- `usePaneFolder` / `usePaneInput` use `useLayoutEffect` with stable deps — clean StrictMode remount behavior
- R3F `useFrame` priority uses options-object form (positional API deprecated)

### Controls & UI

- Tweakpane controls minimal mode: compact single-row layout for small viewports
- Bucketed axis range for sparkline stability — Y-axis snaps to power-of-2 buckets, preventing constant rescaling

### Performance

- Stats graph switched from SVG polyline to Canvas `lineTo` — eliminates per-frame DOM mutation and selector invalidation
- `_applyRegistry` / `_applyBuffers` mutate snapshots in place; `toFixed` strings cached per rounded value
- `StatsCollector.maybeResolveGpu` throttled to 10 Hz (was 60 Hz)
- `DebugTextureRegistry` `maxDim` cap with lazy GPU downsampler for large render targets
- User Timing spans (`perfMeasure`) emitted on Chrome's custom-track extension for devtools profiling

This release delivers a fully-featured browser devtools dashboard with live GPU buffer inspection, streaming, and a robust React hook layer.