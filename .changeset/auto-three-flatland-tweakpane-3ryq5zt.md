---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

### New hook: `usePaneRadioGrid`

- Added `usePaneRadioGrid` hook — renders an inline button-bar selector backed by the Tweakpane Essentials `radiogrid` blade; returns `[value, setValue]` with React state sync and deferred disposal for strict-mode safety
- Exported `PaneRadioGridCell` and `PaneRadioGridOptions` types from `@three-flatland/tweakpane/react`

### `usePaneInput` improvements

- New `readonly` option renders a binding as a non-interactive monitor that still updates when `setValue` is called
- New `format` option accepts a custom display formatter (e.g. `(v) => v.toFixed(2)`) forwarded to Tweakpane's native `format` option

### Pane z-index fix

- `createPane` now applies `z-index: 1000` to the `.tp-dfwv` wrapper element (the actual body sibling) in addition to the inner pane element, fixing stacking against full-viewport R3F canvas divs

### Theme improvements

- Checkbox hit-target fix: stretches the hidden `<input>` to cover the full visible box so clicks register directly without relying on flaky label-forwarding
- Checkbox theming: `tp-ckbv_w` background, hover/focus/active states, and accented check stroke on `:checked` now match the Flatland theme palette

Three additions to `@three-flatland/tweakpane`: a `usePaneRadioGrid` hook for mode-toggle button bars, `readonly`/`format` options on `usePaneInput`, and theme fixes for z-index stacking and checkbox interactivity.
