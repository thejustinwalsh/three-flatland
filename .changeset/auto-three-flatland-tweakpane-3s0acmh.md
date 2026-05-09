---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; deferred disposal + synchronous creation match `usePaneButton` / `usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom value formatters in React hooks

## Fixes

- Checkbox hit target expanded to full control box size (`.tp-ckbv_i` set to `var(--cnt-usz)`) — eliminates multi-click failure caused by browser label-forwarding for the hidden `<input>` element
- Checkbox surface theme updated to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke now uses accent color on `:checked`
- `z-index: 1000` now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane element, where it had no stacking-context effect

New `usePaneRadioGrid` hook and monitor formatter support round out the React API surface; checkbox and z-index fixes resolve persistent UX regressions.
