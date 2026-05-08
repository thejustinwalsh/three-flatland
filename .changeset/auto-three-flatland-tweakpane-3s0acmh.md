---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials' radiogrid blade; deferred disposal and synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitor bindings with custom value formatters

### Bug fixes

- Checkbox hit target: `.tp-ckbv_i` stretched to full box size via `width/height: var(--cnt-usz)` — clicks now land on the input directly, eliminating flaky label-forwarding under certain pointer-events/z-index combinations
- Checkbox box surface now matches other controls visually (`rgba(28,40,77,0.6)` with hover/focus/active parity); check stroke turns accent color on `:checked`
- `z-index: 1000` applied to `.tp-dfwv` wrapper (not inner pane root) — fixes stacking against overlays when no explicit container is provided

Adds `usePaneRadioGrid` for compact scene/mode toggles, extends input options with monitor support, and fixes checkbox hit targets and pane z-index stacking.
