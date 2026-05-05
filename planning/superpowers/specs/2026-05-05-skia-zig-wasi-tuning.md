# Skia wasm tuning — bring the Zig+WASI build in line with the cookbook

**Status:** spec / planning (deferred)
**Date:** 2026-05-05
**Scope:** `packages/skia/` — `build.zig`, the JS-side runtime, the dist artifact pipeline.

> **For wasm/Zig build pattern guidance, read `.library/zig-wasi/cookbook.md` FIRST.** That document is library-agnostic and prescriptive. This spec is the application of those patterns to the skia package's older shape. The cookbook is the contract; this is the migration.

## Why this spec exists

The skia wasm port (`packages/skia/`) predates the patterns we honed during the basisu port in May 2026. The basisu work distilled a prescriptive recipe for Zig + wasm32-wasi + uwasi + wasm-opt that the skia build has not yet adopted. The packaged outputs (`dist/skia-gl/`, `dist/skia-wgpu/`) function correctly but carry size and complexity costs the cookbook patterns would eliminate.

Both `packages/image/CLAUDE.md` and `packages/skia/CLAUDE.md` reference this spec as the canonical migration. The skia CLAUDE.md explicitly warns agents not to copy skia's current `build.zig` shape as a reference for new work.

## Current state — concrete gaps vs the cookbook

Verified against `packages/skia/build.zig` and the JS-side runtime as of 2026-05-05. File:line references are precise.

