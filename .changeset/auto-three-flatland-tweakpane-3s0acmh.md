---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### Fixes

- **Checkbox hit target** — stretched `.tp-ckbv_i` to the full box size (`width/height: var(--cnt-usz)`); clicks now land on the input directly rather than relying on flaky label-forwarding under certain pointer-events/z-index combinations
- **z-index** — `z-index: 1000` now applied to the `.tp-dfwv` body-level wrapper instead of the inner pane root, so the pane correctly stacks above other page overlays

### New

- **`usePaneRadioGrid` hook** (React subpath) — inline button-bar selector backed by the tweakpane-plugin-essentials `radiogrid` blade; deferred disposal and synchronous creation mirror the existing `usePaneButton`/`usePaneInput` pattern
- **`PaneInputOptions.readonly` + `format`** — React hook users can now create read-only monitors with custom value formatters

### Theme

- Checkbox box surface updated to match other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

`@three-flatland/tweakpane` controls are now a complete drop-in replacement for Web Awesome controls in both Three.js and React examples.
