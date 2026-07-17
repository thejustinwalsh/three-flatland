---
"@three-flatland/skia": patch
---

> Branch: fix/skia-prebuilt-wasm-fallback
> PR: https://github.com/thejustinwalsh/three-flatland/pull/164

### Fixes

- Fixed `skia:fetch-wasm` silently no-op'ing on Windows by replacing a raw `file://` string compare with a portable CLI entrypoint check (`resolve(argv[1]) === fileURLToPath(url)`).
- Fixed hard-coded `:` PATH separator across `build-wasm`, `compare-builds`, `prebuilt-wasm`, and `setup` scripts — now uses `path.delimiter` for cross-platform correctness.
- Fixed `fetchPrebuiltWasm` reporting success on a partial manifest match — it now requires every requested wasm variant to be present before returning true, preventing missing artifacts from going undetected.
- Bounded external command execution: added a 15s timeout on the Zig probe and 60s/30s timeouts with `execFileSync` (no shell interpolation) on `npm pack`/`tar`, preventing indefinite hangs.

Summary: hardens the skia prebuilt-wasm fetch pipeline against Windows entrypoint detection, PATH handling, partial-manifest false positives, and hung external processes.