| # | Cookbook prescription | Skia today | Severity | Source |
|---|---|---|---|---|
| 1 | `rdynamic = false` (DCE roots = only `__attribute__((export_name))` symbols) | `exe.rdynamic = true` | High — every C++ symbol is a DCE root; binary larger than necessary | `build.zig:125` |
| 2 | `entry = .disabled` + `wasi_exec_model = .reactor` set explicitly | Neither set; reactor mode inferred via WIT bindings | Medium | `buildVariant` fn |
| 3 | CPU features = `simd128, bulk_memory, sign_ext, nontrapping_fptoint` only | Adds `tail_call`, `exception_handling` | Medium — not all browser engines support these | `build.zig:12` |
| 4 | Force-include `no_stdio.h` to no-op the C stdio call sites | Not applied | Medium — printf chain may pull `fd_write` + libc format-parser | base `cxx_flags`, `build.zig:138-143` |
| 5 | `wasm-opt -Oz --strip-debug --strip-producers --enable-*` post-link as a `b.addSystemCommand` step | wasm-opt run from `bin/build-wasm.mjs`, not `build.zig` | Low — functionally equivalent but easy to skip and not idiomatic | `bin/build-wasm.mjs` |
| 6 | uwasi for the JS-side WASI imports with custom no-FS feature provider | Hand-rolled WASI stubs (returning EBADF for fd_*, similar shape to old basisu shim) | Low — stubs are correct but not maintained externally | `wasm-loader-shared.ts:91` |
| 7 | `import_symbols = true` not in cookbook (basisu doesn't use it) | `exe.import_symbols = true` set | **Open question** — likely required for the WIT component-model glue; needs investigation before changing | `build.zig:126` |

A subset of these (4, 5, 6) are pure wins. (1, 2, 3) are wins gated on a WIT-bindings investigation: skia's current shape exists because the WIT bindings drive a different export model. (7) needs to be understood before deciding to keep or drop.

## Target state

Skia's `build.zig` mirrors the cookbook patterns within whatever constraints the WIT bindings impose. Specifically:

1. `rdynamic = false`. WIT-generated `__attribute__((__export_name__(...)))` decorations in `src/zig/bindings/generated/skia_gl.c` are the only DCE roots.
2. `entry = .disabled` + `wasi_exec_model = .reactor` explicit on every variant.
3. CPU features back to the safe set (no `tail_call` / `exception_handling`) UNLESS we can document a specific code path that requires them and a browser baseline that supports them.
4. `-include src/zig/no_stdio.h` in `cxx_flags`. Header content matches `packages/image/src/zig/no_stdio.h` (10 macros + `#include <stdio.h>` first).
5. wasm-opt runs as a `b.addSystemCommand` step inside `build.zig`, with `--enable-simd --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int` matching the compile-time CPU features.
6. JS-side runtime swapped to `uwasi` with the same composition the image package uses (`useClock`, `useEnviron`, `useRandom()`, `useProc`, custom `useNoFs`).
7. `import_symbols = true` either kept (with a documented reason) or dropped.

## Tasks — ordered by safety and dependency

Each task should land as a separate commit. Build + test must pass after each. Run `pnpm --filter @three-flatland/skia build` and load the GL variant in a browser smoke test between tasks.

### T1 — Add `no_stdio.h` and force-include it

- **Files:** create `packages/skia/src/zig/no_stdio.h` (mirror `packages/image/src/zig/no_stdio.h` verbatim), edit `packages/skia/build.zig` `cxx_flags`.
- **Risk:** low. Skia's source might use FILE pointers in dead code paths; the header includes `<stdio.h>` first so types still resolve.
- **Verify:** build succeeds, `wasm-opt --metrics dist/skia-gl/skia_gl.wasm` shows fewer imports than before.

### T2 — Drop `tail_call` and `exception_handling` CPU features

- **Files:** `packages/skia/build.zig:12`.
- **Investigation first:** grep skia source for `__cpp_exceptions`, `try`, `catch`, and tail-call hints. Skia historically uses tail-call elimination in some shader interpreters. Verify nothing depends on these features in the live call graph from any `exports_skia_gl_*` or `exports_skia_wgpu_*` Zig export.
- **Risk:** medium. If skia paths require these, we'll see compilation errors or runtime traps.
- **Fallback:** if either is required, document why (commit message + comment in build.zig) and keep it. Cookbook calls these out as risky; we deviate explicitly.
- **Verify:** GL + WebGPU variants both build + smoke-test successfully.

### T3 — Add `entry = .disabled` and `wasi_exec_model = .reactor`

- **Files:** `packages/skia/build.zig` `buildVariant` fn (per-variant exe configuration).
- **Risk:** low — basisu has been running with these settings for a while. Skia's WIT bindings already produce a reactor-shape module; making it explicit closes a configuration gap rather than introducing one.
- **Verify:** GL + WebGPU variants both build + smoke-test successfully.

### T4 — Migrate the JS-side runtime to uwasi

- **Files:** `packages/skia/src/runtime/wasm-loader-shared.ts` (or wherever the current shim lives — confirm path).
- **Pattern:** mirror `packages/image/src/runtime/wasi-shim.ts`. Same uwasi feature composition. The custom `useNoFs` feature provider is the load-bearing piece — uwasi's default `ENOSYS` for unconfigured imports breaks wasi-libc's preopen scan.
- **Risk:** low — the basisu migration of the same shape revealed exactly one gotcha (ENOSYS-to-EBADF for `fd_prestat_get`) that the `useNoFs` feature handles. Reuse the same code shape.
- **Verify:** vitest tests pass; smoke-test GL + WebGPU variants in a browser.

### T5 — Move `wasm-opt` from `bin/build-wasm.mjs` into `build.zig` as `addSystemCommand`

- **Files:** `packages/skia/build.zig`, `packages/skia/bin/build-wasm.mjs`.
- **Pattern:** mirror the basisu encoder/transcoder `wasm-opt` step at `packages/image/build.zig` (search for `addSystemCommand`).
- **Risk:** low — purely a relocation. The wasm-opt invocation already exists; we're moving where it's invoked.
- **Verify:** dist artifacts byte-identical to the previous `build-wasm.mjs` output (or smaller, if the relocation accidentally fixes a missed flag).

### T6 — Investigate `import_symbols = true`

- **Files:** `packages/skia/build.zig:126`.
- **Investigation:** what does `import_symbols = true` do for this build, and is it required for the WIT component-model glue?
- **Decision tree:**
  - If required: document why in a comment.
  - If unnecessary: drop. Smaller export table, cleaner `wasm-opt --metrics` output.

### T7 — Set `rdynamic = false` (the big win)

- **Files:** `packages/skia/build.zig:125`.
- **Investigation first:** with `rdynamic = false`, the only DCE roots are `__attribute__((export_name))` symbols. Read `src/zig/bindings/generated/skia_gl.c` to confirm the WIT-generated wrappers carry these decorations. If the generator emits them, we're safe. If not, we need to either patch the generator output or keep `rdynamic = true` with a comment.
- **Risk:** medium — this is the high-impact change. If the WIT wrapper symbols aren't `export_name`-decorated, the DCE will eat them and the wasm will have no exports.
- **Verify:** `wasm-opt --metrics` post-build. Exports list should match the cookbook's healthy-build pattern (initialize, memory, function table, plus the ~N WIT-generated `exports_skia_gl_*` functions). Functional smoke test: GL variant renders a path; WebGPU variant renders a path.

### T8 — Cookbook compliance pass + size measurement

- After T1–T7 land, run `wasm-opt --metrics` against both variants and compare against the cookbook's "healthy build signals" table (`.library/zig-wasi/cookbook.md` §15).
- Document the before/after sizes in the migration commit message.
- Update `packages/skia/CLAUDE.md` to remove the "older shape" callouts now that we're cookbook-compliant. Replace with "follows the cookbook patterns; see `.library/zig-wasi/cookbook.md`."

## Risks / open questions

- **WIT-generated bindings vs `rdynamic = false`.** Highest-risk question. If the Zig WIT bindings generator does not decorate exports with `__attribute__((export_name))`, T7 cannot proceed without patching the generator. Confirm before scheduling T7.
- **`tail_call` / `exception_handling` in skia source.** May require static analysis; grep for the obvious symbols first, then attempt the change in T2.
- **wasm-opt invocation parity.** Current `build-wasm.mjs` may have flags or post-processing the basisu version doesn't. Diff the two before relocating in T5.
- **JS-side test coverage.** Skia's TS-side may have less test coverage than the image package. The uwasi migration in T4 should land alongside any new tests that exercise the wasm load path end-to-end.

## Out of scope for this migration

- Skia source patches. We're tuning the build, not modifying skia internals.
- Multi-variant restructuring. The two-variant pattern (GL + WebGPU) stays. Adding or removing variants is a separate concern.
- Changing the WIT-bindings architecture. This migration assumes the current bindings shape is correct; we're aligning the wrapping build to the cookbook.
- Performance tuning beyond what falls out of the size optimizations. Speed is the next pass.

## Success criteria

- `wasm-opt --metrics dist/skia-gl/skia_gl.wasm` shows single-digit imports, exports count matches the WIT-generated function set + `_initialize` + `memory` + `__indirect_function_table`, no unexpected exports.
- Same for `dist/skia-wgpu/skia_wgpu.wasm`.
- Both variants pass existing tests + a browser smoke test (GL renders a path; WebGPU renders a path).
- Final binary sizes documented and reduced from current.
- `packages/skia/CLAUDE.md` updated to remove "older shape" callouts.
