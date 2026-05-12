---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New hooks and theme

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; deferred disposal + synchronous creation matching `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters via `usePaneInput`

### Theme fixes

- Checkbox `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box — fixes multi-click requirement caused by browser-default 13×13 input not covering the 20×20 visible area; clicks now land directly on the input
- Checkbox box surface set to `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke turns accent pink on `:checked` — previously blended invisibly into the container

### Pane stacking fix

- `createPane` now applies `z-index: 1000` to the `.tp-dfwv` body-sibling wrapper element instead of the inner pane root — setting it on `pane.element` had no effect on stacking context

---

Adds `usePaneRadioGrid`, readonly monitor support in `usePaneInput`, and fixes checkbox hit-target and pane z-index stacking.
