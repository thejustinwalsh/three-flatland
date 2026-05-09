---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; active-state affordance reads better than a dropdown for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters in React hooks
- `z-index: 1000` now applied to the `.tp-dfwv` wrapper (the actual stacking context) rather than the inner pane root — pane reliably sits above other overlays

## Bug Fixes

- Checkbox hit target expanded to full box size: `.tp-ckbv_i` stretched to `width/height: var(--cnt-usz)` so clicks land directly on the input without relying on flaky `<label>` forwarding
- Checkbox theme: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

`usePaneRadioGrid` and readonly monitor support round out the tweakpane react API; checkbox reliability and z-index fixes eliminate common click and layering issues.
