---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New Vite plugin for the devtools dashboard (`@three-flatland/devtools/vite-plugin`)
- Full Preact-based dashboard: stats sparklines, buffer inspector, batch panel, env panel, protocol log, registry panel
- WebCodecs VP9 encoding for fullscreen buffer streaming (worker-side encode, main-thread VideoDecoder; raw-pixel fallback for Firefox/Safari)
- Unified worker pixel conversion: all format conversions (rgba8, r8, rgba16f, rgba32f) happen on the worker thread; GPU row-padding (256-byte WebGPU alignment) detected and handled automatically
- Buffer modal: pan/zoom (mouse wheel + drag), SDF distance field and occlusion mask registered as inspectable debug textures
- Buffer thumbnail/modal selection sync fixed (thumbnail defers to modal while open; modal notifies thumbnail on buffer change and close)
- Bucketed axis range + axis hysteresis for sparkline stability
- GPU timing detection: stats panel hides GPU rows when `timestamp-query` is unavailable (e.g., Safari)
- `DevtoolsProvider` lifecycle overhauled: constructor is now side-effect-free; explicit `start()`/`dispose()` — safe for R3F speculative construction
- Pane hooks rewritten with `useEffectEvent` (React 19.2); `usePane` self-ticks via `driver: 'raf'` independent of `useFrame`
- 256 KB medium pool tier for stats data packets (previously used the 16 MB large tier); eliminates mark-compact GC spikes while the dashboard is active
- Devtools subsystem dead-stripped from production bundles via inlined `process.env.NODE_ENV` gate; production `three-flatland` full size: 45.4 KB → 36.3 KB
- `DevtoolsProvider` enables/disables `trackTimestamp` live off the stats subscription — no longer set at renderer construction time, fixing a "Maximum number of queries exceeded" production regression
- Tweakpane controls minimal mode
- Type-aware lint cleanup across the devtools package

## BREAKING CHANGES

- React 19.2.0+ required for `@three-flatland/devtools`
- `DEVTOOLS_BUNDLED` re-export removed; use the inlined `process.env.FL_DEVTOOLS` / `process.env.NODE_ENV` gate
- `DevtoolsProvider` constructor is now side-effect-free; activation is handled automatically by `Flatland.render()` or via explicit `start()`

`@three-flatland/devtools` gains a full dashboard with buffer inspection, VP9 streaming, and production-safe dead-stripping.
