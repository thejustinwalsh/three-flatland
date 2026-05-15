---
"@three-flatland/tweakpane": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

### New hooks and controls

**`usePaneRadioGrid` (new)**
- New `usePaneRadioGrid<T>` hook backed by Tweakpane Essentials `radiogrid` blade — renders an inline button-bar selector for scene/mode toggles
- Returns `[value, setValue]`; blade and React state stay in sync bidirectionally
- Accepts `cells`, `initialValue`, optional `groupName`, and explicit `size: [cols, rows]`
- Disposal deferred via `setTimeout(0)` to survive React strict-mode's synchronous cleanup/re-mount pair
- Exported from `@three-flatland/tweakpane/react` as `usePaneRadioGrid` + types `PaneRadioGridCell`, `PaneRadioGridOptions`

**`usePaneInput` additions**
- `readonly` option — renders the binding as a read-only monitor; value still updates via `setValue`
- `format` option — custom display formatter forwarded to Tweakpane's native `format` option (e.g. `(v) => v.toFixed(2)`)

### Bug fixes

**`createPane` z-index**
- `z-index: 1000` now also applied to the `.tp-dfwv` default-wrapper element (the actual body sibling); previously only the inner `pane.element` received it, making z-index a no-op against other full-viewport overlays

**Checkbox hit target and styling**
- Checkbox input stretched to cover its visible affordance (`--cnt-usz × --cnt-usz`) so clicks always register without relying on flaky label-forwarding
- Checkbox background, hover, focus, active, and checked states themed to match the rest of the Flatland control surface (accent stroke in pink on `:checked`)

`usePaneRadioGrid`, `readonly`/`format` input options, a z-index fix for panes behind full-viewport canvases, and a checkbox hit-target and styling overhaul.
