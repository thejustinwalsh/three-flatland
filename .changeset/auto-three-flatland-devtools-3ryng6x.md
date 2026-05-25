---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Features

- Fullscreen buffer viewer modal: click ⤢ on any buffer thumbnail to open a zoomable (0.25×–64×), pannable inspector with a collapsible buffer tree sidebar; Esc to close
- WebCodecs VP9 streaming for the modal: frames encoded on the worker thread via `VideoEncoder`, decoded via `VideoDecoder`; falls back to raw-pixel path on Firefox/older Safari
- Devtools dashboard Vite plugin: opens an inspector UI with batches, buffers, stats, registry, and protocol-log panels (built on vendored Preact — zero consumer runtime dep)
- Stats sparklines with bucketed axis range and trimmed-max hysteresis for visual stability; GPU timestamp timings shown when `timestamp-query` is available
- `<DevtoolsProvider name="..." />` React component: passive sampler using `useFrame` default phase; constructor is now side-effect-free with explicit `start()`/`dispose()` lifecycle
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla Three.js apps that don't construct a `Flatland`
- Tweakpane controls minimal mode
- Per-buffer stream selection: switching buffers in the modal now forces a keyframe so the decoder starts immediately
- SDF distance field and occlusion mask registered as named debug textures; all lighting pipeline buffers (JFA ping/pong, radiance cascades) registered
- Worker-side pixel format converter (`pixel-convert.ts`): rgba8, r8, rgba16f (manual half-float decode), rgba32f; display modes: colors, normalize, mono, signed, alpha; handles WebGPU 256-byte row padding
- Per-system colored Performance panel tracks for the full ECS schedule (behind `DEVTOOLS_BUNDLED` build guard)

## Bug Fixes

- Fixed modal thumbnail overwriting the buffer subscription on every state change (thumbnail defers to modal when open)
- Fixed VP9 stream decoder missing keyframe after buffer switch
- Fixed `paint()` overwriting VideoDecoder output in stream mode (raw-pixel path skipped when decoder is active)
- Fixed float textures bypassing VP9 encoding (only rgba8/r8 go through VP9; float textures use raw pixel path)
- Fixed `useFrame` positional priority API deprecation; `usePaneInput` change handler gated on `mountedRef` to prevent post-unmount state updates
- Fixed pane hooks for React 19.2 (`useEffectEvent` replaces latest-ref pattern); React peer requirement bumped to `^19.2.0`
- Fixed bus-worker URL resolution for built `dist/` vs. source (dropped extension from `new URL(...)`)
- Fixed typecheck script path in devtools `package.json`

The devtools package now ships a full GPU-texture inspector dashboard with streaming buffer visualization and ECS performance tracing.
