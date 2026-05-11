---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New hooks and options**

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the `@tweakpane/plugin-essentials` radiogrid blade; active-state affordance reads better than a dropdown for scene/mode toggles; deferred disposal + synchronous creation match existing hook patterns
- `PaneInputOptions` extended with `readonly` and `format` — allows React hook users to create readonly monitors with custom formatters

**Bug fixes**

- `createPane` z-index applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root; the previous `pane.element` target had no effect on stacking against other overlays
- Checkbox hit target expanded: `.tp-ckbv_i` now fills the full `var(--cnt-usz)` box; eliminates multi-click failures caused by flaky `<label>` → `<input>` forwarding under certain pointer-events / z-index combinations
- Checkbox theme updated: box surface matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

**Migration from Web Awesome**

- Both the Three.js and React slug-text examples migrated from `@awesome.me/webawesome` to `@three-flatland/tweakpane`; all Web Awesome imports, CSS, and `wa-*` selectors removed
- Settings and Mode tweakpane folders (collapsed by default) replace the previous status div and checkbox UX; readonly monitors provide the same status information

Adds `usePaneRadioGrid`, fixes checkbox hit-target and z-index stacking, and extends `PaneInputOptions` with `readonly` / `format` for monitor support.

