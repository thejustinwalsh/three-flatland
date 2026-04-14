---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials' radiogrid blade; active-state affordance, deferred disposal + synchronous creation matching existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitor inputs with custom value formatters

## Bug Fixes

- `createPane`: z-index applied to `.tp-dfwv` wrapper element instead of inner pane root — fixes tweakpane not stacking above other overlays when no custom container is provided
- Checkbox hit target stretched to full box size via `width/height: var(--cnt-usz)` on `.tp-ckbv_i` — eliminates missed clicks caused by browser label-forwarding quirks
- `useWindowSize` hook now tracks `{ w, h, dpr }` and subscribes to a `resolution: Ndppx` media query — fixes Canvas2D overlay desyncing from the WebGPU canvas on monitor swaps that change DPR without changing viewport dimensions
- Fullscreen enter/exit re-measures immediately and once more in the next RAF via `document.fullscreenchange` listener — fixes stale `innerWidth/innerHeight` on fullscreen return
- Checkbox surface and hover/focus/active states aligned with other controls; check stroke turns accent color on `:checked`

Adds `usePaneRadioGrid`, monitor/format support, and fixes z-index stacking, checkbox interaction, and DPR/fullscreen tracking.

