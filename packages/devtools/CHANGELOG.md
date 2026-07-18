# @three-flatland/devtools

## 1.0.0-alpha.5

### Minor Changes

- 26739f3: > Branch: feat/devtools-texturepacker

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/143

  ## Features
  - **WebSocket transport for remote/mobile debugging** — run the game on a device, attach the desktop dashboard over WebSocket. Adds `connectRemoteDevtools(url)` and a zero-dependency `flatland-devtools-relay` bin (minimal RFC 6455 broadcast relay for development use — no auth/TLS by design).
  - **Time-travel debugging, Phase A: frame-link scrubber** — a shared, per-provider frame cursor lets you park the whole dashboard at a past engine frame. New scrubber control (drag, step, click a protocol-log row to jump to its frame, LIVE button / double-click / Esc to resume). Stat cards and the protocol log now render values relative to the parked frame; the buffers panel freezes its canvas while parked with a "parked at frame N" notice (full historical playback lands in a later phase).

  ## Fixes
  - Hardened the WebSocket relay against several RFC 6455 violations and edge cases: rejects unmasked client frames and Sec-WebSocket-Version mismatches, caps both per-frame and reassembled-fragment size, rejects malformed/oversized control frames and mid-fragmentation interleaving, preserves the original opcode (text vs binary) on broadcast, echoes close frames per spec, and guards broadcast writes so a peer disconnecting mid-broadcast can't throw. `startRelay` now returns `{ close, server }` instead of a bare stop function.
  - Fixed remote-debug WebSocket robustness: malformed frames no longer crash the socket message handlers, the consumer bridge opens a provider's data channel eagerly so early subscribes aren't dropped, and a closed socket passed on (re)start now warns instead of silently going dark.
  - Fixed a same-context echo guard so a provider bridge and consumer bridge coexisting in one page (dashboard debugging itself) no longer relay-ping-pong forever; binary payloads now travel via an explicit path table instead of sentinel objects; wire sends are bound to bridge lifetime so a disposed bridge can't emit stale frames.
  - Scrubber and protocol-log cursor state now update via effects instead of mid-render, fixing a one-frame flash of the previous provider's cursor when switching producers.

  ## Summary

  This release adds a WebSocket-based remote debugging transport and a time-travel frame scrubber, backed by a hardened, spec-compliant relay implementation.

- 415d722: > Branch: feat-vscode-tools

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/117

  ## Remote debugging
  - `connectRemoteDevtools(url)` and `createDevtoolsProvider({ remote: 'ws://…' })` add a WebSocket transport for attaching the dashboard to a game running on a separate device (mobile/remote debugging)
  - New zero-dependency `flatland-devtools-relay` CLI bin — a minimal RFC 6455 broadcast relay for bridging provider/consumer connections (dev tool only, no auth/TLS)
  - Frames queued while the socket is `CONNECTING` flush automatically on open; `provider:gone` is sent synchronously on dispose

  ## Time-travel scrubber (Phase A)
  - Shared frame cursor lets you park the dashboard at a past engine frame — every panel (stats, protocol log, buffers) snaps to that moment, with per-provider parked-position memory
  - New scrubber control under the stats strip (prev/next step, slider, live indicator); protocol-log rows and the LIVE button/double-click/Esc all provide entry/exit points
  - Stats series track a parallel per-frame ring buffer so stat cards can show the value at the parked frame instead of only the live tail

  ## WebSocket relay hardening
  - Closed multiple RFC 6455 compliance gaps: unmasked client frames are now rejected (frames must be masked per spec), oversized/fragmented control frames are rejected, and a new frame can no longer interrupt an in-progress fragmented message
  - Reassembled-fragment size is now bounded (not just per-frame size), closing a drip-fed memory-growth DoS vector
  - Handshakes with `Sec-WebSocket-Version !== 13` are now rejected instead of silently accepted
  - Broadcast now preserves the originating opcode (text stays text, binary stays binary) instead of hardcoding binary
  - Close frames are echoed per spec before ending the connection; broadcast writes are guarded against a peer closing mid-broadcast
  - `startRelay()` now returns `{ close, server }` instead of a bare stop function, so callers can observe the bound port (needed for ephemeral-port test setups)
  - Fixed a same-context echo loop when a provider and consumer bridge coexist in one page (e.g. a dashboard debugging itself remotely)

  Adds full remote/WebSocket debugging support with a time-travel scrubber, backed by a hardened, spec-compliant relay implementation.

### Patch Changes

- Updated dependencies [75fcf94]
- Updated dependencies [abad04f]
- Updated dependencies [d3ee466]
- Updated dependencies [12bacea]
- Updated dependencies [26739f3]
- Updated dependencies [2f94520]
- Updated dependencies [e4c3c68]
- Updated dependencies [9b04cfa]
- Updated dependencies [ea7ec3d]
- Updated dependencies [6caf0f8]
- Updated dependencies [0033ea6]
- Updated dependencies [a8b7e5d]
- Updated dependencies [30550a2]
- Updated dependencies [261b5be]
  - three-flatland@0.1.0-alpha.8

## 1.0.0-alpha.4

### Major Changes

- 2db36c9: Renamed from `@three-flatland/tweakpane` to `@three-flatland/devtools` to reflect the package's growing scope (tweakpane UI plugin + stats monitor + buffer inspection). The old package name is deprecated; update imports to `@three-flatland/devtools` and `@three-flatland/devtools/react`. The sub-export paths and runtime API are unchanged.

### Minor Changes

- dea6d18: > Branch: lighting-stochastic-adoption

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

- 49b9ce3: > Branch: feat-slug

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/20

  ### New hooks and controls

  **`usePaneRadioGrid` (new)**
  - New `usePaneRadioGrid<T>` hook backed by Tweakpane Essentials `radiogrid` blade — renders an inline button-bar selector for scene/mode toggles
  - Returns `[value, setValue]`; blade and React state stay in sync bidirectionally
  - Accepts `cells`, `initialValue`, optional `groupName`, and explicit `size: [cols, rows]`
  - Disposal deferred via `setTimeout(0)` to survive React strict-mode's synchronous cleanup/re-mount pair
  - Exported from `@three-flatland/devtools/react` as `usePaneRadioGrid` + types `PaneRadioGridCell`, `PaneRadioGridOptions`

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

### Patch Changes

- Updated dependencies [dea6d18]
- Updated dependencies [2db36c9]
  - three-flatland@0.1.0-alpha.7

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
  - `createPane` — initial release of `@three-flatland/devtools` with themed pane, FPS/MS/GPU/MEM cycling stats graph, and collapsible stats row showing draw calls, triangles, geometries, and textures
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

  `@three-flatland/devtools` introduces a full-featured stats pane with automatic GPU timing, a cycling FPS/MS/GPU/MEM graph, and React hooks that survive strict mode — replacing the earlier minimal FPS-only pane API.
