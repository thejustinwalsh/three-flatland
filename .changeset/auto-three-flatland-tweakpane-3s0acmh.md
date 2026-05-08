---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' `radiogrid` blade; active-state affordance, deferred disposal, synchronous creation matching existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters

## Bug Fixes

- `createPane`: z-index now applied to the `.tp-dfwv` wrapper element (body-sibling stacking context) instead of the inner pane root; previously had no effect on stacking against other overlays
- Checkbox hit area stretched to full box size via `width/height: var(--cnt-usz)` on `.tp-ckbv_i`; previously relied on flaky `<label>→<input>` click forwarding that required multiple clicks in some browser/pointer-events combinations
- Checkbox theme: box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`; default box was blending invisibly into the container

Adds `usePaneRadioGrid`, readonly monitor support, and fixes checkbox hit targets and z-index stacking for the tweakpane wrapper.
