---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- Vite plugin for a self-contained devtools dashboard (Preact-based)
- Dashboard panels: stats sparklines, registry (CPU typed arrays), buffer thumbnails, batch inspector, environment info, protocol log
- Live GPU buffer inspection: `DebugTextureRegistry` publishes render targets and data textures; per-consumer buffer selection over the debug bus
- Buffer thumbnail blade: `◀ name ▶` cycle arrows, 240×120 preview, display modes (`colors`/`normalize`/`mono`/`signed`), format-driven defaults
- Fullscreen buffer modal: pan/zoom (wheel + drag), sidebar buffer tree, aspect-correct canvas, Esc to close
- VP9 WebCodecs streaming for fullscreen modal: worker-side `VideoEncoder`, consumer `VideoDecoder`; graceful fallback to raw pixels on unsupported browsers
- GPU timing detection: stats panel adapts visible metrics to renderer capabilities
- `maxDim` cap per buffer entry with lazy GPU downsampler (256px cap prevents 8MB readbacks for large render targets)
- WebGPU row-padding detection in pixel-convert worker (correct stride for non-power-of-two readbacks)
- All pixel-format conversion moved to the worker thread (RGBA8 only reaches main thread)
- `DevtoolsProvider` constructor now side-effect-free; explicit `start()`/`dispose()` lifecycle, both idempotent and multi-cycle
- `<DevtoolsProvider />` React component for non-Flatland scenes; `createDevtoolsProvider()` helper for vanilla use
- Pane hooks rewritten with `useEffectEvent` for React Compiler compatibility; React peer requirement bumped to `^19.2.0`
- Bucketed axis range for sparkline stability; stats canvas replaces SVG polyline (zero DOM mutation per frame)
- Performance: snapshot mutation in place, `toFixed` string caching, `ImageData` reuse across thumbnail paints, `StatsCollector.maybeResolveGpu` throttled to 10 Hz
- `perf-track.ts`: `perfMeasure`/`perfStart` API emitting Chrome User Timing spans with color-coded per-pipeline tracks
- Minimal mode for Tweakpane pane controls
- Two-channel BroadcastChannel bus: shared discovery channel + per-provider data channel
- Fixed: thumbnail/modal buffer selection de-sync on state change
- Fixed: `VideoDecoder` output overwritten by raw-pixel `paint()` in stream mode
- Fixed: force keyframe on buffer switch in VP9 stream mode
- Fixed: R3F `useFrame` priority API updated to options-object form (deprecation warning removed)
- Fixed: late Tweakpane `change` events gated on `mountedRef` to prevent state updates on unmounted components

Major devtools release: full Preact dashboard with live GPU buffer inspection, VP9 streaming, React 19.2 pane hooks, and comprehensive rendering and allocation performance improvements.
