---
"@three-flatland/skia": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

### Build

- Added `.size-limit.cjs` with esbuild plugin to handle WASM stubs and JSON imports from `@three-flatland/skia` during bundle analysis
- Added `scripts/size-limit.mjs` — wrapper that filters missing entries for base-branch compat and appends raw + brotli sizes for Skia WASM binaries
- `packages/skia/tsup.config.ts`: copies `wgpu-layouts.json` to `dist/` on build success (file was silently missing from published output)

### Bug fixes

- `useSkiaContext` — moved `useThree` call unconditionally before all early returns to satisfy `react-hooks/rules-of-hooks`; hook now works correctly in all resolution paths (nearest context, alive singleton, pending init, fresh init)
- Added comprehensive tests for all `useSkiaContext` resolution cases, including Suspense and strict-mode regression guards

### Examples

- All plain Three.js examples reorganised from `examples/vanilla/` to `examples/three/`

`@three-flatland/skia` now ships the `wgpu-layouts.json` asset in its dist output, fixing a silent runtime failure when loading WebGPU shaders.
