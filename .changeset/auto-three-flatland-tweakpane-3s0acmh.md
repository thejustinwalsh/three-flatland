---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by tweakpane essentials `radiogrid` blade; active-state affordance, deferred disposal pattern matching `usePaneButton`/`usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — create read-only monitors with custom value formatters via `usePaneInput`

### Bug fixes

- z-index now applied to the `.tp-dfwv` wrapper element (not the inner pane root) so the panel stacks correctly above other page overlays
- Checkbox hit target stretched to full control box size (`--cnt-usz` width/height); eliminates flaky pointer-events label-forwarding click failures
- Checkbox surface styled to match other controls (rgba background, hover/focus/active states); check stroke turns accent color on `:checked`

Adds `usePaneRadioGrid` for inline radio selection and extends `usePaneInput` with `readonly`/`format` options; fixes checkbox hit-target sizing and z-index stacking.
