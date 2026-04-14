---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## Changes

- `PaneInputOptions`: added `readonly` and `format` fields so `usePaneInput` can create read-only monitors with custom value formatters
- `createPane`: fixed z-index stacking — `1000` is now applied to the `.tp-dfwv` wrapper element that tweakpane creates as a body sibling, not just the inner pane root; previously the z-index had no effect when competing with full-viewport overlays

`usePaneInput` now supports monitor-style bindings; the pane wrapper correctly floats above full-viewport canvas elements in both plain Three.js and R3F setups.
