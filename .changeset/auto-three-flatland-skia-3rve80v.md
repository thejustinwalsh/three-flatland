---
"@three-flatland/skia": patch
---

> Branch: feat/nx-migration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/197

- Fixed `wgpu-layouts.json` build output path so it lands at `dist/` root, matching the runtime import path in `wasm-loader-wgpu.js` — resolves a "Could not resolve ../wgpu-layouts.json" error for consumers bundling `@three-flatland/skia`
- Consolidated WASM binary artifacts under `lib/` (replacing the old `dist/skia-*/` location); updated test setup and browser-test harness to read from the new path
- Made the `setup.mjs --ensure` freshness check source-aware (hashes wasm build sources + skia submodule SHA) instead of merely checking whether `lib/*.wasm` exists, so CI properly recompiles and commits updated binaries when skia sources change
- Removed the remote prebuilt-wasm fetch path; non-building hosts now use the committed `lib/*.wasm` binaries and fail hard if missing, rather than silently overwriting tracked libs with a stale published version
- Restored the `setup.mjs --ensure && tsdown` build pipeline (reverting a broken bare-`tsdown` experiment) and the `build` nx target that caches `lib/*.wasm` keyed on wasm sources, so a fresh binary is only produced when sources actually change
- Restored CI build matrix coverage for `lts/*` and `lts/-1` Node versions

Fixes a chain of build/CI regressions in the skia package's WASM artifact pipeline — consumers can now reliably resolve bundled assets, and CI correctly rebuilds and caches native binaries only when their sources change.
