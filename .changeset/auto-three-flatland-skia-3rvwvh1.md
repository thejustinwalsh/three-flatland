---
"@three-flatland/skia": patch
---

> Branch: fix/skia-prebuilt-wasm-fallback
> PR: https://github.com/thejustinwalsh/three-flatland/pull/164

- Fix `skia:fetch-wasm` CLI entrypoint check silently no-op'ing on Windows (raw `file://` string compare replaced with `resolve(argv[1]) === fileURLToPath(url)`)
- Fix `PATH` augmentation across `build-wasm`, `compare-builds`, `setup`, and `prebuilt-wasm` scripts using a hard-coded `:` separator, breaking on Windows (now uses `path.delimiter`)
- Fix `fetchPrebuiltWasm` silently accepting a partial variant match — now requires every requested variant to exist in the manifest, or fails clearly instead of reporting false success
- Add bounded timeouts to external command calls: 15s on the Zig build probe, 60s on `npm pack`, 30s on `tar` extraction, using `execFileSync` (no shell interpolation) instead of `execSync`

Hardens the `@three-flatland/skia` prebuilt-WASM fallback path against Windows path bugs, partial-fetch false positives, and indefinitely hanging subprocesses.
