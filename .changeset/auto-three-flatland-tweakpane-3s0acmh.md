---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Changes

### New hooks

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; active-state affordance for scene/mode toggles; deferred disposal mirrors `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` so React hook users can create readonly monitors with custom formatters

### Bug fixes

- Checkbox hit target: `.tp-ckbv_i` now sized to full `var(--cnt-usz)` box; clicks land on input directly, no flaky `<label>` forwarding
- `z-index: 1000` applied to `.tp-dfwv` wrapper (body-level stacking context) instead of the inner pane element, fixing overlay ordering against other page elements
- DPR + fullscreen tracking: examples re-sync canvas pixel ratio on monitor swap and fullscreen transitions via `(resolution: Ndppx)` media query and `document.fullscreenchange`

### Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

### Migration

- Both slug-text examples (React + Three) migrated from Web Awesome (`@awesome.me/webawesome`) to `@three-flatland/tweakpane`; all `wa-*` selectors, CSS, and `useWrappingGroup`/`setupWrappingGroup` helpers removed
- Stats monitor wired via `useStatsMonitor` (React) and `stats.begin()`/`stats.end()` (Three); readonly tweakpane monitors replace the status div

`@three-flatland/tweakpane` gains a radio-grid hook, readonly monitor support, and corrected checkbox hit targeting and z-index stacking.

