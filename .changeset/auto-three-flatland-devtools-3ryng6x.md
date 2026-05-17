---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Dashboard (Vite plugin)**
- New `vite-plugin.ts` — serves the devtools dashboard as a Vite dev-server middleware; auto-injects the client script into the host page
- Dashboard built with Preact (vendored, no peer dep); panels: stats sparkline, batch list, buffer inspector, registry viewer, protocol log, environment info, producer selector
- `build:bundle` Turbo task produces a self-contained dashboard bundle

**Buffer inspector**
- Fullscreen buffer modal: collapsible sidebar listing all registered GPU buffers by name prefix; click to switch active; Esc to close; selection drives `setBuffers([active])` so only the viewed buffer streams
- Modal pan/zoom: mouse-wheel zoom (0.25×–64×) centered on cursor, drag to pan, double-click to reset; zoom info overlay; reset button
- WebCodecs VP9 encoding for fullscreen streaming — provider encodes readback pixels on the bus worker, consumer decodes via `VideoDecoder` and draws `VideoFrame` directly; falls back to raw-pixel path when WebCodecs unavailable
- `DebugTextureRegistry` with per-entry `maxDim` cap (default 256 for render targets) and lazy GPU downsampler — 1920×1080 SDF reads back at 256×144 (~150 KB) instead of 8 MB
- Pixel format support: `rgba8`, `r8`, `rgba16f`, `rgba32f`; display modes: `colors`, `normalize`, `mono`, `signed`; GPU row-padding correctly handled for WebGPU's 256-byte `bytesPerRow` alignment
- `occlusion.mask` and `sdf.distanceField` debug textures registered automatically

**Stats panel**
- GPU timing detection — `detectGpuTiming` probes `timestamp-query` support and hides unavailable stats columns
- Canvas-based sparkline replaces SVG polyline — eliminates per-rAF DOM mutations and ~5k string allocations/sec
- Bucketed axis range with trimmed max and hysteresis for stable Y-axis scaling
- `StatsCollector.maybeResolveGpu` throttled from 60 Hz to 10 Hz (6× fewer Promise closures); `toFixed` results cached per display-precision bucket

**React hooks**
- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()` / `dispose()` lifecycle (both idempotent); `Flatland.render()` lazy-starts on first call
- New `<DevtoolsProvider />` React component using default-phase `useFrame`; safe in production builds via `DEVTOOLS_BUNDLED` + `isDevtoolsActive()` gate
- `usePaneFolder` / `usePaneInput` switched from deferred-disposal `setTimeout` to `useLayoutEffect` with `[parent, key]` deps — correct StrictMode remount behavior
- `usePane` dropped `useFrame` dependency; stats graph self-ticks via own `requestAnimationFrame`; `useFrame` priority passed as options object to match R3F v10 API
- `usePaneInput` change handler gated on `mountedRef.current` — prevents state updates on unmounted components

**Controls**
- Tweakpane pane minimal mode toggle
- Buffer thumbnail blade: `◀ name ▶` cycle arrows, 240×120 thumbnail with dimension/format chip, expand `⤢` button to open fullscreen modal
- Modal and thumbnail buffer selection synchronized — thumbnail defers to modal when open, resumes on close

**Perf**
- `perf-track.ts`: `perfMeasure` / `perfStart` emit User Timing spans on Chrome's custom-track extension (`three-flatland` track group); bus-receive latency and per-flush CPU spans automatically instrumented
- Snapshots mutated in place on `_applyRegistry` / `_applyBuffers` — eliminates per-batch object literal allocations
- `ImageData` cached across thumbnail paints when source dimensions match — was allocating ~100 KB `Uint8ClampedArray` at 4 Hz

The devtools dashboard now provides a fully featured GPU buffer inspector with streaming, modal pan/zoom, and stable stats; the React integration is StrictMode-safe with a clean start/dispose lifecycle.
