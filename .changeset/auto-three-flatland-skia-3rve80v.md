---
"@three-flatland/skia": patch
---

> Branch: feat/nx-migration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/197

### Build & packaging fixes

- Fix `dist/wgpu-layouts.json` being emitted one directory too deep, which broke bundling `@three-flatland/skia` in consumer projects (`import "../wgpu-layouts.json"` from `wasm-loader-wgpu.js` couldn't resolve)
- Fix test harness (`test/setup.ts`, `test/browser-test.html`) still pointing at the old `dist/skia-*/` wasm path instead of the current `lib/skia-*.wasm` location, which caused every skia API test to fail to collect on CI

### Wasm build pipeline reliability

- Make `setup.mjs --ensure` freshness checks source-aware: freshness is now determined by a content hash of the wasm sources (zig build files, patches, vendor, wit, skia submodule SHA) instead of simply checking that `lib/*.wasm` exists, so CI actually recompiles when skia sources change and commits the rebuilt libs
- Add `--wasm-hash` debug flag to inspect CI rebuild decisions; remove the old unreliable `build-wasm.mjs --skip-if-fresh` check
- Stop remote-fetching prebuilt wasm binaries on hosts that can't compile (e.g. macOS 27); use the committed `lib/*.wasm` and fail hard if missing instead of silently overwriting tracked libs with a stale published version
- Remove the dead `skia:fetch-wasm` script and `prebuilt-wasm.json` manifest; rename `prebuilt-wasm.mjs` to `host-capability.mjs`
- Revert a broken phase-4a experiment that split `build` into a bare `tsdown` step plus a separate `build:wasm` CI job — restored the working `setup.mjs --ensure && tsdown` pipeline so wasm is always built from patched sources before packaging
- Restore `lib/*.wasm` as a cached nx build output keyed on wasm sources, and restore the CI build matrix to `lts/*` + `lts/-1`

### Summary

Fixes several breakages in the skia wasm build/release pipeline: correct dist asset placement for consumers, working tests against the new binary-artifacts layout, and a reliable, source-aware wasm rebuild/commit flow in CI.
