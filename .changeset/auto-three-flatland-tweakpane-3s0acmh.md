---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by tweakpane-plugin-essentials `radiogrid` blade; active-state affordance, deferred disposal mirrors `usePaneButton`/`usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — create readonly monitors with custom formatters from any `usePaneInput` call
- `createPane` z-index: applies `z-index: 1000` to the `.tp-dfwv` body-sibling wrapper instead of the inner pane element (was silently no-op)

## Bug Fixes

- Checkbox hit target expanded to full box via `width/height: var(--cnt-usz)` on `.tp-ckbv_i`; eliminates missed clicks caused by flaky label-forwarding under pointer-events/z-index combinations
- Checkbox surface color changed to `rgba(28,40,77,0.6)` with hover/focus/active state parity; check stroke turns accent pink on `:checked`

Adds `usePaneRadioGrid`, readonly monitor support via `PaneInputOptions`, and fixes checkbox interactivity and pane z-index stacking.
