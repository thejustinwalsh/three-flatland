---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (React `/react` subpath) — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; deferred disposal + synchronous creation match existing `usePaneButton` / `usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` fields — enables readonly monitors with custom formatters via the React hooks

## Bug fixes

- `.tp-ckbv_i` (checkbox hidden input) stretched to full `--cnt-usz` box size — previously sized at browser-default ~13×13px, causing multi-click failures due to unreliable `<label>` click forwarding under certain pointer-events / z-index combinations
- `z-index: 1000` now applied to the `.tp-dfwv` wrapper (the body-sibling stacking context) instead of the inner pane root element — fixes Tweakpane failing to stack above overlays when no container is provided
- DPR + fullscreen resync: subscribes to `(resolution: Ndppx)` media query and `document.fullscreenchange` in addition to `resize` so monitor swaps and fullscreen transitions update the canvas immediately; `window.devicePixelRatio` is no longer read stale inside resize effects

## Theme

- Checkbox box surface matches other controls — `rgba(28,40,77,0.6)` fill with hover / focus / active parity; check stroke turns accent pink on `:checked`; removes the near-invisible default Tweakpane checkbox appearance

Fixes checkbox usability, Tweakpane stacking, and DPR desync; adds `usePaneRadioGrid` hook and monitor-formatter support.
