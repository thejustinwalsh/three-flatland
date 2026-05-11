---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Hooks

- `usePaneRadioGrid` (React subpath) — inline button-bar selector backed by tweakpane-essentials `radiogrid` blade; active-state affordance suits scene/mode toggles better than a dropdown; deferred disposal + synchronous creation match `usePaneButton` / `usePaneInput` lifecycle

## Input Options

- `PaneInputOptions` gains `readonly` and `format` fields — React hook users can now create readonly monitors with custom value formatters

## Theme

- Checkbox `.tp-ckbv_i` input now covers the full 20×20 hit box (`width/height: var(--cnt-usz)`) — eliminates multi-click failures caused by flaky `<label>` → `<input>` pointer-event forwarding
- Checkbox box surface changed to `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke turns accent pink on `:checked` — previously blended invisibly into the container background

## Bug Fixes

- `createPane` z-index now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner `pane.element` root — setting z-index on the inner element had no effect on stacking against other overlays

This release adds the `usePaneRadioGrid` hook, readonly/format monitor support, and fixes checkbox hit-target and z-index stacking issues.
