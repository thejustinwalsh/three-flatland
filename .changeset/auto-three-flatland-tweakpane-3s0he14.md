---
"@three-flatland/tweakpane": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

**New package — initial release**

- `@three-flatland/tweakpane` is a new package providing a themed Tweakpane integration for three-flatland projects
- `createPane(options)` — creates a themed Tweakpane instance with collapsible header, idle-dimming, pin-toggle, and a cycling stats graph (FPS / MS / GPU / MEM)
- `StatsHandle` (`stats.begin()`, `stats.end()`, `stats.update()`, `stats.enableGpu()`, `stats.gpuTime()`) — unified interface for driving the graph and stats row from any render loop
- `wireSceneStats(scene, stats, options?)` — exported helper that hooks `scene.onAfterRender` to capture draw calls, triangle counts, and GPU timestamp data automatically; used internally by both `createPane({ scene })` and `useStatsMonitor`
- `StatsUpdate` type exported from the main entry point alongside `StatsHandle`

**React hooks (`@three-flatland/tweakpane/react`)**

- `usePane(options?)` — creates and disposes a `PaneBundle` with React strict-mode safety (deferred disposal via `setTimeout` to survive the cleanup/re-mount cycle)
- `usePaneInput(parent, key, initialValue, options?)` — binds a Tweakpane input to React state; control created synchronously on first render to avoid pop-in
- `usePaneFolder(parent, title, options?)` — creates a folder synchronously; deferred disposal for strict mode
- `usePaneButton(parent, title, onClick)` — adds a button with a stable ref callback; deferred disposal
- `useFpsGraph(parent)` — legacy FPS graph blade; prefer `usePane` + `useStatsMonitor` for new code
- `useStatsMonitor(stats)` — wires `scene.onAfterRender` and R3F `useFrame` for automatic per-frame draw/triangle stats and FPS/MS graph timing inside an R3F canvas

**Stats graph**

- Custom cycling graph (FPS / MS / GPU / MEM) replaces the old `@tweakpane/plugin-essentials` fpsgraph blade
- Single-row stats readout (draws / tris / prims / geoms / textures) via `addStatsRow`
- GPU mode enabled lazily when `trackTimestamp` is detected on the backend; correctly handles WebGL backends that lack the `EXT_disjoint_timer_query_webgl2` extension
- Fixed: independent RAF loop removed from the stats graph — Safari was throttling tabs to ~20fps due to competing RAF callbacks with SVG mutations; graph now updates inside `end()` driven by the render loop; SVG dimensions cached via `ResizeObserver`

**Pane lifecycle**

- Orphaned panes from aborted React render attempts (StrictMode / Suspense) are now cleaned up automatically via an unclaimed-pane slot in `createPane`
- `claimPane(bundle)` marks a pane as owned by a committed effect; exported for advanced use cases

**Examples**

- All Three.js (`examples/three/`) and React (`examples/react/`) examples updated to use `useStatsMonitor` / `wireSceneStats` and the new `StatsHandle` API
- Tilemap example adds mouse-wheel zoom controls

**Build**

- tsup config added; dual `index` + `react` subpath outputs
- `performance.memory` typed via a dedicated `PerformanceMemory` interface instead of `any` cast

This release ships the `@three-flatland/tweakpane` package with a full-featured stats pane, React hooks, and a Safari performance fix for the stats graph RAF loop.
