---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59


## New APIs

- `usePaneRadioGrid(pane, options)` (react subpath) — inline button-bar selector backed by the essentials `radiogrid` blade; active-state affordance and deferred disposal matching `usePaneButton` / `usePaneInput`
- `PaneInputOptions.readonly` + `PaneInputOptions.format` — create readonly monitors with custom formatters from the React hook

## Bug Fixes

- Checkbox hit target: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box so clicks land on the input directly, eliminating flaky label-forwarding failures on some browsers
- `z-index: 1000` applied to `.tp-dfwv` wrapper (the body-sibling stacking context) instead of the inner pane element; previously the pane could render behind other overlays with lower declared z-indexes
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so monitor swaps update DPR without requiring a window resize event
- Fullscreen enter/exit: `document.fullscreenchange` listener added; re-measures immediately and again in the next RAF to catch post-transition layout settles
- Checkbox box surface (`rgba(28,40,77,0.6)`) and check stroke (accent pink on `:checked`) now match other controls; previously the default box blended invisibly with the container background

Adds `usePaneRadioGrid`, `readonly`/`format` monitor support, and fixes checkbox hit-target reliability, z-index stacking, and DPR sync on monitor swap and fullscreen transitions.
