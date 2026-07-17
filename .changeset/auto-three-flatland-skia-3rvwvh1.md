---
"@three-flatland/skia": patch
---

> Branch: fix/skia-prebuilt-wasm-fallback
> PR: https://github.com/thejustinwalsh/three-flatland/pull/164

### Fixes

- Fix `skia:fetch-wasm` CLI entrypoint check silently no-op'ing on Windows — now resolves `argv[1]` and compares against the canonical `fileURLToPath(import.meta.url)` instead of a raw `file://` string concat.
- Fix `PATH` augmentation in `build-wasm.mjs`, `compare-builds.mjs`, `prebuilt-wasm.mjs`, and `setup.mjs` to use `path.delimiter` instead of a hard-coded `:`, so the pinned Zig toolchain in `.tools/bin` is picked up correctly on Windows.
- Fix `fetchPrebuiltWasm` silently reporting success on a partial manifest match — it now requires every requested variant (`gl`, `wgpu`) to be present in `prebuilt-wasm.json`, failing loudly instead of leaving a variant's `.wasm` missing.
- Harden external command execution: 15s timeout on the Zig build probe (fails fast into the prebuilt-wasm fallback instead of hanging on a stuck linker), and `execFileSync` with 60s/30s timeouts for `npm pack` / `tar` (removes shell interpolation and unbounded hangs).

Addresses PR #164 review feedback (CodeRabbit + Fro Bot). Verified via `node --check` on all four scripts, an offline missing-variant guard test, and an end-to-end prebuilt-WASM fetch that writes sha256-verified artifacts.
