---
"@three-flatland/skia": patch
---

> Branch: fix/skia-prebuilt-wasm-fallback
> PR: https://github.com/thejustinwalsh/three-flatland/pull/164

### Fixes

- Fix `skia:fetch-wasm` CLI entrypoint check silently no-op'ing on Windows — now uses a portable `resolve(argv[1]) === fileURLToPath(url)` comparison instead of a raw `file://` string match.
- Fix hard-coded `:` PATH separator across `build-wasm`, `compare-builds`, `setup`, and `prebuilt-wasm` scripts (broke on Windows); now uses `path.delimiter`.
- Fix `fetchPrebuiltWasm` silently reporting success when only some requested WASM variants were present in the manifest — now requires every requested variant to match before copying, preventing missing artifacts from going unnoticed.
- Add timeouts to external command invocations (Zig probe: 15s, `npm pack`/`tar`: 60s/30s) and switch to `execFileSync` to avoid shell interpolation and indefinite hangs.

Hardens the prebuilt-WASM fetch path against review feedback: fixes cross-platform bugs and prevents silent partial failures or hung processes during WASM setup.
