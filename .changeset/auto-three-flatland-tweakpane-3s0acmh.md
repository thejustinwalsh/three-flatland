---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New hooks and options**

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by the essentials `radiogrid` blade; deferred disposal and synchronous creation match the `usePaneButton`/`usePaneInput` pattern
- `PaneInputOptions` gains `readonly` and `format` fields so hook users can create readonly monitors with custom formatters

**Theme fixes**

- Checkbox surface now matches other controls (`rgba(28,40,77,0.6)`) with hover/focus/active parity; check stroke turns accent pink on `:checked`
- Checkbox hit target expanded to full 20×20 box (`width/height: var(--cnt-usz)` on `.tp-ckbv_i`) — no longer relies on flaky label-forwarding

**Bug fixes**

- `z-index: 1000` now applied to the `.tp-dfwv` outer wrapper instead of the inner pane root, so the pane correctly stacks above other overlays when no custom container is provided

`usePaneRadioGrid` and `PaneInputOptions.readonly`/`format` are the primary user-facing additions; checkbox hit-target and z-index fixes eliminate interaction reliability issues across all uses of the pane.
