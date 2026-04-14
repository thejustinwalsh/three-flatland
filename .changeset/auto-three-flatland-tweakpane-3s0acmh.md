---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New hooks

- `usePaneRadioGrid` (React subpath) — inline button-bar selector backed by tweakpane-essentials' `radiogrid` blade; deferred disposal and synchronous creation match existing hook patterns

## Input options

- `PaneInputOptions` gains `readonly` and `format` fields — create readonly monitors with custom formatters from any `usePaneInput` call

## Theme fixes

- Checkbox hidden `<input>` stretched to full `var(--cnt-usz)` box — eliminates need for `<label>` click forwarding that was flaky under certain pointer-events / z-index combinations
- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke uses accent pink on `:checked`

## Bug fixes

- `createPane` now applies `z-index: 1000` to the `.tp-dfwv` wrapper element (body-sibling stacking context) instead of the inner pane root — previously had no effect on pane stacking

This release adds `usePaneRadioGrid`, improves input hook flexibility with `readonly`/`format` options, and fixes checkbox hit-target reliability and pane z-index stacking.
