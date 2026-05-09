---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## What's new in `@three-flatland/tweakpane`

### New hooks

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by tweakpane-plugin-essentials `radiogrid` blade; active-state affordance without a dropdown; deferred disposal + synchronous creation match the existing `usePaneButton`/`usePaneInput` pattern

### Extended API

- `PaneInputOptions` extended with `readonly` and `format` fields so React hook users can create readonly monitors with custom value formatters

### Bug fixes

- `createPane`: `z-index: 1000` now applied to the outer `.tp-dfwv` wrapper element instead of the inner `pane.element`; fixes tweakpane appearing behind other overlays when no container is provided
- Checkbox hit target expanded: `.tp-ckbv_i` stretched to `width/height: var(--cnt-usz)` so clicks land directly on the input rather than relying on flaky `<label>` forwarding under complex pointer-events/z-index stacks

### Theme

- Checkbox box surface color set to `rgba(28,40,77,0.6)` with hover/focus/active parity matching other controls; check stroke turns accent pink on `:checked`

Adds a `usePaneRadioGrid` hook, readonly monitor support, a z-index stacking fix, and a checkbox hit-target and theme fix.
