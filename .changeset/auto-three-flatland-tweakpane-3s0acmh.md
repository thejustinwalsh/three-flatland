---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; deferred disposal + synchronous creation match `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` gains `readonly` and `format` fields, enabling read-only monitor bindings with custom formatters from React hooks

### Bug fixes

- Checkbox hit target stretched to full `var(--cnt-usz)` box: `.tp-ckbv_i` input now covers the entire visible area so clicks land directly on the input instead of relying on flaky `<label>` forwarding under pointer-events/z-index combinations
- Checkbox box surface themed to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `z-index: 1000` applied to the `.tp-dfwv` body-sibling wrapper instead of the inner `pane.element`, fixing stacking against other overlays

---

Adds `usePaneRadioGrid`, `readonly`/`format` input options, and corrects checkbox styling and z-index stacking.

