---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/devtools

### New features

- **Vite plugin for devtools dashboard**: standalone dashboard SPA served by the Vite dev server; build bundle task added to turbo pipeline
- **Fullscreen buffer viewer modal**: click the expand button on any buffer thumbnail to open a fullscreen modal with a collapsible group sidebar, pixel-perfect canvas display, pan/zoom (mouse wheel + drag), Esc to close
- **WebCodecs VP9 encoding**: fullscreen buffer modal streams GPU readback pixels via VP9 on the bus worker; `VideoDecoder` on the consumer side; falls back to raw-pixel path when WebCodecs unavailable (Firefox, older Safari)
- **GPU timing detection**: auto-detects GPU timestamp query support and conditionally shows GPU time in the stats panel
- **Debug buffer pipeline** (`DebugTextureRegistry`): live GPU buffer readback with per-consumer selection, metadata-only fast path, and pixel payloads gated by selection
- **Buffer display modes**: `colors`, `normalize`, `mono`, `signed` (red/green diverging), `alpha` — format-driven defaults; all conversion runs on the worker thread
- **GPU row padding**: worker correctly detects WebGPU's 256-byte `bytesPerRow` alignment and strips padding on readback
- **SDF + occlusion debug textures**: `sdf.distanceField` (rgba16f, signed) and `occlusion.mask` (rgba8, mono) registered in the buffer panel
- **`createDevtoolsProvider` helper**: exported from `three-flatland` for vanilla Three.js apps that don't construct a `Flatland`; returns a no-op stub in production
- **`<DevtoolsProvider />` React component**: passive sampler using `useFrame`; added to all non-Flatland React examples
- **React lifecycle overhaul**: `DevtoolsProvider` constructor is now side-effect-free with explicit `start()`/`dispose()` lifecycle; `useEffectEvent` in pane hooks replaces ref-during-render patterns; requires React ≥ 19.2
- **Tweakpane controls minimal mode**: `createPane` gains a compact minimal style variant
- **Bucketed axis range**: sparkline y-axis uses hysteresis + trimmed max for stable display under bursty data
- **Canvas-based stats graph**: replaces SVG `<polyline>` eliminating per-frame DOM mutations and selector invalidation; `toFixed` output cached to reduce string allocations

### Bug fixes

- Dead-strip entire devtools subsystem from production bundles: `DevtoolsProvider` lazy-loaded via dynamic `import()` behind a bundler-replaceable `process.env` guard; production bundle drops from 45.4 KB → 36.3 KB
- Fixed `process.env` type errors in consumers using `types: ["vite/client"]`: module-local `declare const process` added to each gating file, no `@types/node` required
- Perf-track instrumentation now gated on dev mode only (not `FL_DEVTOOLS`); production examples no longer pay the per-frame `performance.now()` cost
- Fixed buffer modal overwriting decoder output on every state change when `VideoDecoder` was active; stream mode now skips the raw-pixel `paint()` path
- Fixed float texture VP9 encoding: only `rgba8`/`r8` textures are VP9-encoded; float buffers flow raw to the consumer's decoder
- Fixed modal/thumbnail selection sync: thumbnail defers to modal when open; modal notifies thumbnail on active buffer change and open/close
- Fixed `useFrame` priority API: switched from positional to options-object form; removed unused priority from pane update hook to avoid StrictMode remount collisions
- Fixed `usePaneInput` change handler firing on unmounted component: gated on `mountedRef.current`
- Snapshot mutation in place (no per-batch object literal allocations); `DebugTextureRegistry` adds `maxDim` cap with lazy GPU downsampler to keep readback sizes bounded
- Resolved type-aware lint errors: `IndexedDB` rejection wrapping, `PingPayload` → `Record<string, never>`, `JSON.parse` typed as `unknown`, unused imports removed

This release ships a full devtools dashboard with live GPU buffer inspection, VP9 streaming, production dead-stripping (saving ~9 KB), and a React 19.2-compatible hook API.
