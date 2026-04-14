---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

**New features**

- `usePaneRadioGrid` hook (react subpath): inline button-bar selector backed by Tweakpane essentials' `radiogrid` blade; active-state affordance reads better than a dropdown for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` for readonly monitors with custom value formatters
- `z-index: 1000` now applied to `.tp-dfwv` wrapper (the actual stacking context), fixing layering against other overlays

**Bug fixes**

- Checkbox hit target stretched to full control box (`width/height: var(--cnt-usz)`); clicks land directly on `<input>` without unreliable `<label>` forwarding
- Checkbox box surface unified with other controls (`rgba(28,40,77,0.6)`); check stroke turns accent pink on `:checked`
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `resolution` media query; canvas resizes correctly on monitor swap without dimension change
- `document.fullscreenchange` handled in addition to `resize`; double-measurement (immediate + next RAF) catches post-transition layout settle

Adds `usePaneRadioGrid`, `readonly`/`format` monitor options, and fixes checkbox hit target, DPR tracking, and fullscreen resize handling.
