---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## What's New

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane essentials' radiogrid blade; deferred disposal + synchronous creation match `usePaneButton` / `usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with custom formatters from the React hooks
- `createPane` applies `z-index: 1000` to the `.tp-dfwv` body-sibling wrapper (not the inner `pane.element`), ensuring the pane stacks correctly above other overlays
- Checkbox CSS fix: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box via explicit `width` / `height` — click now lands on the input directly, eliminating multi-click flakiness from `<label>` forwarding
- Checkbox theme: box surface `rgba(28,40,77,0.6)` with hover / focus / active parity; check stroke turns accent pink on `:checked`

## Bug fixes

- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query — monitor-swap DPR changes that don't alter viewport dimensions are no longer missed
- `createPane` z-index applied to `.tp-dfwv` wrapper, not the inner root — was previously inert against other positioned overlays

Adds `usePaneRadioGrid` for scene / mode toggles, extends `PaneInputOptions` with monitor formatting, and fixes checkbox hit-target and stacking-context bugs.
