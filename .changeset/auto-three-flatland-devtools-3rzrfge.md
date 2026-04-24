---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New Vite plugin (`@three-flatland/devtools/vite`) serves a standalone devtools dashboard alongside the dev server
- Dashboard panels: batch inspector, stats graph, protocol log, registry browser, GPU buffer viewer
- Fullscreen buffer modal: click `⤢` on any thumbnail to open an aspect-correct fullscreen viewer with pan (drag), zoom (wheel), and reset (double-click or button)
- GPU buffer streaming via WebCodecs VP9: when available, the bus worker VP9-encodes render target readbacks and the modal decodes them with `VideoDecoder`; falls back to raw pixels on Firefox/older Safari
- All pixel format conversion moved to the bus worker thread (`pixel-convert.ts`): handles `rgba8`, `r8`, `rgba16f` (manual half-float decode), `rgba32f`; display modes `colors`, `normalize`, `mono`, `signed`, `alpha`
- GPU row padding (WebGPU aligns `bytesPerRow` to 256) now correctly detected and stripped during conversion
- Unified worker pixel pipeline: producer ships raw bytes, worker converts to RGBA8, broadcasts `buffer:raw` or `buffer:chunk`; consumers receive RGBA8 only
- `BuffersView` thumbnail and modal selection now stay in sync: modal drives selection when open, thumbnail resumes on close
- Controls minimal mode for compact pane layout
- Bucketed axis range for sparkline stability: Y-axis snaps to power-of-two buckets instead of per-frame min/max
- `<DevtoolsProvider />` React component: passive sampler using `useFrame`, safe in production builds (gated by `DEVTOOLS_BUNDLED`)
- React hook lifecycle fixes: `usePaneFolder`/`usePaneInput` use `useLayoutEffect` for immediate cleanup on remount; `usePane` no longer depends on R3F `useFrame`
- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()`/`dispose()` lifecycle — safe for R3F speculative rendering
- Performance: canvas replaces SVG polyline in stats graph, GPU query polling throttled to 10 Hz, `ImageData` cached across thumbnail paints, snapshot mutations in place
- SDF and occlusion debug textures registered with appropriate display modes (`signed` / `mono`)
- Texture readback moved to end-of-frame to capture consistent pipeline output
- Per-entry `maxDim` cap (default 256 px) with GPU downsampler prevents 8 MB readbacks at native resolution
- Bug fixes: float texture VP9 encoding bypassed (encoder expects 8-bit input); keyframe forced on buffer switch in stream mode; paint path skipped when `VideoDecoder` is active

`@three-flatland/devtools` gains a Vite dashboard, fullscreen GPU buffer inspection with VP9 streaming, and a hardened React lifecycle that works correctly under StrictMode.
