---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; active-state affordance reads better than a dropdown for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` — lets React hook users create read-only monitor inputs with custom formatters

## Bug Fixes

- z-index now applied to `.tp-dfwv` wrapper element (the actual stacking context) instead of the inner `pane.element` — fixes tweakpane floating behind other overlays
- Checkbox hit target fixed: `.tp-ckbv_i` stretched to the full box size via `width/height: var(--cnt-usz)` — clicks land on the input directly without relying on flaky `<label>` forwarding
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query — monitor swaps that change DPR without changing pixel dimensions now trigger a canvas resize

## Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity
- Check stroke turns accent pink on `:checked`

## Summary

Adds `usePaneRadioGrid` and extends `PaneInputOptions` with `readonly`/`format` support. Fixes the pane stacking context, checkbox hit targets, and DPR tracking on monitor swap.
