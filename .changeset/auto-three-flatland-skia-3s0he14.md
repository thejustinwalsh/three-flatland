---
"@three-flatland/skia": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

**Size-limit infrastructure**

- Replaced `.size-limit.json` with `.size-limit.cjs` to support esbuild plugins and custom WASM handling
- WASM binaries (`skia-gl.opt.wasm`, `skia-wgpu.opt.wasm`) are now measured as raw + brotli file sizes via a new `scripts/size-limit.mjs` wrapper instead of inline size-limit entries
- `@three-flatland/skia` esbuild config now stubs `.wasm` imports and resolves `.json` files from `src/` during bundle analysis — fixes incorrect size-limit failures on the base branch
- `packages/skia/tsup.config.ts`: `onSuccess` hook now copies `wgpu-layouts.json` from `src/ts/` into `dist/` so runtime JSON imports resolve correctly after build

**`useSkiaContext` hook fix (React rules-of-hooks)**

- `useThree` is now called unconditionally before any early returns — fixes `react-hooks/rules-of-hooks` violation that occurred when the React context or global singleton resolved in cases 1–2
- Added full test suite for all four resolution paths (nearest context, live singleton, destroyed singleton, cold init) plus regression guards for the unconditional hook ordering

**Examples reorganised**

- All Three.js examples moved from `examples/vanilla/` to `examples/three/`; `SkiaCanvas` and `SkiaFontLoader` docs updated to use "Three.js" terminology

This release fixes a Safari performance regression in the stats graph (`~20fps` throttle caused by a competing RAF loop) and ships a complete test suite for the skia React hook alongside improved size-limit infrastructure.
