---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New hooks

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by essentials' `radiogrid` blade; deferred disposal + synchronous creation mirror the existing `usePaneButton`/`usePaneInput` pattern

## API additions

- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters via `usePaneInput`
- `createPane` z-index now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root, so tweakpane stacks correctly above other overlays

## Theme / style fixes

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `.tp-ckbv_i` stretched to the full `var(--cnt-usz)` box size — input now covers the entire visible area, eliminating multi-click and pointer-event forwarding failures

Adds `usePaneRadioGrid`, `readonly`/`format` input options, and fixes checkbox styling and hit-target reliability.
