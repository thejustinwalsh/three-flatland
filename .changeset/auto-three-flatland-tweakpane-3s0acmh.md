---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the essentials `radiogrid` blade; deferred disposal and synchronous creation match the existing `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` gains `readonly` and `format` fields so React hook users can create read-only monitors with custom formatters
- `z-index: 1000` now applied to the `.tp-dfwv` body-sibling wrapper (the real stacking context) rather than the inner pane root; pane now reliably layers above other overlays

### Bug fixes

- Checkbox `<input>` stretched to full `var(--cnt-usz)` box size — clicks land on the input directly, eliminating flaky label-forwarding in certain pointer-events/z-index combinations
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query; DPR desync after monitor swaps is fixed
- `fullscreenchange` event added alongside `resize` — re-measures immediately and once more in the next RAF to catch post-transition viewport settles

### Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity
- Check stroke turns accent pink on `:checked`; previously the hit target blended into the container background

Adds `usePaneRadioGrid`, fixes checkbox hit-target and DPR tracking, and corrects pane z-index stacking.
