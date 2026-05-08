---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Hooks

- `usePaneRadioGrid` (react subpath) — inline radio-button bar backed by `@tweakpane/plugin-essentials` radiogrid blade; deferred disposal and synchronous creation match the existing `usePaneButton`/`usePaneInput` pattern

## API Extensions

- `PaneInputOptions` extended with `readonly` and `format` — enables read-only monitors with custom value formatters in React hooks

## Bug Fixes

- Checkbox hit target: `.tp-ckbv_i` input now fills the full `var(--cnt-usz)` box; clicks land directly on the input without relying on flaky `<label>` forwarding across pointer-events/z-index combinations
- z-index applied to `.tp-dfwv` wrapper element (the actual body-level stacking context) instead of the inner pane root — tweakpane now correctly stacks above other overlays at z-index 1000

## Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

Fixes checkbox interaction reliability, corrects tweakpane stacking over other overlays, and adds a `usePaneRadioGrid` hook and monitor-formatter support to the React subpath.

