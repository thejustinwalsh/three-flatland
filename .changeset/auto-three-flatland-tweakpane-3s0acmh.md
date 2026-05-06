---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New Hooks

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by Tweakpane essentials' `radiogrid` blade; active-state affordance reads better than a dropdown for scene/mode toggles; deferred disposal + synchronous creation match `usePaneButton` / `usePaneInput` pattern

## API Additions

- `PaneInputOptions` extended with `readonly` and `format` fields; lets React hook users create read-only monitors with custom value formatters

## Bug Fixes

- Fixed checkbox hit target: `.tp-ckbv_i` now stretches to the full `var(--cnt-usz)` box size; clicks land directly on the `<input>` without relying on flaky `<label>` forwarding under certain pointer-events / z-index combinations
- Fixed z-index: applied to the `.tp-dfwv` body-sibling wrapper instead of the inner `pane.element`; setting it on `pane.element` had no effect on stacking against other page overlays
- Fixed `useWindowSize` DPR tracking: hook now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query; monitor swaps that change DPR without changing dimensions now trigger canvas re-sizing
- Fixed fullscreen return: added `document.fullscreenchange` listener alongside `resize`; re-measures immediately and once more in the next RAF to catch post-transition layout settles

## Theme

- Checkbox surface color updated to `rgba(28,40,77,0.6)` with hover / focus / active parity matching other controls; check stroke turns accent pink on `:checked`

`usePaneRadioGrid`, a DPR-aware window-size hook, and a z-index fix for the pane wrapper are the headline additions; checkbox reliability and theming round out the release.
