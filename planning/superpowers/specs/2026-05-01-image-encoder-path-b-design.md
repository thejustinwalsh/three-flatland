---
date: 2026-05-01
topic: image-encoder-path-b
phase: 1
status: draft
branch: feat-vscode-tools
trigger: planning/superpowers/specs/2026-05-01-image-encoder-test-gate-report.md (gate item 2 — 8.5s ETC1S+mips on 2048², over 5s threshold)
predecessor: planning/superpowers/specs/2026-05-01-image-encoder-design.md
---

# Path B: BasisU encoder rebuilt with Zig + WASI + SIMD

## Goal

Drop-in replacement `basis_encoder.wasm` for `packages/image/vendor/basis/`, built from vendored BasisU sources via Zig targeting `wasm32-wasi` with `simd128`, exposing a flat C ABI consumed by a rewritten `codecs/ktx2.ts`. Target: 2048² ETC1S+mips encode under 5s (current 8.5s).

## Non-goals

- Threading. WASM threads (SharedArrayBuffer + Web Workers) is a much larger undertaking. SIMD-port alone should hit the target; if not, threads is a separate phase.
- Transcoder. We only need encoding. The 80KB-ish `basisu_transcoder.cpp` and friends stay out.
- KTX2-Zstd supercompression on the encode side (it's already optional in BasisU and we don't use it). Zstd source still needed for the encoder's internal use.
- Embind / Emscripten / glue JS. We're explicitly leaving that toolchain.
- Replacing other codecs (PNG/WebP/AVIF). They stay on `@jsquash`.
- Upstreaming our SIMD port to `BinomialLLC/basis_universal`. That's a separate effort with separate review concerns; we keep our port as a local patch.

## Why pure WASI (and not Emscripten)

BasisU is bytes-in / bytes-out — no DOM, no GL, no filesystem, no threading required. That's the platonic case for `wasm32-wasi`: smaller binary, faster startup, no Emscripten runtime overhead, no JS glue file. Skia couldn't go this route because it needs WebGPU/WebGL bridges; BasisU has no such surface.

The downside is we lose Embind's auto-generated class bindings, so we hand-write a flat C API and rewrite `codecs/ktx2.ts` to call it. The C API is roughly 8 functions; the JS rewrite is roughly the same line count as today.

## Why we are doing the SIMD port

BasisU's hot loops (mipmap resampling, ETC1S quantization, UASTC packing) are hand-written SSE2/SSE4.1 intrinsics gated by `BASISU_SUPPORT_SSE`. Upstream's Emscripten build disables that flag and falls back to scalar — that is almost certainly why the stock `basis_encoder.wasm` we measured at 8.5s is slow. `clang -msimd128` will not auto-translate `_mm_*` intrinsic source to `wasm_*` instructions; intrinsics are typed against `__m128i`, not generic vectors, and the compiler treats them as opaque builtins. To get SIMD on WASM we have to add a `BASISU_SUPPORT_WASM_SIMD` code path that mirrors `BASISU_SUPPORT_SSE` using `wasm_simd128.h`. This is the load-bearing engineering of Path B; the Zig build is the smaller part.

## Layout

```
packages/image/
  build.zig                   # Path B build orchestration
  build.zig.zon
  vendor/
    basis/                    # OUTPUT — git-ignored except .wasm artifact
      basis_encoder.wasm      # built artifact, checked in (~500-800KB est.)
    basisu/                   # SOURCE — vendored from upstream
      encoder/                # ~30 .cpp/.h files
      transcoder/             # only basisu_transcoder.h needed (encoder includes it)
      zstd/                   # encoder's zstd
      LICENSE
      README.flatland.md      # records source rev + patches
  src/
    codecs/
      ktx2.ts                 # REWRITTEN — flat-C API instead of Embind
    runtime/
      wasi-shim.ts            # ported from packages/skia
      basis-loader.ts         # encoder-specific loader (Node + browser paths)
    zig/
      basis_c_api.cpp         # flat extern "C" entry points (~150 LOC)
      basis_c_api.h
```

The current `vendor/basis/{basis_encoder.js, package.json}` files get deleted. The `basis_encoder.wasm` filename is preserved so the existing Node-side disk-load path doesn't change (only the loader code changes).

## C API

Single header `basis_c_api.h`, single translation unit `basis_c_api.cpp`. All functions are `extern "C"`. Memory is caller-managed via two exported helpers:

