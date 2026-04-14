---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## `@three-flatland/tweakpane` changes

### New features
- `PaneInputOptions` extended with `readonly` and `format` fields; `usePaneInput` now supports readonly monitor bindings with custom value formatters

### Bug fixes
- Fixed pane z-index: z-index is now applied to the `.tp-dfwv` wrapper element (the body-sibling stacking context) rather than the inner pane root, ensuring the pane stacks correctly above page overlays

Adds readonly monitor support with formatters to `usePaneInput`, and fixes the pane wrapper z-index so it correctly overlays other page elements.
