---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane essentials' radiogrid blade; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters in React hooks
- `createPane` z-index fix: applied to `.tp-dfwv` wrapper (body-level stacking context) instead of the inner pane root, so the pane sits above other overlays correctly

## Bug Fixes

- Checkbox hit target: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box; clicks now land directly on the input without relying on flaky `<label>` forwarding
- Checkbox theme: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- DPR tracking: `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query; monitor swaps trigger canvas resize for both the WebGPU canvas and any compare overlay
- Fullscreen state: `fullscreenchange` event now fires an immediate re-measure plus one RAF-deferred measure to catch post-transition layout settle

Adds `usePaneRadioGrid`, readonly monitor support, and fixes checkbox hit-target, DPR sync on monitor swap, and fullscreen resize reliability.
