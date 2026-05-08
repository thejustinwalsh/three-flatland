---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the essentials radiogrid blade; active-state affordance reads better than a dropdown for mode toggles
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with custom formatters from the React hook

## Bug fixes

- Checkbox hit target: `.tp-ckbv_i` input stretched to full box size so clicks register directly on the input, eliminating flaky label-forwarding failures
- Checkbox theme: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent on `:checked`
- `z-index: 1000` applied to the `.tp-dfwv` wrapper element (not the inner pane root) so tweakpane stacks correctly above other overlays when no custom container is provided

`usePaneRadioGrid` and the `readonly`/`format` monitor options are additive; all existing hooks and pane setup are unaffected.
