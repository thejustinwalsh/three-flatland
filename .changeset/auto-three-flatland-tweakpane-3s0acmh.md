---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

- `usePaneRadioGrid` hook (react subpath) — inline radio button-bar backed by Tweakpane Essentials `radiogrid` blade; deferred disposal + synchronous creation mirrors `usePaneButton` / `usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` fields for readonly monitor bindings with custom formatters
- Fix: `.tp-ckbv_i` checkbox input stretched to full box size (`width/height: var(--cnt-usz)`); clicks now land directly on the input, no label-forwarding required
- Fix: checkbox box surface styled to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent on `:checked`
- Fix: `z-index: 1000` applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root, so the pane correctly stacks above other overlays
- Migration: examples replaced Web Awesome controls with Tweakpane (`usePane`, `usePaneFolder`, `usePaneInput`, `useStatsMonitor`); all `@awesome.me/webawesome` imports and `wa-*` selectors removed

Minor enhancements to hook API and theme; no breaking changes.
