---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Changelog

### New hooks & API

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the Tweakpane Essentials `radiogrid` blade; active-state affordance suited for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` — allows creating readonly monitors with custom formatters via the existing `usePaneInput` hook

### Bug fixes

- `createPane`: z-index applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root — previously `pane.element` z-index had no effect on stacking against overlays
- Checkbox hit target: `.tp-ckbv_i` input stretched to full `var(--cnt-usz)` box so clicks land directly on the input without relying on flaky `<label>` forwarding
- DPR tracking in examples: `useWindowSize` now tracks `{ w, h, dpr }` with a `(resolution: Ndppx)` media query subscription so monitor swaps trigger canvas resize; `CompareCanvas` reads `windowSize.dpr` instead of `window.devicePixelRatio`
- Fullscreen-exit state: `document.fullscreenchange` listener added alongside `resize`; re-measures immediately and once more in the next RAF to catch post-transition layout settles
- R3F `DprSync` component calls `gl.setPixelRatio` on DPR change so the WebGPU canvas stays sharp after monitor swaps and fullscreen transitions

### Theme

- Checkbox surface color updated to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity
- Check stroke turns accent pink on `:checked`
- All slug-text example controls migrated from Web Awesome (`@awesome.me/webawesome`) to Tweakpane; `wa-*` selectors and `useWrappingGroup` / `setupWrappingGroup` helpers removed

Adds `usePaneRadioGrid`, fixes checkbox hit target and z-index stacking, and improves DPR/fullscreen sync in examples.

