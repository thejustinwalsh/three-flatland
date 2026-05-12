---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## `@three-flatland/tweakpane` changes

### New features

- `usePaneRadioGrid` React hook (`/react` subpath) — inline button-bar selector backed by tweakpane-plugin-essentials' `radiogrid` blade; deferred disposal + synchronous creation match `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` — allows readonly monitor bindings with custom formatters
- `createPane` z-index fix: applies `z-index: 1000` to the `.tp-dfwv` body-level wrapper (not the inner pane root) so the pane correctly stacks above all overlays

### Bug fixes

- Checkbox hit target: `.tp-ckbv_i` now stretches to the full `var(--cnt-usz)` box via explicit `width`/`height`; clicks land directly on the input without relying on flaky `<label>`→`<input>` forwarding under certain pointer-events/z-index combinations
- Theme: checkbox box surface now uses `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke turns accent pink on `:checked`; default blended box was essentially invisible against the container background

### Example integration

- Both React and Three.js slug-text examples migrated from Web Awesome to `@three-flatland/tweakpane` — Settings + Mode folders with identical parameter bindings in both examples
- Stats monitor via `useStatsMonitor` / `stats.begin()`+`stats.end()` with `trackTimestamp: true` for GPU-time mode

---

Adds `usePaneRadioGrid`, readonly monitor support, and fixes checkbox reliability and z-index stacking for the tweakpane wrapper.

