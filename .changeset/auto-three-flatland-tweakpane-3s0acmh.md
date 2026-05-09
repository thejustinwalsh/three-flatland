---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Hooks

- `usePaneRadioGrid` hook (`react` subpath) — inline button-bar selector backed by essentials' `radiogrid` blade; active-state affordance reads better than a dropdown for scene/mode toggles; deferred disposal + synchronous creation match the existing `usePaneButton`/`usePaneInput` pattern

## API Additions

- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with formatters from the React hook
- `SlugOutlineOptions.color` accepts `number | string | Color` — tweakpane emits CSS hex strings; `Color.set()` parses them natively

## Bug Fixes

- Checkbox hit target: `.tp-ckbv_i` stretched to full box size via `width/height: var(--cnt-usz)`; clicks now land on the input directly, removing flaky label-forwarding under pointer-events/z-index combinations
- `createPane` now applies `z-index: 1000` to the `.tp-dfwv` body-sibling wrapper (was incorrectly applied to the inner pane root, which had no effect on stacking context)
- DPR tracking: `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query; monitor swaps no longer leave the canvas at the old pixel ratio
- Fullscreen state: listens to `document.fullscreenchange` in addition to `resize`; re-measures immediately + once in the next RAF to catch post-transition layout settles

## Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity
- Check stroke turns accent pink on `:checked`
- Previously the default tweakpane checkbox blended into the container background, making the hit target essentially invisible

## Migration from Web Awesome

- Both slug-text examples (React + Three) migrated from `@awesome.me/webawesome` to `@three-flatland/tweakpane`; all `wa-*` selectors, CSS imports, and `useWrappingGroup`/`setupWrappingGroup` helpers removed
- Readonly tweakpane monitors replace the status `<div>` element

`@three-flatland/tweakpane` ships `usePaneRadioGrid`, extended `PaneInputOptions`, a corrected z-index for the pane wrapper, and theme fixes that make checkboxes reliably clickable.
