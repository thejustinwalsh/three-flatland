---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59


## New features

- `usePaneRadioGrid` hook (react subpath) backed by `@tweakpane/plugin-essentials` radiogrid blade; inline button-bar selector with active-state affordance, deferred disposal and synchronous creation matching existing hook patterns
- `PaneInputOptions.readonly` and `format` fields so React hook users can create readonly monitors with custom formatters
- Tweakpane wrapper z-index: `createPane` now applies `z-index: 1000` to the `.tp-dfwv` body-sibling wrapper instead of the inner pane element, so the pane stacks correctly above overlays

## Bug fixes

- Checkbox hit target: `.tp-ckbv_i` stretched to fill the full 20×20 box via `width/height: var(--cnt-usz)`, so clicks land on the input directly without relying on flaky `<label>` forwarding under pointer-events / z-index combinations
- Checkbox theme: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

---

Adds a radio-grid hook for inline button-bar selections, fixes the checkbox hit target and theme, and corrects the pane wrapper z-index stacking.
