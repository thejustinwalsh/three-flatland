---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### Devtools dashboard

- New Vite plugin (`@three-flatland/devtools/vite-plugin`) serves the dashboard as a dev-only side panel
- Dashboard panels: batch stats, ForwardPlus registry, GPU buffer viewer, environment info, protocol log, producer switcher
- Bucketed axis range for sparkline stability (no jump on outlier frames)
- Stats graph rewritten with `<canvas>` (was SVG polyline) — eliminates per-rAF DOM string allocs

### GPU buffer viewer

- `buffers-view.ts` thumbnail blade: `◀ name ▶` cycling, 240×120 canvas, dimensions/format overlay, expand button
- Fullscreen modal (`buffers-modal.ts`): collapsible sidebar group tree, aspect-correct canvas, `image-rendering: pixelated`, Esc to close
- Pan/zoom on modal canvas: mouse-wheel zoom centered on cursor, drag to pan, double-click to reset, clamp 0.25×–64×
- Selection sync: thumbnail defers to modal when open; modal notifies thumbnail via callbacks; closes cleanly
- WebCodecs VP9 encoding for stream mode: worker-side `VideoEncoder` (rgba8/r8 only), `VideoDecoder` on consumer side; graceful fallback for Firefox/Safari
- Pixel format conversion on worker thread: rgba8, r8, rgba16f (manual f16→f32), rgba32f; display modes: `colors`, `normalize`, `mono`, `signed`, `alpha`
- GPU row-padding correction: detects WebGPU's 256-byte `bytesPerRow` alignment in readback data
- Force keyframe on buffer switch; debug texture registrations queued before provider start and replayed on `start()`

### Performance

- Zero-alloc flush path: pool buffers transferred to worker via `BusTransport`; encoder writes into pool cursor; worker broadcasts via `BroadcastChannel`
- Pool tiers: small 4 KB × 8, large 2 MB × 4; `DebugRegistry`/`DebugTextureRegistry` fail-soft with metadata-only flush on oversized entries
- `DebugTextureRegistry` downsample cap (default 256 px max dim) with GPU `Downsampler` blit — 1920×1080 SDF reads back at ~150 KB instead of 8 MB
- `StatsCollector.maybeResolveGpu` throttled to 10 Hz (was 60 Hz)
- Snapshot mutations in place; `toFixed` result cached per display mode

### React hooks and DevtoolsProvider

- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()`/`dispose()` lifecycle, both idempotent
- `Flatland.render()` lazy-starts the provider on first call
- `usePane` dropped `useFrame` dependency; stats graph self-ticks via `driver: 'raf'`
- `usePaneFolder` / `usePaneInput` switched to `useLayoutEffect` with `[parent, key]` deps; StrictMode remount safe
- New `<DevtoolsProvider />` React component; safe in production (gated by `DEVTOOLS_BUNDLED`)
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla apps without a `Flatland` instance
- Controls minimal mode for compact pane layout

### Debug texture registrations

- `sdf.distanceField` (rgba16f, `signed` display), `occlusion.mask` (rgba8, `mono` display)
- `radiance.sceneRadiance`, `radiance.finalIrradiance`, `radiance.cascade0..N` (rgba16f)
- `sdf.jfaPing` / `sdf.jfaPong` JFA intermediate buffers; `forwardPlus.tiles`, `lightStore.lights`
- Readbacks fire from `endFrame()` after all passes complete, not mid-frame
- Live render-target dimensions read at drain time; version bump on resize invalidates stale samples

Devtools dashboard is now fully integrated with the lighting pipeline, streaming live SDF, occlusion, radiance cascade, and light-store textures at interactive frame rates.