```c
// Memory helpers (export from wasm)
void* fl_basis_alloc(size_t bytes);
void  fl_basis_free(void* ptr);

// One-shot lifecycle (must be called once per process)
int   fl_basis_init(void);

// Encoder lifecycle
typedef struct fl_basis_encoder fl_basis_encoder;
fl_basis_encoder* fl_basis_encoder_create(void);
void              fl_basis_encoder_destroy(fl_basis_encoder*);

// Configuration (matches current Ktx2Options surface)
typedef struct {
  uint32_t uastc;            // 0 = ETC1S, 1 = UASTC
  uint32_t mipmaps;          // 0 / 1
  uint32_t quality;          // 1..255 (ETC1S)
  uint32_t uastc_level;      // 0..4
  uint32_t check_for_alpha;  // 0 / 1
} fl_basis_opts;

// One-shot encode. Caller owns input pixels; encoder writes ptr+len
// into out_ptr/out_len which point into the encoder's internal buffer.
// Returns 0 on success, negative error code on failure.
int fl_basis_encode(
  fl_basis_encoder* enc,
  const uint8_t* rgba, uint32_t width, uint32_t height,
  const fl_basis_opts* opts,
  uint8_t** out_ptr, uint32_t* out_len
);
```

The output buffer is owned by the encoder instance; the JS side memcpy's it out before calling `fl_basis_encoder_destroy`. This is simpler than the BinomialLLC API where the caller pre-allocates a max-size output buffer.

## JS-side surface

`packages/image/src/codecs/ktx2.ts` keeps its public API unchanged (`encodeKtx2(image, opts)`). Internals are rewritten:

```ts
// Pseudocode
const { instance, memory, exports } = await loadBasisWasm()
const inPtr = exports.fl_basis_alloc(rgba.byteLength)
new Uint8Array(memory.buffer, inPtr, rgba.byteLength).set(rgba)
const enc = exports.fl_basis_encoder_create()
const optsPtr = writeOptsStruct(exports, opts)
const outPtrPtr = exports.fl_basis_alloc(8) // ptr + len out-params
const rc = exports.fl_basis_encode(enc, inPtr, w, h, optsPtr, outPtrPtr, outPtrPtr + 4)
const view = new DataView(memory.buffer)
const outPtr = view.getUint32(outPtrPtr, true)
const outLen = view.getUint32(outPtrPtr + 4, true)
const result = new Uint8Array(memory.buffer, outPtr, outLen).slice() // copy out
exports.fl_basis_encoder_destroy(enc)
exports.fl_basis_free(inPtr)
exports.fl_basis_free(optsPtr)
exports.fl_basis_free(outPtrPtr)
return result
```

`loadBasisWasm()` lives in `runtime/basis-loader.ts`:
- Node: `readFileSync(vendor/basis/basis_encoder.wasm)` → `WebAssembly.instantiate` with `wasi_snapshot_preview1` Proxy imports.
- Browser: `fetch()` → same instantiation. The wasm path resolves the same way `@jsquash` does (Vite bundles it as an asset).

The WASI shim is a port of `packages/skia/src/ts/wasm-loader-shared.ts:createWasiImports` — about 50 LOC, no deps. It returns `EBADF` for fd ops, `ENOENT` for path ops, `0` for everything else, and provides real impls for `environ_sizes_get` / `args_sizes_get` / `proc_exit` / `clock_time_get` / `random_get`. BasisU's expected WASI surface is small: malloc-related sbrk via `memory.grow`, possibly `clock_time_get` for timing, possibly `random_get` for ETC1S dithering.

## Build (`build.zig`)

Single-target build. No GL/WGPU variants, no FreeType, no WIT. The whole file is ~80 LOC.

