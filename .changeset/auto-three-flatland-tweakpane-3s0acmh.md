---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the tweakpane-plugin-essentials radiogrid blade; deferred disposal and synchronous creation mirror `usePaneButton`/`usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with custom value formatters

## Bug Fixes

- Checkbox hit target stretched to fill the full 20×20 box (`.tp-ckbv_i` explicit `width/height: var(--cnt-usz)`) — eliminates multi-click failures caused by browser pointer-events on the undersized default input
- Checkbox box surface restyled to `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke turns accent pink on `:checked` — previously blended invisibly with the container
- z-index 1000 now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root — pane correctly stacks above overlays
- DPR tracking extended to include `devicePixelRatio` via a `(resolution: Ndppx)` media query — monitor swaps no longer desync canvas sizing
- Fullscreen re-measures after layout settles via `fullscreenchange` listener + deferred RAF — eliminates stale viewport metrics on exit

Adds `usePaneRadioGrid`, improves checkbox usability and visibility, and fixes pane z-index stacking and DPR/fullscreen sync.

