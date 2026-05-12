---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; deferred disposal + synchronous creation match the existing hook pattern
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitor inputs with custom formatters

## Bug fixes

- Checkbox hit target: `.tp-ckbv_i` stretched to full 20×20 box size via `width/height: var(--cnt-usz)`; the hidden input now covers the entire visible area, eliminating multi-click behavior from failed label forwarding
- Checkbox theme: background now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `z-index: 1000` applied to the `.tp-dfwv` body-sibling wrapper (not the inner pane root); previously setting z-index on the inner element had no effect on stacking against other overlays

## Examples migration

- Both slug-text examples (Three.js + React) migrated from Web Awesome controls to `@three-flatland/tweakpane`; all `@awesome.me/webawesome` imports, CSS, and `wa-*` selectors removed

`@three-flatland/tweakpane` gains a radio-grid hook, readonly monitor support, and corrects checkbox hit-target and z-index stacking bugs.

