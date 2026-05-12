---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by Tweakpane Essentials `radiogrid` blade; deferred disposal and synchronous creation match `usePaneButton`/`usePaneInput` patterns
- `PaneInputOptions` extended with `readonly` and `format` — enables read-only monitor bindings with custom formatters from React hooks

## Bug fixes

- Checkbox hit target stretched to full `--cnt-usz` box size; `input` now covers the visible checkbox directly so label-forwarding workarounds are no longer needed
- `createPane` z-index now applied to `.tp-dfwv` wrapper (the actual body-sibling stacking context) rather than the inner pane root element — pane now stacks correctly above other overlays
- Checkbox box surface and hover/focus/active styling aligned with other controls (`rgba(28,40,77,0.6)` background, accent-pink check stroke on `:checked`)

`@three-flatland/tweakpane` gains readonly monitor support and a radio-grid hook for inline scene/mode toggles, with three visual and hit-testing fixes for checkboxes and pane layering.
