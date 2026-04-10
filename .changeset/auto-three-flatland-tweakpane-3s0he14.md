---
"@three-flatland/tweakpane": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

### New features

- `createPane` — initial release of `@three-flatland/tweakpane` with themed pane, FPS/MS/GPU/MEM cycling stats graph, and collapsible stats row showing draw calls, triangles, geometries, and textures
- `createPane({ scene })` — pass a Three.js `Scene` to auto-wire `scene.onAfterRender` for per-frame draw/triangle stats; no manual `stats.update()` call required
- `wireSceneStats(scene, stats)` — standalone export centralising GPU timestamp pool drain and WebGL/WebGPU backend detection; used by both `createPane` and `useStatsMonitor`
- `StatsHandle` extended with `enableGpu()` and `gpuTime(ms)` — called automatically when `trackTimestamp` is detected; GPU mode cycles into the stats graph
- `useStatsMonitor` hook (`@react-three/fiber`) — wires a `StatsHandle` from `usePane` into R3F's `useFrame` loop for automatic per-frame begin/end timing
- `StatsRow` blade — compact single-row readout for draw calls, triangles, primitives, geometries, and textures beneath the cycling graph
- Pane idle-dimming and pin toggle — pane fades when not hovered; click the pin button in the header to lock it fully opaque
- `usePaneFolder`, `usePaneInput`, `usePaneButton` — created synchronously during render (no pop-in) with deferred disposal to survive React strict mode's cleanup/re-mount cycle
- `claimPane` helper — prevents orphaned pane disposal when a pane is legitimately committed in a `useEffect`

### Performance fixes

- Removed independent `requestAnimationFrame` loop from `StatsGraph` — the competing RAF with SVG mutations caused Safari to throttle to ~20fps due to layout thrashing
- `StatsGraph` now drives `updateLabel`/`updateGraph` from `end()` (once per render frame) and caches SVG dimensions via `ResizeObserver` instead of per-frame `getBoundingClientRect` calls

### Bug fixes

- `wireSceneStats` cleanup now restores the exact original `onAfterRender` function reference (not a bound copy), fixing identity checks in stacked calls and tests
- GPU timestamp async readback queued as a microtask to avoid re-entering the renderer mid-render and corrupting the WebGPU timestamp query pool
- WebGL GPU detection now checks `backend.disjoint` in addition to `backend.trackTimestamp` — prevents GPU mode activating when `EXT_disjoint_timer_query_webgl2` is unavailable
- `usePane` return type fixed (non-nullable after `useEffect` commits)

### BREAKING CHANGES

- `PaneBundle.fpsGraph` is now always `null` — use `stats.begin()`/`stats.end()` instead
- `CreatePaneOptions.fps` option removed; replaced by `stats` (default: `true`)
- `StatsHandle.update()` signature widened to `StatsUpdate` (all fields optional)

`@three-flatland/tweakpane` introduces a full-featured stats pane with automatic GPU timing, a cycling FPS/MS/GPU/MEM graph, and React hooks that survive strict mode — replacing the earlier minimal FPS-only pane API.
