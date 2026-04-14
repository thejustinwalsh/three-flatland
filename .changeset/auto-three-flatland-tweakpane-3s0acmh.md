---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

### `usePaneInput` — readonly monitors and custom formatters

- `PaneInputOptions.readonly` — renders the binding as a non-interactive monitor; value still updates when `setValue` is called
- `PaneInputOptions.format` — custom display formatter (e.g. `(v) => v.toFixed(2)`), forwarded to tweakpane's native `format` option

### `createPane` — z-index fix for default wrapper

- Fixed z-index application: tweakpane wraps `pane.element` in a `.tp-dfwv` body-sibling div that forms the actual stacking context; z-index is now applied to that wrapper (when it exists) so the pane correctly floats above full-viewport canvas overlays

Added `readonly` and `format` options to `usePaneInput`, and fixed `createPane` z-index so the pane reliably stacks above canvas elements in full-screen examples.
