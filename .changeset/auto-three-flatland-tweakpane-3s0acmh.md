---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by tweakpane-essentials' radiogrid blade; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters in React hooks

## Bug Fixes

- Checkbox hit target stretched to full `var(--cnt-usz)` box — input now covers the entire visible area without relying on flaky `<label>` click forwarding
- Checkbox background styled to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active/checked states; check stroke turns accent pink on `:checked`
- `z-index: 1000` applied to the `.tp-dfwv` wrapper (the body-sibling stacking context) instead of the inner pane element — tweakpane now correctly stacks above other overlays

Adds `usePaneRadioGrid`, extends `PaneInputOptions` with `readonly`/`format`, and fixes checkbox hit target sizing and z-index stacking.
