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

- Threading. WASM threads (SharedArrayBuffer + Web Workers) is a much larger undertaking. SIMD alone should hit the target; if not, threads is a separate phase.
- Transcoder. We only need encoding. The 80KB-ish `basisu_transcoder.cpp` and friends stay out.
- KTX2-Zstd supercompression on the encode side (it's already optional in BasisU and we don't use it). Zstd source still needed for the encoder's internal use.
- Embind / Emscripten / glue JS. We're explicitly leaving that toolchain.
- Replacing other codecs (PNG/WebP/AVIF). They stay on `@jsquash`.

## Why pure WASI (and not Emscripten)

BasisU is bytes-in / bytes-out — no DOM, no GL, no filesystem, no threading required. That's the platonic case for `wasm32-wasi`: smaller binary, faster startup, no Emscripten runtime overhead, no JS glue file. Skia couldn't go this route because it needs WebGPU/WebGL bridges; BasisU has no such surface.

The downside is we lose Embind's auto-generated class bindings, so we hand-write a flat C API and rewrite `codecs/ktx2.ts` to call it. The C API is roughly 8 functions; the JS rewrite is roughly the same line count as today.

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
        "-DBASISU_SUPPORT_SSE=0",      // disable x86 intrinsics paths
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
| BasisU's SIMD paths are SSE/NEON only; `-msimd128` doesn't auto-translate. | Confirmed in upstream — `basisu_resampler.cpp`, `basisu_etc.cpp` etc. have manual SSE intrinsics gated by `BASISU_SUPPORT_SSE`. We disable that path and rely on the compiler auto-vectorizing the scalar path under `-msimd128`. If the gain is insufficient, the next step is hand-porting one or two hot loops to `wasm_simd128.h`. |
| Zig 0.14's wasm32-wasi C++ toolchain has surprises (e.g., libc++ fragments). | Skia already proved this works for ~1MLOC of C++ on the same toolchain. BasisU is much smaller. |
| BasisU asserts on input edge cases that the WASI shim no-ops. | Asserts go to `fd_write(2)`. Shim returns "wrote N bytes" without doing anything; encoder thinks the assert was logged. Behavior is identical to current. |
| Encoder calls `clock()` for timing. | Provide real `clock_time_get` impl in shim; or pass `-DBASISU_NO_TIMING`. |
| Output size regresses vs. stock encoder. | Round-trip equivalence test gates this. Both binaries compile from the same upstream rev; output should be byte-identical when SIMD doesn't change algorithm output (which it shouldn't for ETC1S/UASTC quantization). |

## Success criteria

1. `zig build -Doptimize=ReleaseFast` produces `packages/image/vendor/basis/basis_encoder.wasm`.
2. `pnpm --filter @three-flatland/image test` green; existing 17 image tests pass without modification (only the implementation under `ktx2.ts` changes).
3. Round-trip equivalence test: Path A and Path B produce byte-identical output on 4×4 and 64×64 RGBA fixtures, ETC1S and UASTC modes.
4. Benchmark gate: 2048² atlas, ETC1S + mipmaps, quality 128, **< 5000ms** wall-time, single run, measured the same way as the predecessor benchmark.
5. `vendor/basis/basis_encoder.js`, `vendor/basis/package.json`, and the BinomialLLC `vendor/basis/basis_encoder.wasm` are deleted from the branch.
6. Docs: `vendor/basisu/README.flatland.md` records source rev + import date.

## Out of scope (filed for later)

- Multi-threaded encode (WASM threads + worker pool).
- Streaming encode for very large atlases.
- Wiring `wasi-shim.ts` into a shared `@three-flatland/wasi` package — Skia gets to keep its copy until we have a third consumer.
- Re-evaluating whether to swap PNG/WebP/AVIF off `@jsquash` to vendored Zig+WASI builds. Different cost/benefit.
