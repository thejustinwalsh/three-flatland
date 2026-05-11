---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (React subpath) — inline button-bar selector backed by the tweakpane essentials `radiogrid` blade; reads better than a dropdown for scene/mode toggles; follows the same deferred-disposal + synchronous-creation pattern as `usePaneButton`/`usePaneInput`
- `PaneInputOptions.readonly` and `PaneInputOptions.format` — create readonly monitor bindings with custom formatters from `usePaneInput`

## Bug Fixes

- `createPane` now applies `z-index: 1000` to the `.tp-dfwv` wrapper element (the body-sibling stacking context) instead of the inner pane root, so the pane reliably floats above other overlays
- Checkbox hit target stretched to the full visible box size (`width/height: var(--cnt-usz)` on `.tp-ckbv_i`); clicks now land on the input directly instead of relying on flaky `<label>`→`<input>` forwarding under certain pointer-event/z-index combinations

## Theme

- Checkbox box surface color now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

Adds `usePaneRadioGrid`, readonly monitor support, and two reliability fixes (z-index stacking, checkbox hit target).
