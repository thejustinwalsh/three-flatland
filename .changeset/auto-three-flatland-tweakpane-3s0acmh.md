---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane essentials' radiogrid blade; deferred disposal + synchronous creation mirror `usePaneButton`/`usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — lets React hook users create readonly monitors with custom formatters
- Checkbox input stretched to full box size via `width/height: var(--cnt-usz)` — input now covers the entire visible hit target; no more label-forwarding flakiness
- Checkbox theme: box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

## Bug fixes

- `z-index: 1000` now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane element — fixes stacking against other overlays
- DPR re-sync after monitor swap / fullscreen: `useWindowSize` now tracks `dpr` via a `(resolution: Ndppx)` media query; canvas re-sizes on monitor swap without waiting for a window resize event
- Fullscreen-return layout: `document.fullscreenchange` listener re-measures immediately + once in the next RAF, catching post-transition layout settles

Tweakpane gains a radio-grid hook, readonly monitor support, and fixes for checkbox hit targets, z-index stacking, and DPR drift on monitor swap.

