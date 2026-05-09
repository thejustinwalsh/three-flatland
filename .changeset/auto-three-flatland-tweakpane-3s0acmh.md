---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New features**

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane essentials' radiogrid blade; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` gains `readonly` and `format` fields so React hook users can create readonly monitors with value formatters

**Bug fixes**

- Checkbox hit target expanded to full `var(--cnt-usz)` box size; the native `<input>` now covers the entire visible area so clicks land directly without relying on flaky `<label>` click-forwarding
- Checkbox surface styled to match other controls: `rgba(28,40,77,0.6)` background with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `createPane` z-index applied to `.tp-dfwv` wrapper element (the body-sibling stacking context) rather than the inner pane root, so the pane correctly stacks above other overlays

**DPR / fullscreen tracking (examples)**

- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so monitor swaps that change DPR without changing dimensions trigger a canvas resize
- `document.fullscreenchange` listener added alongside `resize`; re-measures immediately + once in the next RAF to catch post-transition layout settle

Adds `usePaneRadioGrid`, readonly monitor support, and fixes checkbox hit-target and z-index stacking.

