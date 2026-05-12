---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by tweakpane-plugin-essentials' radiogrid blade; deferred disposal + synchronous creation matching `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` fields — enables readonly monitor bindings with custom formatters via `usePaneInput`
- Checkbox styling: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box so clicks land on the input directly without relying on flaky `<label>` forwarding; checkbox surface styled to match other controls with hover/focus/active parity; check stroke turns accent pink on `:checked`
- Fixed `.tp-dfwv` wrapper z-index application — `z-index: 1000` now applied to the body-sibling stacking context wrapper instead of the inner pane root, so tweakpane correctly stacks above other overlays
- `fullscreenchange` event listener added alongside `resize` to reliably re-measure viewport metrics after fullscreen enter/exit transitions

`@three-flatland/tweakpane` ships radio-grid selection, readonly monitors with formatters, and a corrected checkbox hit target.

