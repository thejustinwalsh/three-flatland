---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (React subpath) — inline button-bar selector backed by tweakpane-plugin-essentials' radiogrid blade; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` fields so `usePaneInput` can create readonly monitors with custom formatters

## Bug fixes

- Checkbox hit target enlarged: `.tp-ckbv_i` now fills the full `var(--cnt-usz)` box so clicks land directly on the input without relying on flaky `<label>` forwarding
- `z-index: 1000` applied to the `.tp-dfwv` outer wrapper created by tweakpane rather than the inner `pane.element`, fixing stacking against overlays
- Checkbox box surface styled to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke switches to accent pink on `:checked`

`@three-flatland/tweakpane` gains a `usePaneRadioGrid` hook, readonly monitor support, and fixes for checkbox hit targeting and pane stacking order.
