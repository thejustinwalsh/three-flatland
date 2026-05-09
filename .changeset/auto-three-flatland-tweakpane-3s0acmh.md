---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (React `/react` subpath): inline button-bar selector backed by `@tweakpane/plugin-essentials` radiogrid blade; deferred disposal + synchronous creation match `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` fields so React hook users can create readonly monitors with custom formatters

## Bug fixes

- Checkbox hit target: `.tp-ckbv_i` now sized to the full `var(--cnt-usz)` box, removing reliance on flaky `<label>`→`<input>` click-forwarding
- Checkbox theme: surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `z-index: 1000` applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root, so the panel correctly stacks above overlays

`@three-flatland/tweakpane` adds a radio-grid hook and readonly monitor support, and fixes checkbox visibility and stacking in overlay-heavy layouts.
