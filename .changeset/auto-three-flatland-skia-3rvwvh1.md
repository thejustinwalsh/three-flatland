---
"@three-flatland/skia": patch
---

> Branch: fix/skia-prebuilt-wasm-fallback
> PR: https://github.com/thejustinwalsh/three-flatland/pull/164

### Fixes

- Fix `skia:fetch-wasm` CLI entrypoint check silently no-op'ing on Windows by comparing `resolve(argv[1])` against `fileURLToPath(url)` instead of a raw `file://` string compare.
- Fix PATH augmentation across `build-wasm`, `compare-builds`, and `setup` scripts to use `path.delimiter` instead of a hard-coded `:`, fixing Windows compatibility.
- Fix `fetchPrebuiltWasm` false-positive: it now requires every requested WASM variant to be present in the manifest before reporting success, instead of returning true after copying only a partial match.
- Bound external command execution to prevent indefinite hangs: 15s timeout on the Zig probe, and `execFileSync` with 60s/30s timeouts (no shell interpolation) for `npm pack`/`tar`.

Internal hardening of the `@three-flatland/skia` prebuilt-WASM fetch and build tooling; no public API changes.
