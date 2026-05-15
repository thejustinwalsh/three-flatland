# @three-flatland/tweakpane

## 0.1.0-alpha.3

### Minor Changes

- 49b9ce3: > Branch: feat-slug

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/20

  ### New hooks and controls

  **`usePaneRadioGrid` (new)**
  - New `usePaneRadioGrid<T>` hook backed by Tweakpane Essentials `radiogrid` blade — renders an inline button-bar selector for scene/mode toggles
  - Returns `[value, setValue]`; blade and React state stay in sync bidirectionally
  - Accepts `cells`, `initialValue`, optional `groupName`, and explicit `size: [cols, rows]`
  - Disposal deferred via `setTimeout(0)` to survive React strict-mode's synchronous cleanup/re-mount pair
  - Exported from `@three-flatland/tweakpane/react` as `usePaneRadioGrid` + types `PaneRadioGridCell`, `PaneRadioGridOptions`

  **`usePaneInput` additions**
  - `readonly` option — renders the binding as a read-only monitor; value still updates via `setValue`
  - `format` option — custom display formatter forwarded to Tweakpane's native `format` option (e.g. `(v) => v.toFixed(2)`)

  ### Bug fixes

  **`createPane` z-index**
  - `z-index: 1000` now also applied to the `.tp-dfwv` default-wrapper element (the actual body sibling); previously only the inner `pane.element` received it, making z-index a no-op against other full-viewport overlays

  **Checkbox hit target and styling**
  - Checkbox input stretched to cover its visible affordance (`--cnt-usz × --cnt-usz`) so clicks always register without relying on flaky label-forwarding
  - Checkbox background, hover, focus, active, and checked states themed to match the rest of the Flatland control surface (accent stroke in pink on `:checked`)

  `usePaneRadioGrid`, `readonly`/`format` input options, a z-index fix for panes behind full-viewport canvases, and a checkbox hit-target and styling overhaul.

- c348639: > Branch: feat-slug

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/20

  ## New features
  - `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; active-state affordance; deferred disposal and synchronous creation match existing `usePaneButton`/`usePaneInput` pattern
  - `PaneInputOptions.readonly` + `PaneInputOptions.format` — create readonly monitors with custom formatters from React hooks

  ## Fixes
  - `z-index: 1000` applied to `.tp-dfwv` wrapper (the body-sibling stacking context) instead of the inner pane root — fixes tweakpane not stacking above other overlays
  - Checkbox hit target: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box size — fixes multi-click required in some browser/pointer-events combinations
  - Checkbox theme: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

  Adds `usePaneRadioGrid` for inline mode-selector controls, extends `PaneInputOptions` with `readonly` and `format` support, and fixes checkbox theming and hit-target reliability.

## 0.1.0-alpha.2

### Minor Changes

- 4d6d65a: > Branch: feat-examples-tweakplane

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
