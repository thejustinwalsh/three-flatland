---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` React hook — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; active-state affordance reads better than a dropdown for scene/mode toggles
- `PaneInputOptions` extended with `readonly` and `format` fields; enables readonly monitors with custom formatters in React hooks

## Bug fixes

- Checkbox hit target expanded to full box size (`width/height: var(--cnt-usz)`); fixes multi-click required due to browser pointer-event forwarding failures
- `z-index: 1000` now applied to the `.tp-dfwv` body-sibling wrapper instead of the inner pane root; fixes tweakpane stacking against other overlays
- Checkbox theme updated: box surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`

## Examples

- Both `slug-text` examples migrated from Web Awesome (`@awesome.me/webawesome`) to `@three-flatland/tweakpane`
- Stats monitor and Settings + Mode pane folders added to both React and Three examples
- Overlay z-indexes lowered (1–4); computing spinner moved top-right → top-left to avoid fighting tweakpane corner

Both examples maintain 1:1 feature parity; all public API changes are additive.

---
