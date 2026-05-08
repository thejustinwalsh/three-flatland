---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; active-state affordance; deferred disposal + synchronous creation matching existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — create read-only monitors with custom value formatters

## Bug Fixes

- Checkbox hit target expanded to fill the full 20×20 box — `.tp-ckbv_i` now sets `width`/`height` to `var(--cnt-usz)` so clicks land on the input directly without relying on flaky `<label>` forwarding
- Checkbox surface color, hover/focus/active states, and checked stroke now match other controls (`rgba(28,40,77,0.6)` box, accent-pink check on `:checked`)
- `z-index: 1000` now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane element, correctly stacking the pane above other overlays

Adds a radio-grid hook and read-only monitor support, and fixes checkbox hit-target and z-index stacking bugs.

