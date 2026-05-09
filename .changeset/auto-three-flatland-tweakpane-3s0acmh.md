---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath): inline button-bar selector backed by tweakpane-plugin-essentials `radiogrid` blade; active-state affordance reads better than a dropdown for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` so React hook users can create readonly monitors with custom formatters
- `createPane`: z-index now applied to the `.tp-dfwv` body-sibling wrapper (not the inner pane root) so tweakpane correctly stacks above other overlays

## Bug Fixes

- Checkbox hit target expanded to full 20×20 visible box: `.tp-ckbv_i` stretched via `width/height: var(--cnt-usz)` so clicks land directly on the input — no flaky `<label>` forwarding
- Theme: checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- DPR tracking: `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so monitor swaps trigger canvas resize
- Fullscreen: `document.fullscreenchange` listener added alongside `resize`; re-measures immediately and once in the next RAF to catch post-transition layout settles

## Migration

- Examples migrated from Web Awesome (`@awesome.me/webawesome`) to `@three-flatland/tweakpane`; all `wa-*` selectors, CSS, and `useWrappingGroup` / `setupWrappingGroup` helpers removed

`@three-flatland/tweakpane` now covers DPR/fullscreen-aware sizing, correct stacking context z-index, and reliable checkbox interaction across browsers.