```zig
pub fn build(b: *std.Build) void {
    var query: std.Target.Query = .{ .cpu_arch = .wasm32, .os_tag = .wasi };
    query.cpu_features_add = std.Target.wasm.featureSet(&.{
        .simd128, .bulk_memory, .sign_ext, .nontrapping_fptoint,
    });
    const target = b.resolveTargetQuery(query);
    const optimize = b.standardOptimizeOption(.{}); // ReleaseFast for shipping

    const exe = b.addExecutable(.{
        .name = "basis_encoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    exe.entry = .disabled;       // reactor-style: no _start, just exports
    exe.rdynamic = true;
    exe.export_table = true;
    exe.initial_memory = 32 * 1024 * 1024;
    exe.max_memory = 512 * 1024 * 1024;

    const cxx_flags: []const []const u8 = &.{
        "-std=c++17",
        "-fno-exceptions", "-fno-rtti",
        "-fno-math-errno", "-fno-signed-zeros", "-ffp-contract=fast",
        "-msimd128",
        "-DBASISU_SUPPORT_SSE=0",      // SSE intrinsic source paths off
        "-DBASISU_SUPPORT_WASM_SIMD=1",// our wasm_simd128 mirror
        "-DBASISD_SUPPORT_KTX2=1",
        "-DBASISD_SUPPORT_KTX2_ZSTD=0",// no zstd supercompression at encode
        "-DNDEBUG",
    };

    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/encoder"),
        .files = &basis_encoder_files, // hand-listed in encoder_files.zig
        .flags = cxx_flags,
    });
    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/zstd"),
        .files = &.{ "zstd.c" },
        .flags = &.{ "-msimd128", "-DZSTD_DISABLE_ASM=1", "-DNDEBUG" },
    });
    exe.addCSourceFile(.{ .file = b.path("src/zig/basis_c_api.cpp"), .flags = cxx_flags });
    exe.addIncludePath(b.path("vendor/basisu"));
    exe.addIncludePath(b.path("vendor/basisu/encoder"));
    exe.addIncludePath(b.path("vendor/basisu/transcoder"));
    exe.linkLibC();
    exe.linkLibCpp();

    // Install to vendor/basis/basis_encoder.wasm so the loader path stays unchanged.
    const install = b.addInstallFile(exe.getEmittedBin(), "../vendor/basis/basis_encoder.wasm");
    b.getInstallStep().dependOn(&install.step);
}
```

Build invocation: `zig build -Doptimize=ReleaseFast`. Dev iteration: `zig build -Doptimize=Debug` (faster compile, larger output).

The encoder source list lives in a separate `encoder_files.zig` file so the main `build.zig` stays readable. ~30 entries; hand-curated by mirroring upstream's `webgl/encoder/CMakeLists.txt` minus transcoder-only files.

## SIMD port (SSE → wasm_simd128)

Source of truth in upstream is `encoder/basisu_kernels_sse.cpp` plus inline `_mm_*` calls in `basisu_resampler.cpp`, `basisu_etc.cpp`, and `basisu_uastc_enc.cpp`. The kernels file is the bulk; the inline ones are short and incidental.

**Strategy:** add a parallel implementation file `encoder/basisu_kernels_wasm.cpp` (vendored alongside, not patched into existing files) and gate it via `BASISU_SUPPORT_WASM_SIMD`. For inline `_mm_*` calls in the other encoder files, we apply minimal patches that route through a small shim header `vendor/basisu_patches/basisu_simd_compat.h` providing a uniform `bu_v128_*` API that maps to either SSE intrinsics or `wasm_simd128.h` based on the build flag. The patches are line-counted in `README.flatland.md`.

**Intrinsic mapping** (the common cases — full list emerges during port):

| SSE | wasm_simd128 |
|---|---|
| `__m128i` | `v128_t` |
| `_mm_loadu_si128` / `_mm_storeu_si128` | `wasm_v128_load` / `wasm_v128_store` |
| `_mm_set1_epi8/16/32` | `wasm_i8x16_splat` / `wasm_i16x8_splat` / `wasm_i32x4_splat` |
| `_mm_add_epi*` / `_mm_sub_epi*` | `wasm_i*x*_add` / `wasm_i*x*_sub` |
| `_mm_mullo_epi16/32` | `wasm_i16x8_mul` / `wasm_i32x4_mul` |
| `_mm_packus_epi16` | `wasm_u8x16_narrow_i16x8` |
| `_mm_unpacklo/hi_epi*` | `wasm_v*x*_shuffle` (constant indices) |
| `_mm_movemask_epi8` | `wasm_i8x16_bitmask` |
| `_mm_min/max_epu8/16` | `wasm_u8x16_min` / `wasm_u16x8_max` etc. |
| `_mm_cmpeq_epi*` | `wasm_i*x*_eq` |
| `_mm_shuffle_epi8` (PSHUFB) | `wasm_i8x16_swizzle` |

Two SSE operations have no clean WASM equivalent: `_mm_madd_epi16` (signed 16→32 horizontal multiply-add) and certain SSE4.1 `_mm_blend_epi*` constant-mask blends. These get implemented with 2-3 instruction sequences. The kernels we expect to need them are the SAD/SSE error-metric loops in ETC1S — measurable but not pathological.

**Verification:** the SIMD path must be opt-out (env `FL_BASIS_NO_SIMD=1`) so we can A/B benchmark and make sure the SIMD kernels are actually executing. A test asserts that a known fixture encoded with SIMD vs scalar produces byte-identical output (the kernels do equivalent fixed-point math; outputs must match).

## Vendoring

