---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New features**
- `usePaneRadioGrid` hook (react subpath): inline button-bar selector backed by the Tweakpane essentials `radiogrid` blade; active-state affordance, deferred disposal, synchronous creation matching `usePaneButton`/`usePaneInput`
- `PaneInputOptions`: `readonly` + `format` fields so React hook users can create readonly monitors with custom formatters

**Bug fixes**
- Checkbox hit target expanded to full box size (`width/height: var(--cnt-usz)`) — browser-default 13×13px input at top-left of the label caused missed clicks under pointer-events/z-index combinations
- Checkbox theme: box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- `createPane` z-index now applied to `.tp-dfwv` wrapper element (setting it on the inner pane root had no effect on stacking)

**Example migration (slug-text)**
- Replaced Web Awesome controls with Tweakpane in both React and Three slug-text examples
- `usePane` / `usePaneFolder` / `usePaneInput` / `useStatsMonitor` in React; `createPane` with stats in Three
- Dropped all `@awesome.me/webawesome` imports, CSS, and `wa-*` selectors
- Computing spinner moved top-right → top-left; overlay z-indexes lowered to 1–4

Adds `usePaneRadioGrid` and monitor formatter support; fixes checkbox reliability and z-index stacking for the default floating pane.

