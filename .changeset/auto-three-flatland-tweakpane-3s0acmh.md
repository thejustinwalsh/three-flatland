---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

- `usePaneRadioGrid` hook (react subpath): inline button-bar selector backed by Tweakpane essentials' radiogrid blade; deferred disposal + synchronous creation match `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` for readonly monitors with custom value formatters
- Checkbox theme: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` so clicks land on the input directly; background matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent on `:checked`
- `createPane` z-index fix: apply `z-index: 1000` to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root

Adds a radio-grid selector hook and readonly monitor support, and fixes checkbox hit-target and pane z-index stacking.

<!-- original commits: b90509fa, ce7740ac, 5a2e3631, fd4b7e67 -->

