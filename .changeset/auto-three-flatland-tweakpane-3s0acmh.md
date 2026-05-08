---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New APIs**

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the Tweakpane Essentials `radiogrid` blade; deferred disposal + synchronous creation match the existing `usePaneButton` / `usePaneInput` pattern
- `PaneInputOptions` extended with `readonly` and `format` fields; allows `usePaneInput` callers to create read-only monitors with custom value formatters

**Bug fixes**

- Checkbox hit target stretched to fill the full 20×20px visible box via `width/height: var(--cnt-usz)` on `.tp-ckbv_i`; clicks now land on the input directly without relying on flaky `<label>` → `<input>` forwarding
- Checkbox box surface color updated to `rgba(28,40,77,0.6)` with hover / focus / active parity; check stroke turns accent pink on `:checked`; previously the box blended invisibly into the container
- `z-index: 1000` applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root element where it had no stacking effect
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query so monitor swaps that change `devicePixelRatio` without changing viewport dimensions trigger a canvas re-size
- `fullscreenchange` event added alongside `resize`; re-measures immediately and once more in the next RAF to catch post-transition layout settles

Adds the `usePaneRadioGrid` hook and read-only monitor support to `usePaneInput`, and fixes checkbox hit target, checkbox styling, pane stacking, and DPR / fullscreen tracking.
