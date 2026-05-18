---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

**Devtools dashboard**
- New in-browser dashboard built with Preact (vendored, zero peer-dep): batch inspector, env panel, stats sparklines, registry viewer, protocol log
- Vite plugin (`@three-flatland/devtools/vite-plugin`) — injects and serves the dashboard via a `?devtools` route; no manual wiring required
- Separate tsconfig + tsup build target for the dashboard bundle

**Buffer viewer**
- In-pane buffer thumbnails with live streaming from GPU readbacks
- Fullscreen modal: click ⤢ on any thumbnail to open; collapsible sidebar lists all registered buffers grouped by name prefix; main area renders aspect-correct canvas with `pixelated` image rendering
- Modal pan/zoom: mouse-wheel zoom centered on cursor, drag to pan, double-click to reset; zoom level and pan offset shown in info overlay
- Zoom controls repositioned to top-left to avoid docs-page overlap; zoom info hidden at 1× identity
- Buffer selection sync between thumbnail and modal: modal takes exclusive selection while open, thumbnail resumes on close
- VP9 WebCodecs streaming for fullscreen modal (Chrome/Edge): `VideoEncoder` on bus worker encodes readback frames; `VideoDecoder` draws `VideoFrame` directly to canvas; automatic fallback to raw-pixel path when WebCodecs unavailable (Firefox, older Safari)

**Pixel conversion (worker-side)**
- All format conversion moved to the bus worker thread: provider ships raw bytes, worker converts to RGBA8, broadcasts as `buffer:raw` or VP9-encoded `buffer:chunk`
- GPU row-padding detection: WebGPU aligns `bytesPerRow` to 256; converter now reads the correct stride from the data byte length
- Supports `rgba8`, `r8`, `rgba16f` (manual half-float decode), `rgba32f` with display modes: `colors`, `normalize`, `mono`, `signed`, `alpha` (new — reads alpha channel as greyscale for occlusion masks)
- Registered debug textures: `sdf.distanceField` (signed distance field, `signed` display) and `occlusion.mask` (binary occlusion mask, `mono` display)

**Stats graph**
- Bucketed axis range for sparkline stability (prevents axis thrash from transient spikes)
- Axis hysteresis with trimmed-max: large outliers expand the range but don't hold it
- `toFixed` result cached per display-precision rounded integer — eliminates per-rAF string allocation when the displayed value hasn't changed

**React hooks**
- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()` / `dispose()` lifecycle; `Flatland.render()` lazy-starts on first call
- `usePane`: dropped `useFrame` dependency; stats graph self-ticks via its own `rAF` driver — works outside `<Canvas>` context
- `usePaneFolder` / `usePaneInput`: switched from deferred-disposal (`setTimeout`) to `useLayoutEffect` with stable deps; fixes StrictMode remount issues
- New `<DevtoolsProvider />` React component for non-Flatland R3F scenes; gated by `DEVTOOLS_BUNDLED + isDevtoolsActive()`, safe in production builds
- Fixed `useFrame` priority collision in `usePane` that produced `"Job already exists"` warnings under StrictMode
- `usePaneInput` change handler gated on `mountedRef` to prevent state updates on unmounted components

**GPU timing**
- `detectGpuTiming` helper probes `EXT_disjoint_timer_query_webgl2` availability; stats panel adapts visibility based on capabilities

**Performance**
- `_applyRegistry` / `_applyBuffers` mutate existing snapshot objects in-place on subsequent frames; only first sight allocates a new snapshot
- Deduplicated rAF allocations; gated registry/buffer payloads; added timing tracks

**Bug fixes**
- `createDevtoolsProvider()` helper exported from `three-flatland` for non-Flatland vanilla apps; returns a no-op stub in production builds
- Fixed `useFrame` priority API: switched from deprecated positional form to `{ priority }` options object
- Corrected `typecheck` script to specify the right `tsconfig`
- Worker bounces pool buffer after conversion (was bouncing before, detaching the buffer mid-read)
- Float textures (`rgba16f`/`rgba32f`) skip VP9 encoding; `VideoEncoder` expects 8-bit RGBA input

Delivers the full devtools dashboard with live GPU-buffer streaming, a fullscreen pan/zoom viewer, WebCodecs VP9 encoding, and a hardened React hook lifecycle.
