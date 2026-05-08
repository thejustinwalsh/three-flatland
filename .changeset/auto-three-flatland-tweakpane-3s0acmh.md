---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the essentials `radiogrid` blade; deferred disposal + synchronous creation mirror `usePaneButton`/`usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with custom value formatters

## Bug fixes

- Checkbox hit target: `.tp-ckbv_i` now covers the full `var(--cnt-usz)` box — clicks land directly on the input without relying on flaky `<label>` forwarding
- Checkbox styling: box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- z-index: apply `z-index: 1000` to the `.tp-dfwv` outer wrapper instead of the inner pane element so the pane stacks correctly above other overlays

Adds `usePaneRadioGrid` for compact scene/mode toggles, extends `PaneInputOptions` with `readonly`/`format` for monitor inputs, and fixes checkbox hit target, theming, and pane z-index stacking.