Source goes under `packages/image/vendor/basisu/` (no submodule, no fetch step). The vendored snapshot is committed to the branch. `README.flatland.md` records:

- Upstream rev (commit SHA from `BinomialLLC/basis_universal`)
- Date imported
- Local patches (expected: zero on first import; add as needed for SIMD or asserts)
- Files removed (transcoder's `.cpp`, OpenCL bits, `webgl/transcoder/`, examples, tests)

Re-import is a manual chore: re-download the tarball, drop it in, eyeball-diff. We accept that cost — submodule churn cost more in Skia.

## Tests

The existing test suite under `packages/image/src/codecs/ktx2.test.ts` keeps its current shape and continues to pass with the rewritten `ktx2.ts`. The Path B benchmark (`basisu-bench.test.ts`) is the gate: must report under 5000ms for ETC1S + mipmaps quality 128 on the 2048² fixture. We add a second benchmark line for UASTC level 2 to catch regressions there too.

A new round-trip vs. KTX2 test compares output bytes-equal between Path A (current `vendor/basis/basis_encoder.{js,wasm}`) and Path B (new `basis_encoder.wasm`) on the small fixtures, to prove behavioral equivalence. Once it passes, the Path A artifacts are deleted from `vendor/basis/`.

## Risks

| Risk | Mitigation |
|---|---|
| SIMD port is larger than expected once we count the inline `_mm_*` calls outside `basisu_kernels_sse.cpp`. | The shim-header approach means we patch call-sites, not full functions. Bound the work by enumerating hits with `grep -rn '_mm_' encoder/` during the implementation plan; if it exceeds ~30 distinct call-sites in non-kernel files, we bail back to scalar in those specific functions and only port the kernels. |
| `_mm_madd_epi16` / SSE4.1 blends have no 1:1 wasm equivalent. | Implement with 2-3 instruction sequences. Cost is real but bounded; benchmark gates it. |
| SIMD output diverges from scalar output (different rounding in fixed-point math). | The byte-identical SIMD-vs-scalar fixture test catches this. Each ported kernel is verified before the next. |
| Zig 0.14's wasm32-wasi C++ toolchain has surprises (e.g., libc++ fragments). | Skia already proved this works for ~1MLOC of C++ on the same toolchain. BasisU is much smaller. |
| BasisU asserts on input edge cases that the WASI shim no-ops. | Asserts go to `fd_write(2)`. Shim returns "wrote N bytes" without doing anything; encoder thinks the assert was logged. Behavior is identical to current. |
| Encoder calls `clock()` for timing. | Provide real `clock_time_get` impl in shim; or pass `-DBASISU_NO_TIMING`. |
| Output size regresses vs. stock encoder. | Equivalence test gates this. With the same upstream rev and equivalent SIMD kernels, output should be byte-identical to the stock encoder for ETC1S/UASTC at fixed quality. |

## Success criteria

1. `zig build -Doptimize=ReleaseFast` produces `packages/image/vendor/basis/basis_encoder.wasm`.
2. `pnpm --filter @three-flatland/image test` green; existing 17 image tests pass without modification (only the implementation under `ktx2.ts` changes).
3. **SIMD-vs-scalar equivalence:** byte-identical output for ETC1S and UASTC on 4×4 and 64×64 fixtures, with `FL_BASIS_NO_SIMD=1` toggling the comparison.
4. **Path A vs Path B equivalence:** stock and rebuilt encoders produce byte-identical output on the same fixtures. Once green, the BinomialLLC artifacts are deleted from `vendor/basis/`.
5. **Benchmark gate:** 2048² atlas, ETC1S + mipmaps, quality 128, **< 5000ms** wall-time with SIMD on, measured the same way as the predecessor benchmark. The same benchmark is also run with `FL_BASIS_NO_SIMD=1` and the report records the speedup ratio so we have evidence the SIMD path is doing real work.
6. `vendor/basis/basis_encoder.js`, `vendor/basis/package.json`, and the BinomialLLC `vendor/basis/basis_encoder.wasm` are deleted from the branch.
7. Docs: `vendor/basisu/README.flatland.md` records source rev, import date, and the line count of every patch we apply (kernels-wasm file, shim header, call-site patches).

## Out of scope (filed for later)

- Multi-threaded encode (WASM threads + worker pool).
- Streaming encode for very large atlases.
- Wiring `wasi-shim.ts` into a shared `@three-flatland/wasi` package — Skia gets to keep its copy until we have a third consumer.
- Re-evaluating whether to swap PNG/WebP/AVIF off `@jsquash` to vendored Zig+WASI builds. Different cost/benefit.
