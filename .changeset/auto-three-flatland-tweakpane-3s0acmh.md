---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59


## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar radio selector backed by essentials' radiogrid blade; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — create read-only monitors with custom value formatters

## Bug Fixes

- `z-index: 1000` now applied to the `.tp-dfwv` wrapper (the actual body-sibling stacking context) instead of the inner pane root element — fixes tweakpane rendering behind other overlays
- Checkbox `<input>` stretched to fill the full visible box (`width/height: var(--cnt-usz)`) — clicks land directly on the input; no longer relies on flaky `<label>` forwarding
- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

Adds a radio-grid hook for scene/mode toggles and resolves checkbox hit-target and z-index stacking issues.
