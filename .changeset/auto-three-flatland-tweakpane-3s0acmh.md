---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Changelog

### New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the Tweakpane essentials `radiogrid` blade; deferred disposal and synchronous creation match the `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` fields so React hook users can create read-only monitors with custom formatters

### Bug fixes

- Fix: z-index applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root; the pane now correctly stacks above overlays when no container is provided
- Fix: `.tp-ckbv_i` checkbox input stretched to full box size via `width/height: var(--cnt-usz)`; clicks land on the input directly without requiring label-forwarding, fixing multi-click behavior across browser/pointer-events combinations
- Fix: `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query; monitor swaps that change DPR without changing dimensions now trigger canvas resizing
- Fix: fullscreen-change listener added alongside the resize listener; canvas re-measures immediately and once more in the next RAF to catch post-transition layout settles
- Theme: checkbox box surface updated to `rgba(28,40,77,0.6)` with hover/focus/active parity matching other controls; check stroke turns accent pink on `:checked`

This release adds the `usePaneRadioGrid` hook, read-only monitor support, and fixes z-index stacking, checkbox hit targets, and DPR/fullscreen tracking.

