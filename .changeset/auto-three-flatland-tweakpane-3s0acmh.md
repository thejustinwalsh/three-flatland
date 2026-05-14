---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; active-state affordance; deferred disposal and synchronous creation match existing `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions.readonly` + `PaneInputOptions.format` — create readonly monitors with custom formatters from React hooks

## Fixes

- `z-index: 1000` applied to `.tp-dfwv` wrapper (the body-sibling stacking context) instead of the inner pane root — fixes tweakpane not stacking above other overlays
- Checkbox hit target: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box size — fixes multi-click required in some browser/pointer-events combinations
- Checkbox theme: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

Adds `usePaneRadioGrid` for inline mode-selector controls, extends `PaneInputOptions` with `readonly` and `format` support, and fixes checkbox theming and hit-target reliability.
