---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Hooks & API

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by Tweakpane essentials' radiogrid blade; active-state affordance suits scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with custom formatters via `usePaneInput`

## Bug Fixes

- Checkbox hit target expanded to full 20×20 box size (`.tp-ckbv_i` stretched via `width/height: var(--cnt-usz)`); previously the hidden 13×13 `<input>` relied on flaky label-click forwarding
- `z-index: 1000` now applied to the `.tp-dfwv` wrapper element instead of the inner pane root; fixes stacking against overlays when no container is provided

## Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity
- Check stroke turns accent pink on `:checked`

---

This release adds `usePaneRadioGrid` for compact scene toggles, extends `usePaneInput` with readonly monitor support, and fixes checkbox hit-target and pane z-index stacking bugs.
