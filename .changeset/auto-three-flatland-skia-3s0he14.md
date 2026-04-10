---
"@three-flatland/skia": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## Build

- `tsup.config.ts` now copies `wgpu-layouts.json` to `dist/` on build (`onSuccess` hook) — fixes runtime JSON import failures when consuming the package
- Size-limit config migrated from `.size-limit.json` to `.size-limit.cjs`; adds a custom esbuild plugin that stubs `.wasm` imports and resolves `.json` from `src/` when not present in `dist/`
- Added `scripts/size-limit.mjs` wrapper: skips entries whose dist files don't exist (base-branch compat) and reports WASM binary raw + brotli file sizes separately
- WASM binaries (`skia-gl.opt.wasm`, `skia-wgpu.opt.wasm`) are now measured as raw file sizes rather than bundled through esbuild

## Tests

- Added comprehensive unit tests for `useSkiaContext` covering all resolution paths: nearest React context value, live global singleton, destroyed singleton fallback, already-fulfilled pending thenable, and Suspense suspension on an unresolved promise
- Added vitest workspace config and test setup for the skia package
- CI updated to run skia package tests

## Examples / docs

- `SkiaCanvas` code comments updated from "Vanilla" to "Three.js" terminology

Improves the build pipeline with correct WASM handling in bundle-size checks and `dist/` JSON copying, and adds comprehensive React hook tests for `useSkiaContext`.
