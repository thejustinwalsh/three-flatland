---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

**New features**

- `usePaneRadioGrid` React hook (`three-flatland/tweakpane/react`) backed by the essentials radiogrid blade — inline button-bar selector with active-state affordance, suited for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` fields, allowing readonly monitors with custom value formatters

**Bug fixes**

- `createPane` now applies `z-index: 1000` to the `.tp-dfwv` wrapper element (the actual stacking context) instead of the inner `pane.element`, fixing pane rendering behind other overlays

Added `usePaneRadioGrid` hook and readonly monitor support; fixed pane stacking context so the panel consistently renders above page overlays.
