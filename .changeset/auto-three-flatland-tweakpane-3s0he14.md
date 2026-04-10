---
"@three-flatland/tweakpane": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## Changes

### New package

`@three-flatland/tweakpane` is a new Tweakpane v4 integration package for three-flatland, providing a themed debug pane with performance monitoring for both Three.js and React Three Fiber.

### Core API (`@three-flatland/tweakpane`)

- `createPane(options)` — creates a themed Tweakpane instance with idle-dimming, pin toggle, and stats; accepts `title`, `expanded`, `stats`, `scene`, and `debug` options
- `wireSceneStats(scene, stats, options?)` — exported standalone function hooking `scene.onAfterRender` to auto-populate draw calls, triangle counts, and GPU frame times into a `StatsHandle`; used internally by `createPane({ scene })` and `useStatsMonitor`
- `addStatsGraph(parent)` — cycling FPS/MS/GPU/MEM graph blade; updates driven by `begin()`/`end()`, no independent RAF loop
- `addStatsRow(parent)` — single-row renderer metrics readout (draws, tris, geoms, textures)
- `StatsHandle` interface — `begin()`, `end()`, `update(info)`, `enableGpu()`, `gpuTime(ms)`
- `StatsUpdate` type exported for callers who push renderer info manually
- GPU timing detection on WebGL correctly checks `backend.disjoint` (`EXT_disjoint_timer_query_webgl2`) in addition to `backend.trackTimestamp`, avoiding false-positive GPU mode on WebGL2 without the extension

### React API (`@three-flatland/tweakpane/react`)

- `usePane(options?)` — creates and disposes a `PaneBundle`; survives React strict mode via deferred disposal and orphan pane cleanup (`claimPane`)
- `useStatsMonitor(stats)` — wires the R3F scene into a `StatsHandle` via `wireSceneStats`; use inside a Canvas alongside `usePane`
- `usePaneInput(parent, key, initialValue, options?)` — binds a Tweakpane input to React state; created synchronously on first render to avoid pop-in
- `usePaneFolder(parent, title, options?)` — creates a folder synchronously with deferred disposal for strict mode
- `usePaneButton(parent, title, onClick)` — adds a button with deferred disposal for strict mode
- `useFpsGraph(parent)` — adds an FPS graph blade, returns `{ begin, end }`

### Bug fixes

- Removed independent `requestAnimationFrame` loop from `addStatsGraph` — it was running SVG mutations in parallel with the render loop, causing Safari to throttle tabs to ~20fps; SVG dimensions now cached via `ResizeObserver` and graph updates are driven by `end()`
- `wireSceneStats` properly binds `prev` before replacing `scene.onAfterRender` and uses a flattened Promise chain for GPU timestamp resolution to avoid re-entering the renderer mid-render
- `usePane` returns a non-null `PaneBundle` synchronously, removing the need for non-null assertions at call sites

### Tests

- Comprehensive unit tests added for `createPane`, `usePane`, `usePaneInput`, `usePaneFolder`, and `usePaneButton` covering strict mode, disposal, and re-mount scenarios

Initial release of `@three-flatland/tweakpane` with a full-featured stats pane, React hooks with strict mode support, and a Safari performance fix for the stats graph RAF loop.

