---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; deferred disposal + synchronous creation match `usePaneButton`/`usePaneInput` patterns
- `PaneInputOptions` extended with `readonly` and `format` fields — enables readonly monitors with value formatters
- Checkbox CSS: `.tp-ckbv_i` stretched to full `var(--cnt-usz)` box — click lands on the input directly, no label forwarding required; box surface themed `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke turns accent pink on `:checked`

## Fixes

- `z-index: 1000` applied to `.tp-dfwv` wrapper element instead of the inner pane root — pane now correctly stacks above other overlays
- Checkbox hit target covers the full 20×20 visible area; previously relied on flaky `<label>` → `<input>` click forwarding

## Refactor

- Both slug-text examples (React + Three) migrated from Web Awesome controls to `@three-flatland/tweakpane`; Settings + Mode folders with identical parameter bindings in each example

The tweakpane package gains a radio-grid hook, read-only monitor support, and corrected stacking and checkbox hit-target behavior.

