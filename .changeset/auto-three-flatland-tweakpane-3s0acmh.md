---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## What's New

### New hooks and controls
- `usePaneRadioGrid` (React subpath) — inline button-bar selector backed by essentials' radiogrid blade; active-state affordance works better than a dropdown for scene/mode toggles; deferred disposal + synchronous creation mirrors existing `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitor bindings with custom formatters from React hooks

### Fixes
- `createPane`: z-index 1000 now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root — previously had no effect on stacking against other overlays
- Checkbox hit target stretched to full 20×20 box via `width/height: var(--cnt-usz)` on `.tp-ckbv_i` — eliminates multi-click failures caused by flaky `<label>→<input>` forwarding under pointer-events/z-index combinations
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media-query; monitor swaps that change DPR without changing dimensions now trigger canvas resize

### Theme
- Checkbox box surface styled to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked` — previously the hit target was effectively invisible against the container background

### Examples migration
- Replaced all Web Awesome (`@awesome.me/webawesome`) controls with `@three-flatland/tweakpane` in both React and Three slug-text examples; `wa-*` selectors, CSS, and `useWrappingGroup`/`setupWrappingGroup` helpers removed

Bug fixes for DPR sync on monitor swap/fullscreen, checkbox reliability, and pane z-index stacking; new `usePaneRadioGrid` hook and `readonly`/`format` monitor options for the React subpath.
