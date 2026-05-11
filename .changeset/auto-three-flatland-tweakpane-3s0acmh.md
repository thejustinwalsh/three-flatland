---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `usePaneRadioGrid(pane, options)` (React subpath) — inline button-bar selector backed by `@tweakpane/plugin-essentials` radiogrid blade; active-state affordance, deferred disposal, synchronous creation matching `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions.readonly` — mark a monitor as read-only
- `PaneInputOptions.format` — formatter callback for readonly monitors

## Bug Fixes

- `createPane`: z-index now applied to `.tp-dfwv` wrapper (the body-sibling stacking context) instead of the inner pane root; previously had no visible effect against other overlays
- Checkbox hit target stretched to full `var(--cnt-usz)` box via `.tp-ckbv_i { width/height }`; eliminates reliance on flaky `<label>` → `<input>` click forwarding under some pointer-events/z-index combinations
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query; monitor-swap DPR changes now trigger canvas resize without a window dimension change
- Fullscreen enter/exit resize: listens to `document.fullscreenchange` in addition to `resize`; re-measures immediately and once in the next RAF to catch post-transition layout settle

## Theme

- Checkbox box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity
- Check stroke turns accent pink on `:checked`

Fixes three cross-cutting bugs (DPR desync on monitor swap, fullscreen-return wonky dimensions, multi-click checkboxes) and adds `usePaneRadioGrid` for inline mode/scene toggles.

