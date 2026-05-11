---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New hooks

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; active-state affordance reads better than a dropdown for scene/mode toggles; deferred disposal + synchronous creation match existing `usePaneButton`/`usePaneInput` pattern

## Hook options

- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with formatters in `usePaneInput`

## Theme fixes

- Checkbox box surface changed to `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke turns accent pink on `:checked` — previously the box blended into the container and was nearly invisible
- `.tp-ckbv_i` (hidden checkbox input) stretched to full `var(--cnt-usz)` box — removes reliance on flaky `<label>` click-forwarding; clicks now land on the input directly

## z-index fix

- `createPane` applies `z-index: 1000` to the outer `.tp-dfwv` wrapper instead of the inner pane root — previously had no effect on stacking against overlays

The tweakpane package adds a radio-grid hook, readonly monitor support, and fixes checkbox hit-target reliability and pane stacking order.
