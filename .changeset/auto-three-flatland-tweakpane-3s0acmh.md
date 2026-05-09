---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (react subpath): inline button-bar selector backed by `@tweakpane/plugin-essentials` radiogrid blade; deferred disposal mirrors `usePaneButton` / `usePaneInput` pattern
- `PaneInputOptions`: new `readonly` and `format` fields for creating readonly monitors with custom formatters
- z-index 1000 now applied to the `.tp-dfwv` body-sibling wrapper (was incorrectly targeting the inner pane root with no effect on stacking)

## Fixes

- Checkbox hit target expanded to full 20×20 box — `.tp-ckbv_i` now gets explicit `width/height: var(--cnt-usz)`, so clicks land on the input directly without relying on flaky `<label>` forwarding
- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke uses accent color on `:checked`

## Example updates

- `slug-text` examples (React + Three) migrated from Web Awesome to `@three-flatland/tweakpane`
- Unified Settings + Mode folders with `usePane` / `usePaneFolder` / `usePaneInput`; stats monitor via `useStatsMonitor`
- All `wa-*` selectors, `@awesome.me/webawesome` imports, and `useWrappingGroup` helpers removed

`@three-flatland/tweakpane` adds a radiogrid hook and monitor formatter support, fixes the checkbox hit target, and correctly applies z-index to the tweakpane wrapper element.

