---
"@three-flatland/skia": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22


## What's Changed

### Bug Fixes

- `useSkiaContext` now calls `useThree` unconditionally before any early returns — fixes `react-hooks/rules-of-hooks` violation that would fire when the global singleton or nearest React context resolved early

### Testing

- Added comprehensive unit tests for `useSkiaContext` (250 lines) covering all four resolution paths: nearest React context, global singleton, pre-existing pending promise, and fresh `Skia.init()` call
- Tests cover Suspense fallback behavior for unresolved promises and two `rules-of-hooks` regression guards
- Test setup now reads WASM from `dist/<name>/<name>.wasm` instead of `zig-out/bin/` — enables turbo cache hits on warm CI runs without rebuilding

### Build

- `tsup.config.ts`: copies `wgpu-layouts.json` to `dist/` after build so runtime JSON imports resolve when consuming the built package
- Size-limit config migrated from `.size-limit.json` to `.size-limit.cjs` with a custom `scripts/size-limit.mjs` for better WASM binary handling

`useSkiaContext` now correctly satisfies the Rules of Hooks in all resolution paths; CI can now restore the WASM artifact from turbo cache without a full Zig rebuild.
