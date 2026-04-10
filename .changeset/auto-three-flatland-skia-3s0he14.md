---
"@three-flatland/skia": patch
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## Changes

### Bug fixes

- `useSkiaContext` now calls `useThree` unconditionally before any early returns, fixing a rules-of-hooks violation that surfaced in React strict mode and the linter
- WASM test fixture now loads from `dist/<name>/<name>.wasm` (turbo-cached build output) instead of `zig-out/bin/` (raw zig output, not a declared turbo output) — warm-cache CI runs no longer need to rebuild the WASM module

### Docs

- JSDoc examples in `SkiaCanvas`, `SkiaFontLoader`, and the `three` subpath index updated from "Vanilla" to "Three.js" labels

### Tests

- Added comprehensive unit tests for all four resolution paths of `useSkiaContext`: nearest React context, live global singleton, destroyed singleton (falls through to init), pre-existing pending init (Suspense), and fresh `Skia.init` kickoff
- Tests use fulfilled/pending thenable helpers to exercise React `use()` without async re-render juggling
- Regression guards verify `useThree` is called unconditionally even when cases 1 or 2 short-circuit

Fixed a rules-of-hooks violation in `useSkiaContext` and hardened CI test reliability by reading WASM from the turbo-cached `dist/` output.


