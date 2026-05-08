---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New

- `usePaneRadioGrid(cell, values, options)` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials' radiogrid blade; deferred disposal + synchronous creation match the existing `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions.readonly` + `PaneInputOptions.format` — create readonly monitors with custom value formatters from React hooks

### Bug Fixes

- Checkbox hit target expanded to full `--cnt-usz` box size (`.tp-ckbv_i` `width`/`height` set explicitly) — fixes multi-click requirement in browsers where `<label>` click forwarding is unreliable under pointer-events/z-index combinations
- `createPane` z-index now applied to the `.tp-dfwv` wrapper element, not the inner pane root — fixes stacking against page overlays when no explicit container is provided

### Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active state parity; check stroke turns accent pink on `:checked`

Adds `usePaneRadioGrid` for compact scene/mode toggles, fixes checkbox hit targeting, and extends `PaneInputOptions` with `readonly` and `format` support for monitor inputs.
