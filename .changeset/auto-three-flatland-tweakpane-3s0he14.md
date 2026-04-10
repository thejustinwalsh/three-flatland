---
"@three-flatland/tweakpane": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## Changes

### New package

Initial release of the Tweakpane integration package for three-flatland.

### Core API (`import from '@three-flatland/tweakpane'`)

- `createPane(options)` creates a themed, collapsible Tweakpane instance with:
  - Cycling FPS / MS / GPU / MEM performance graph (click to switch mode)
  - Compact `StatsRow` showing draw calls, triangles, geometries, and textures
  - Idle-dimming with a pin toggle in the header to lock full opacity
  - Optional `scene` — pass a Three.js `Scene` to auto-capture `renderer.info` stats on every frame via `scene.onAfterRender` with no manual `stats.update()` needed
  - Optional `debug` flag (default `true`) — logs one-time backend diagnostics on first frame
- `wireSceneStats(scene, stats, options?)` exported helper: wires a `StatsHandle` into `scene.onAfterRender`, handles GPU timestamp detection (WebGPU and WebGL with `EXT_disjoint_timer_query_webgl2`), async readback via microtask, and restores the original hook on cleanup
- `StatsHandle` now includes `enableGpu()` and `gpuTime(ms)`; `update()` accepts `StatsUpdate` (all fields optional)
- `StatsUpdate` type exported from the main entry point
- Orphan pane cleanup for React 18 StrictMode: `createPane` disposes any unclaimed pane from a previous discarded render; `claimPane()` marks a bundle as committed

### React API (`import from '@three-flatland/tweakpane/react'`)

- `usePane(options?)` — pane mounted synchronously during render, disposed on unmount
- `useStatsMonitor(stats)` — wires `stats.begin()` / `stats.end()` into R3F frame loop via `useFrame` (priority `Infinity` / `-Infinity`) and captures draw stats from `scene.onAfterRender`
- `usePaneInput` — binding created synchronously on first render (no pop-in); deferred disposal for Strict Mode
- `usePaneFolder` — folder created synchronously during render; deferred disposal for Strict Mode
- `usePaneButton` — button created synchronously; deferred disposal for Strict Mode
- `useFpsGraph` retained for compatibility

### Performance fix — Safari frame-rate regression

- Removed independent `requestAnimationFrame` loop that drove SVG graph updates; updates now driven by `stats.end()`, called once per frame from the render loop
- SVG canvas dimensions cached via `ResizeObserver` instead of per-frame `getBoundingClientRect()` — eliminates layout reflow that caused Safari to throttle affected tabs to ~20 fps

### Bug fixes

- `wireSceneStats` cleanup restores the exact original `onAfterRender` reference (not a bound copy), fixing identity checks when wiring calls are stacked
- GPU graph unit label corrected from `GPU` to `MS`
- WebGL GPU tracking now checks `backend.disjoint` in addition to `trackTimestamp` — prevents enabling GPU mode on machines that lack `EXT_disjoint_timer_query_webgl2`
- GPU timestamp readback moved to a microtask to prevent re-entering the renderer mid-render (WebGPU query pool corruption)

### Build

- Built with `tsup` (ESM + CJS, dual `.d.ts`); peer deps `tweakpane ^4`, `@tweakpane/plugin-essentials ^0.2.1`, optional `react`
- Full Vitest test suite covering `createPane`, `usePane`, `usePaneInput`, `usePaneFolder`, `usePaneButton`, `useStatsMonitor`

This release introduces `@three-flatland/tweakpane` with a themed debug panel, a cycling performance graph, automatic GPU timing, React hooks safe under Strict Mode, and a fix for a Safari frame-rate regression caused by competing RAF loops.
