---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the tweakpane-essentials radiogrid blade; deferred disposal and synchronous creation match `usePaneButton`/`usePaneInput` conventions
- `PaneInputOptions` extended with `readonly` and `format` fields, enabling read-only monitors with custom formatters via the existing `usePaneInput` hook

## Fixed

- `createPane` z-index now applied to the `.tp-dfwv` wrapper element (not the inner pane root) so the pane correctly stacks above other overlays
- Checkbox hit target stretched to the full 20×20 visible box via `width/height: var(--cnt-usz)` — eliminates multi-click failures caused by flaky `<label>`→`<input>` forwarding
- Checkbox surface color updated to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink when checked
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so monitor swaps that change DPR without resizing the viewport are correctly detected

Adds `usePaneRadioGrid` and read-only monitor support; fixes pane z-index stacking, checkbox reliability, and DPR tracking on monitor swap.
