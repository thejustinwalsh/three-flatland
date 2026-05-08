---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New hooks and options**

- `usePaneRadioGrid` (react subpath) — inline button-bar selector backed by essentials' radiogrid blade; deferred disposal + synchronous creation mirror `usePaneButton` / `usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` — enables readonly monitors with custom formatters via the existing `usePaneInput` hook

**Bug fixes**

- Fix: `createPane` now applies `z-index: 1000` to the `.tp-dfwv` outer wrapper (the actual stacking-context element) instead of the inner `pane.element`, so the pane reliably overlays other content
- Fix: checkbox `.tp-ckbv_i` input stretched to full `var(--cnt-usz)` box — eliminates multi-click failures caused by flaky `<label>` → `<input>` click forwarding under certain pointer-events / z-index combinations

**Theme**

- Checkbox box surface updated to `rgba(28,40,77,0.6)` matching other controls; hover/focus/active parity added; check stroke turns accent pink on `:checked`

Adds `usePaneRadioGrid`, readonly monitor support, and fixes stacking and checkbox interaction reliability.
