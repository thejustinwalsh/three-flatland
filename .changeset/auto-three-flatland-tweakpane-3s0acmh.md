---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane essentials' `radiogrid` blade; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` so React hook users can create readonly monitors with custom formatters
- `createPane`: `z-index: 1000` now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root, fixing stacking against other overlays

## Bug fixes

- Checkbox hit area: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box size so clicks land directly on the input without relying on flaky `<label>` forwarding
- Checkbox theme: box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so monitor swaps (DPR change without dimension change) trigger canvas re-size

---

Adds `usePaneRadioGrid`, `readonly`/`format` monitor support, and fixes checkbox visibility and DPR tracking for multi-monitor setups.

