---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the Tweakpane Essentials `radiogrid` blade; deferred disposal and synchronous creation mirror `usePaneButton` / `usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — allows creating readonly monitors with value formatters

## Bug Fixes

- Fixed checkbox requiring multiple clicks: `.tp-ckbv_i` now stretches to `width/height: var(--cnt-usz)` so clicks land directly on the input instead of relying on flaky `<label>` forwarding
- Fixed `useWindowSize` not re-running on monitor swap: hook now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so DPR changes trigger canvas re-sizing
- Fixed fullscreen-return leaving stale viewport dimensions: `document.fullscreenchange` listener re-measures immediately and once more in the next RAF to catch post-transition layout settles
- Fixed `z-index` not applying when no container is provided: z-index is now set on the `.tp-dfwv` wrapper element instead of the inner pane root

## Theme

- Checkbox box surface updated to `rgba(28,40,77,0.6)` with hover/focus/active state parity matching other controls; check stroke turns accent pink on `:checked`

---

Fixes DPR + fullscreen tracking, resolves flaky checkbox hit targets, adds `usePaneRadioGrid` for scene/mode toggles, and extends `PaneInputOptions` with `readonly` and `format`.
