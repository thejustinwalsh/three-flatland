---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- Devtools subsystem dead-stripped from production bundles: all call sites gated on `process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true'` (bundler-replaceable inline); `DevtoolsProvider` lazy-loaded via dynamic `import()` — three-flatland full bundle: 45.4 KB → 36.3 KB
- `process.env` gate typed without `@types/node`: module-local `declare const process` in each gating file; erases at compile, does not pull node types into browser apps
- Pane hooks rewritten for React 19.2: `usePane` uses `useState` lazy initializer; `usePane`/`usePaneFolder`/`usePaneInput` read latest values via `useEffectEvent`; bumps devtools react peer to `^19.2.0`
- `DevtoolsProvider` pure constructor: no side effects at construction; explicit `start()`/`dispose()` lifecycle; safe for R3F reconciler speculative construction
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla apps that don't use `Flatland`
- `<DevtoolsProvider />` React component: passive sampler using default-phase `useFrame`; gated by `DEVTOOLS_BUNDLED + isDevtoolsActive()`
- Buffer debug pipeline (Phase C): `DebugTextureRegistry` for GPU `RenderTarget` + `DataTexture` readback; live thumbnail blade in Tweakpane pane with `◀ name ▶` cycle arrows, 240×120 preview, expand `⤢` button
- Fullscreen buffer viewer modal: collapsible buffer group tree sidebar, aspect-correct canvas, `Esc` to close; drives `client.setBuffers([active])` for single-buffer streaming
- Pan/zoom in modal: mouse wheel zoom centered on cursor, drag to pan, double-click reset; SDF/occlusion debug textures registered (`sdf.distanceField`, `occlusion.mask`)
- WebCodecs VP9 streaming for fullscreen modal: `StreamEncoder` on bus worker thread encodes to `EncodedVideoChunk`, consumer `VideoDecoder` draws `VideoFrame` direct to canvas; falls back to raw-pixel path when WebCodecs unavailable
- Worker-side pixel format conversion: `pixel-convert.ts` handles rgba8, r8, rgba16f (manual f16→f32), rgba32f; display modes: colors, normalize, mono, signed, alpha; GPU row-padding (WebGPU bytesPerRow 256-align) detected and stripped automatically
- Texture readback moved to end-of-frame (after all render passes complete); eliminates blocky strips in SDF visualization
- `DebugTextureRegistry` `maxDim` cap per entry (default 256 for render targets): downsamples via TSL blit before readback, reducing SDF readback from 8 MB to ~150 KB
- Stats panel: bucketed sparkline axis ranges for stable display; axis hysteresis with trimmed max; GPU timing detection; canvas-based sparkline replaces SVG polyline (no per-rAF string allocations)
- Perf instrumentation: `perfMeasure`/`perfStart` emit User Timing spans on Chrome's custom-track extension; ECS systems and provider flush/receive latency land on named tracks
- Buffer subscription sync fixed: modal no longer overwrites thumbnail's subscription on state-change; thumbnail defers to modal when open, resumes on close
- Vite plugin for devtools dashboard; build bundle task for dashboard added to turbo pipeline
- Dashboard: Preact vendor bundle added; protocol log, registry, and batches panels; env panel

**BREAKING CHANGES**
- `DEVTOOLS_BUNDLED` re-export removed; gate on `process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true'` directly or via the `isDevtoolsActive()` helper

`@three-flatland/devtools` ships a production-safe, zero-overhead devtools pipeline with GPU buffer streaming, live lighting debug textures, and full perf instrumentation.
