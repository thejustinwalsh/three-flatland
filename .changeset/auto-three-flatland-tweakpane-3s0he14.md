---
"@three-flatland/tweakpane": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## BREAKING CHANGES

- `PaneBundle.fpsGraph` is always `null`; replace all `fpsGraph.begin()` / `fpsGraph.end()` calls with `stats.begin()` / `stats.end()` from `PaneBundle.stats`
- `CreatePaneOptions.fps` is removed; use `stats: boolean` to show/hide the stats panel
- `addStatsGraph` no longer accepts a `label` option

## New features

- `createPane` returns a `stats: StatsHandle` object — call `stats.begin()` / `stats.end()` each frame and `stats.update({ drawCalls, triangles, ... })` after render to drive the graph and stats folder
- Cycling stats graph (click to cycle FPS / MS / MEM / GPU modes) replaces the plain FPS graph blade; GPU mode is auto-enabled when the backend supports timestamp queries
- `wireSceneStats(scene, stats[, { debug }])` — exported helper for plain Three.js; hooks `scene.onAfterRender` to capture `renderer.info` each frame, auto-detects GPU timestamp support on WebGPU and WebGL backends, and microtask-queues GPU readback to avoid re-entering the renderer mid-frame
- `useStatsMonitor(stats)` — R3F hook that wires `scene.onAfterRender` and `useFrame` (at `priority: Infinity` / `-Infinity`) into a `StatsHandle`; reads `renderer.info.render` accurately from inside the render callback rather than a racy `useFrame`
- `StatsRow` — compact single-row renderer stats blade showing draw calls, triangles, primitives, geometries, and textures with outline SVG icons and compact number formatting (K / M / B / T suffixes)
- `StatsHandle.enableGpu()` / `StatsHandle.gpuTime(ms)` — new methods to push GPU frame times into the cycling graph
- `CreatePaneOptions.debug` (default `true`) — logs one-time backend diagnostics on the first frame (backend class, `trackTimestamp` state, first GPU time sample)
- `CreatePaneOptions.stats` replaces `fps`; controls the stats panel

## Bug fixes

- Stats graph no longer runs its own `requestAnimationFrame` loop alongside the render loop — fixes Safari tab-level throttling to ~20fps; SVG dimensions are now cached via `ResizeObserver` instead of per-frame `getBoundingClientRect` calls
- `wireSceneStats` correctly binds the previous `onAfterRender` handler with the scene as `this`; `resolveTimestampsAsync` is also bound before the microtask so it can't be garbage-collected mid-microtask
- `usePane` survives React Strict Mode double-invoke without disposing a live pane (uses `setTimeout` to distinguish strict-mode cleanup from real unmount)
- TypeScript `any` casts removed from `addStatsGraph` and `stats-graph.ts`; `PerformanceMemory` typed explicitly

## Build / package

- Initial tsup config added (`esm` + `cjs`, `dts`, `sourcemap`, `bundle: false`)
- Exports wired: `index.ts` (vanilla), `react.ts` (R3F subpath), `useStatsMonitor` exported from `react.ts`
- Comprehensive unit tests for `createPane`, `usePane`, `usePaneInput`, `usePaneFolder`, `usePaneButton`; vitest config and CI updated

Introduces a complete stats monitoring system — cycling graph, `wireSceneStats` for Three.js, `useStatsMonitor` for R3F, and `StatsRow` — while fixing a Safari performance regression caused by a competing RAF loop in the stats graph.

