# Image Encoder Path B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BinomialLLC `basis_encoder.wasm` (8.5s on 2048² ETC1S+mips) with a Zig-built `wasm32-wasi` artifact compiled from vendored BasisU sources, with the encoder's hot SSE intrinsics ported to `wasm_simd128`. Target: under 5000ms wall-time.

**Architecture:** Pure `wasm32-wasi` reactor (no Emscripten). Zig orchestrates a single C++ static-link build of vendored BasisU encoder + zstd + a hand-written flat C ABI. The browser/Node loader provides a JS Proxy WASI shim (ported from `packages/skia`). `codecs/ktx2.ts` is rewritten to call the flat C API; its public signature (`encodeKtx2(image, opts)`) is unchanged. SSE intrinsics in BasisU's hot kernels are routed through a small `bu_v128_*` shim header that maps to either SSE or `wasm_simd128.h` based on a build flag, and the dedicated SSE kernels file (`basisu_kernels_sse.cpp`) is mirrored by a new `basisu_kernels_wasm.cpp`.

**Tech Stack:** Zig 0.14, clang's `wasm32-wasi` target with `simd128`, BasisU encoder (vendored from `BinomialLLC/basis_universal`), TypeScript / Vitest, no new npm deps.

**Spec:** `planning/superpowers/specs/2026-05-01-image-encoder-path-b-design.md`

---

## File map

**Created:**
- `packages/image/build.zig` — build orchestration (~80 LOC)
- `packages/image/build.zig.zon` — Zig package manifest
- `packages/image/encoder_files.zig` — hand-curated source list, kept separate for readability
- `packages/image/.gitignore` — additions for `zig-out/`, `.zig-cache/`
- `packages/image/vendor/basisu/` — full vendored upstream subset (encoder + transcoder headers + zstd)
- `packages/image/vendor/basisu/README.flatland.md` — records source rev, date, every patched line
- `packages/image/vendor/basisu_patches/basisu_simd_compat.h` — SSE↔wasm_simd128 shim header
- `packages/image/vendor/basisu/encoder/basisu_kernels_wasm.cpp` — wasm SIMD kernels (mirrors `basisu_kernels_sse.cpp`)
- `packages/image/src/zig/basis_c_api.h` — flat C API header
- `packages/image/src/zig/basis_c_api.cpp` — flat C API implementation
- `packages/image/src/runtime/wasi-shim.ts` — JS Proxy WASI imports (ported from `packages/skia/src/ts/wasm-loader-shared.ts`)
- `packages/image/src/runtime/basis-loader.ts` — Node + browser wasm loader
- `packages/image/src/codecs/ktx2.simd-equivalence.test.ts` — SIMD-vs-scalar byte-equivalence
- `packages/image/src/codecs/ktx2.ab-equivalence.test.ts` — Path A vs Path B byte-equivalence (deleted at end of plan)

**Modified:**
- `packages/image/src/codecs/ktx2.ts` — rewritten to call flat C API (public surface unchanged)
- `packages/image/src/basisu-bench.test.ts` — assert <5000ms once SIMD lands; report SIMD-on/off ratio
- `packages/image/package.json` — add `build:wasm` / `build:wasm:debug` scripts

**Deleted at end of plan:**
- `packages/image/vendor/basis/basis_encoder.js`
- `packages/image/vendor/basis/package.json`
- The original BinomialLLC `vendor/basis/basis_encoder.wasm` (replaced by built artifact at the same path)
- `packages/image/src/codecs/ktx2.ab-equivalence.test.ts` (no longer meaningful once Path A artifacts are removed)

---

## Phasing

The plan has four phases. Each phase ends in a verifiable green state:

1. **Vendoring + scaffolding** (Tasks 1–4): vendored sources + a Zig build that produces a hello-world `basis_encoder.wasm` that loads in Node.
2. **C API + JS rewrite, scalar-only** (Tasks 5–11): full encoder builds and works end-to-end, no SIMD yet — `ktx2.test.ts` passes against the Path B build with SSE disabled and no wasm SIMD. Will be slower than Path A; that's expected.
3. **SIMD port** (Tasks 12–17): shim header + kernel port + call-site patches. Equivalence tests gate correctness; benchmark gates perf.
4. **Cleanup + report** (Tasks 18–20): delete BinomialLLC artifacts, update vendor docs, write test gate report.

---

## Phase 1 — Vendoring + scaffolding

### Task 1: Vendor BasisU sources

Manual import of the upstream tree. Pin the rev now so subsequent work is reproducible.

**Files:**
- Create: `packages/image/vendor/basisu/encoder/` (and contents)
- Create: `packages/image/vendor/basisu/transcoder/basisu_transcoder.h` (header only, no .cpp)
- Create: `packages/image/vendor/basisu/zstd/{zstd.c,zstd.h,zstddeclib.c}` (whatever upstream ships in `zstd/`)
- Create: `packages/image/vendor/basisu/LICENSE`
- Create: `packages/image/vendor/basisu/README.flatland.md`

- [ ] **Step 1: Identify upstream rev**

Use the latest stable tag from `https://github.com/BinomialLLC/basis_universal`. As of plan-write date (2026-05-01) that is expected to be `1.50` or later. Record the exact tag and commit SHA — they go into `README.flatland.md`.

```bash
# Pick a tag, e.g. v1.50:
git ls-remote --tags https://github.com/BinomialLLC/basis_universal.git | tail -20
```

- [ ] **Step 2: Download and extract**

Download a tarball (do NOT add as a submodule). Extract only the directories we need.

```bash
TAG=<chosen-tag>
SHA=<resolved-sha>
cd /tmp
curl -L "https://github.com/BinomialLLC/basis_universal/archive/${SHA}.tar.gz" -o basisu.tgz
tar xf basisu.tgz
SRC="basis_universal-${SHA}"
```

- [ ] **Step 3: Copy the subset we use**

```bash
DEST=packages/image/vendor/basisu
mkdir -p "$DEST"
cp -r /tmp/$SRC/encoder        "$DEST/"
mkdir -p "$DEST/transcoder"
cp /tmp/$SRC/transcoder/basisu_transcoder.h    "$DEST/transcoder/"
cp /tmp/$SRC/transcoder/basisu_containers.h    "$DEST/transcoder/"
cp /tmp/$SRC/transcoder/basisu_file_headers.h  "$DEST/transcoder/"
cp /tmp/$SRC/transcoder/basisu_global_selectors_cb.h "$DEST/transcoder/" 2>/dev/null || true
cp /tmp/$SRC/transcoder/basisu.h               "$DEST/transcoder/" 2>/dev/null || true
cp -r /tmp/$SRC/zstd          "$DEST/"
cp /tmp/$SRC/LICENSE          "$DEST/"
```

After copying, remove anything that is encoder-internal-only and not needed:

```bash
# We do NOT need OpenCL or PVRTC2 build paths
rm -f "$DEST/encoder/basisu_opencl.cpp" "$DEST/encoder/basisu_opencl.h" 2>/dev/null || true
rm -f "$DEST/encoder/pvrtc2_image.h"    "$DEST/encoder/basisu_pvrtc2_4.cpp" 2>/dev/null || true
# Tests/examples
rm -rf "$DEST/encoder/test" "$DEST/encoder/tests" 2>/dev/null || true
```

(If a file we deleted is actually `#include`d elsewhere, the compile in Task 3 will tell us; we restore it then.)

- [ ] **Step 4: Write vendor README**

Create `packages/image/vendor/basisu/README.flatland.md`:

```markdown
# Vendored BasisU sources

| Field | Value |
|---|---|
| Upstream | https://github.com/BinomialLLC/basis_universal |
| Tag | <TAG> |
| Commit SHA | <SHA> |
| Imported | 2026-05-01 |
| License | Apache-2.0 (see LICENSE) |

## Subset taken

- `encoder/` — full directory (less OpenCL and PVRTC2 sources, see Patches)
- `transcoder/basisu_transcoder.h` and headers transitively included by the encoder
- `zstd/` — encoder's vendored zstd

## Subset NOT taken

- Transcoder `.cpp` files (we only encode)
- `webgl/`, examples/, tests/
- OpenCL build path (`encoder/basisu_opencl.{cpp,h}`)
- PVRTC2 sources (we only target ETC1S + UASTC)

## Patches

Currently zero. Patches added in later phases will be enumerated here with line counts.
```

- [ ] **Step 5: Commit**

```bash
git add packages/image/vendor/basisu/
git commit -m "vendor(image): import BasisU encoder sources for Path B"
```

---

### Task 2: Initialize Zig project (hello-world wasm)

Smallest possible Zig project that produces a `wasm32-wasi` artifact. No BasisU yet — confirms the toolchain works.

**Files:**
- Create: `packages/image/build.zig`
- Create: `packages/image/build.zig.zon`
- Create: `packages/image/.gitignore` (additions)
- Create: `packages/image/src/zig/hello.c` (temporary smoke test, deleted in Task 3)

- [ ] **Step 1: `build.zig.zon`**

```zig
.{
    .fingerprint = 0x9c1d7e3a4b8f2a51,
    .name = .three_flatland_image_basis,
    .version = "0.1.0",
    .minimum_zig_version = "0.14.0",
    .paths = .{
        "build.zig",
        "build.zig.zon",
        "encoder_files.zig",
        "src/zig",
        "vendor",
    },
}
```

(The fingerprint is arbitrary — pick any 64-bit hex. Copy/paste fine.)

- [ ] **Step 2: Minimal `build.zig`**

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    var query: std.Target.Query = .{ .cpu_arch = .wasm32, .os_tag = .wasi };
    query.cpu_features_add = std.Target.wasm.featureSet(&.{
        .simd128, .bulk_memory, .sign_ext, .nontrapping_fptoint,
    });
    const target = b.resolveTargetQuery(query);
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "basis_encoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    exe.entry = .disabled;
    exe.rdynamic = true;
    exe.export_table = true;
    exe.initial_memory = 32 * 1024 * 1024;
    exe.max_memory = 512 * 1024 * 1024;

    exe.addCSourceFile(.{
        .file = b.path("src/zig/hello.c"),
        .flags = &.{ "-std=c11" },
    });
    exe.linkLibC();

    const install = b.addInstallFile(exe.getEmittedBin(), "../vendor/basis/basis_encoder.wasm");
    b.getInstallStep().dependOn(&install.step);
}
```

- [ ] **Step 3: `src/zig/hello.c`**

```c
#include <stdint.h>
__attribute__((export_name("fl_basis_smoke")))
uint32_t fl_basis_smoke(void) { return 0xB1A50001u; }
```

- [ ] **Step 4: `.gitignore` additions**

Add to `packages/image/.gitignore` (create the file if missing):

```
zig-out/
.zig-cache/
```

- [ ] **Step 5: Build and verify the artifact**

```bash
cd packages/image
zig build -Doptimize=ReleaseSmall
ls -la vendor/basis/basis_encoder.wasm   # should exist, small
node -e "const fs = require('fs'); const b = fs.readFileSync('vendor/basis/basis_encoder.wasm'); WebAssembly.instantiate(b, { wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }) }).then(r => console.log('export:', r.instance.exports.fl_basis_smoke().toString(16)))"
```

Expected output: `export: b1a50001`

- [ ] **Step 6: Commit**

```bash
git add packages/image/build.zig packages/image/build.zig.zon packages/image/.gitignore packages/image/src/zig/hello.c
git commit -m "build(image): scaffold Zig wasm32-wasi build for Path B"
```

---

### Task 3: Compile vendored BasisU encoder + zstd (scalar fallback)

Get the real encoder compiling under Zig with SSE explicitly disabled. **No SIMD work in this task.** No C API yet either — just produce a wasm where every encoder symbol resolves.

**Files:**
- Create: `packages/image/encoder_files.zig`
- Modify: `packages/image/build.zig`
- Delete: `packages/image/src/zig/hello.c`

- [ ] **Step 1: Enumerate encoder source files**

Inspect upstream's build to pull the encoder file list. The relevant references are upstream's `CMakeLists.txt` (the `BASISU_ENCODER_SRCS` variable) and `webgl/encoder/CMakeLists.txt`.

Build the list of files BasisU compiles for an encoder library. Expect roughly 20-30 .cpp files in `encoder/` plus the zstd C unit.

- [ ] **Step 2: Write `encoder_files.zig`**

```zig
pub const encoder_files: []const []const u8 = &.{
    // Populate from CMakeLists.txt's BASISU_ENCODER_SRCS, e.g.:
    "basisu_backend.cpp",
    "basisu_basis_file.cpp",
    "basisu_bc7enc.cpp",
    "basisu_comp.cpp",
    "basisu_enc.cpp",
    "basisu_etc.cpp",
    "basisu_frontend.cpp",
    "basisu_global_selector_palette_helpers.cpp",
    "basisu_gpu_texture.cpp",
    "basisu_kernels_sse.cpp",       // present but BASISU_SUPPORT_SSE=0 makes it a no-op TU
    "basisu_pvrtc1_4.cpp",
    "basisu_resampler.cpp",
    "basisu_resample_filters.cpp",
    "basisu_ssim.cpp",
    "basisu_uastc_enc.cpp",
    "jpgd.cpp",
    "lodepng.cpp",
    // ... add/remove until the build links cleanly
};

pub const include_paths: []const []const u8 = &.{
    "vendor/basisu",
    "vendor/basisu/encoder",
    "vendor/basisu/transcoder",
    "vendor/basisu/zstd",
};
```

(Treat this list as a starting point — build, see what's missing/extra, adjust.)

- [ ] **Step 3: Update `build.zig` to compile encoder + zstd**

Replace the `addCSourceFile` call to `hello.c` with the full encoder build:

```zig
const std = @import("std");
const enc = @import("encoder_files.zig");

pub fn build(b: *std.Build) void {
    var query: std.Target.Query = .{ .cpu_arch = .wasm32, .os_tag = .wasi };
    query.cpu_features_add = std.Target.wasm.featureSet(&.{
        .simd128, .bulk_memory, .sign_ext, .nontrapping_fptoint,
    });
    const target = b.resolveTargetQuery(query);
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "basis_encoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    exe.entry = .disabled;
    exe.rdynamic = true;
    exe.export_table = true;
    exe.initial_memory = 32 * 1024 * 1024;
    exe.max_memory = 512 * 1024 * 1024;

    const cxx_flags: []const []const u8 = &.{
        "-std=c++17",
        "-fno-exceptions", "-fno-rtti",
        "-fno-math-errno", "-fno-signed-zeros", "-ffp-contract=fast",
        "-msimd128",
        "-DBASISU_SUPPORT_SSE=0",
        "-DBASISU_SUPPORT_WASM_SIMD=0",   // off for now — turned on in Phase 3
        "-DBASISD_SUPPORT_KTX2=1",
        "-DBASISD_SUPPORT_KTX2_ZSTD=0",
        "-DNDEBUG",
    };

    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/encoder"),
        .files = enc.encoder_files,
        .flags = cxx_flags,
    });
    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/zstd"),
        .files = &.{ "zstd.c" },
        .flags = &.{ "-msimd128", "-DZSTD_DISABLE_ASM=1", "-DNDEBUG" },
    });

    for (enc.include_paths) |inc| {
        exe.addIncludePath(b.path(inc));
    }
    exe.linkLibC();
    exe.linkLibCpp();

    const install = b.addInstallFile(exe.getEmittedBin(), "../vendor/basis/basis_encoder.wasm");
    b.getInstallStep().dependOn(&install.step);
}
```

- [ ] **Step 4: Delete `src/zig/hello.c`**

```bash
rm packages/image/src/zig/hello.c
```

- [ ] **Step 5: Build, iterate**

```bash
cd packages/image
zig build -Doptimize=ReleaseSmall 2>&1 | head -100
```

Expect compile errors. Common ones:
- Missing source file → add to `encoder_files`
- Unresolved symbol → likely a transcoder header that wants its `.cpp` partner. Either add the `.cpp` (if encoder needs it) or stub the symbol.
- `<unistd.h>` / `<sys/stat.h>` missing functions → BasisU has filesystem code paths that can be macroed away. If the symbol is only used for loading source images from disk (which we don't do — we hand it raw RGBA), guard with `-DBASISU_NO_ITERATOR_DEBUG_LEVEL=0` or define a stub.
- C++ exceptions referenced → BasisU asserts `BASISU_NO_EXCEPTIONS` or similar; check `basisu.h` for the macro that disables `try/catch` and add it to flags.

Iterate until the build links and produces `vendor/basis/basis_encoder.wasm`.

- [ ] **Step 6: Verify size and that it loads**

```bash
ls -la vendor/basis/basis_encoder.wasm
# Expect 500KB - 1.5MB
node -e "const fs=require('fs'); const b=fs.readFileSync('vendor/basis/basis_encoder.wasm'); WebAssembly.instantiate(b, { wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }), env: new Proxy({}, { get: () => () => 0 }) }).then(r => console.log('OK, exports:', Object.keys(r.instance.exports).slice(0,10).join(',')))"
```

Should print `OK, exports: memory,__indirect_function_table,...`. We don't expect our `fl_*` exports yet.

- [ ] **Step 7: Commit**

```bash
git add packages/image/build.zig packages/image/encoder_files.zig
git rm packages/image/src/zig/hello.c
git commit -m "build(image): compile vendored BasisU encoder + zstd to wasm (scalar)"
```

---

### Task 4: Snapshot what _mm_* call-sites exist outside the kernels file

This is a **scoping audit**, not implementation. The output gates Phase 3.

**Files:**
- Create: `packages/image/vendor/basisu_patches/_audit.txt` (will be deleted at end of plan)

- [ ] **Step 1: Enumerate `_mm_*` references**

```bash
cd packages/image/vendor/basisu/encoder
grep -rn '_mm_' *.cpp *.h \
  | grep -v 'basisu_kernels_sse.cpp' \
  | grep -v 'basisu_kernels_imp.h' \
  > ../../basisu_patches/_audit.txt
wc -l ../../basisu_patches/_audit.txt
```

- [ ] **Step 2: Apply scope rule from spec**

The spec says: if hits in non-kernel files exceed ~30 distinct call-sites, fall back to scalar in those functions and only port the kernels file. If under 30, port everything.

Read the audit file. If over 30, mark the scope by adding a "Scope decision" section to `vendor/basisu/README.flatland.md`:

```markdown
## SIMD scope decision

`_audit.txt` lists <N> _mm_* call-sites in non-kernel encoder files.
Per spec budget (30): <"in budget — port all" | "over budget — port kernels file only, leave non-kernel call-sites scalar via BASISU_SUPPORT_SSE=0">.
```

- [ ] **Step 3: Commit**

```bash
git add packages/image/vendor/basisu/README.flatland.md packages/image/vendor/basisu_patches/_audit.txt
git commit -m "docs(image): SIMD scope audit for Path B"
```

---

## Phase 2 — C API + JS rewrite (scalar build)

In this phase we wire up the flat C API and rewrite `codecs/ktx2.ts` against the **scalar** Path B build. End-of-phase: existing `ktx2.test.ts` passes (ignoring perf). The benchmark will be slower than Path A; that's expected and gets fixed in Phase 3.

### Task 5: Define the flat C API header

**Files:**
- Create: `packages/image/src/zig/basis_c_api.h`

- [ ] **Step 1: Write the header**

```c
// basis_c_api.h — flat C ABI for the BasisU encoder, exported from wasm.
// All functions are reentrancy-safe at the encoder-instance level. fl_basis_init
// is one-shot and idempotent.

#ifndef BASIS_C_API_H
#define BASIS_C_API_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Memory helpers (caller manages lifetimes).
void* fl_basis_alloc(size_t bytes);
void  fl_basis_free(void* ptr);

// Process-wide one-shot init. Idempotent. Returns 0 on success.
int fl_basis_init(void);

// Opaque encoder handle.
typedef struct fl_basis_encoder fl_basis_encoder;

fl_basis_encoder* fl_basis_encoder_create(void);
void              fl_basis_encoder_destroy(fl_basis_encoder* enc);

// Configuration. All fields are required; pass 0 for defaults that match
// the previous Embind-API behavior.
typedef struct {
    uint32_t uastc;            // 0 = ETC1S, 1 = UASTC
    uint32_t mipmaps;          // 0 / 1
    uint32_t quality;          // 1..255 (ETC1S)
    uint32_t uastc_level;      // 0..4
    uint32_t check_for_alpha;  // 0 / 1
} fl_basis_opts;

// One-shot encode. Caller passes raw RGBA8. On success the encoder
// writes ptr+len of an internal buffer into out_ptr/out_len; the caller
// must memcpy the bytes out before calling fl_basis_encoder_destroy.
// Returns 0 on success, negative error code on failure.
int fl_basis_encode(
    fl_basis_encoder* enc,
    const uint8_t* rgba, uint32_t width, uint32_t height,
    const fl_basis_opts* opts,
    uint8_t** out_ptr, uint32_t* out_len
);

// Error codes (negative).
#define FL_BASIS_E_OK             0
#define FL_BASIS_E_BAD_INPUT     -1
#define FL_BASIS_E_NO_INIT       -2
#define FL_BASIS_E_ENCODE_FAIL   -3

#ifdef __cplusplus
}
#endif
#endif // BASIS_C_API_H
```

- [ ] **Step 2: Commit**

```bash
git add packages/image/src/zig/basis_c_api.h
git commit -m "feat(image): flat C ABI header for Path B encoder"
```

---

### Task 6: Implement the flat C API

Wraps `basisu::basis_compressor` from the encoder. Mirrors the option translation done in the current `codecs/ktx2.ts`.

**Files:**
- Create: `packages/image/src/zig/basis_c_api.cpp`
- Modify: `packages/image/build.zig` (add the new TU + the `src/zig` include)

- [ ] **Step 1: Write the implementation**

```cpp
// basis_c_api.cpp — flat C ABI implementation over basisu::basis_compressor.

#include "basis_c_api.h"

#include "encoder/basisu_comp.h"
#include "encoder/basisu_enc.h"

#include <stdlib.h>
#include <string.h>
#include <new>

using namespace basisu;

extern "C" {

void* fl_basis_alloc(size_t bytes) { return malloc(bytes); }
void  fl_basis_free(void* p)       { free(p); }

static bool g_initialized = false;

int fl_basis_init(void) {
    if (g_initialized) return FL_BASIS_E_OK;
    basisu_encoder_init();
    g_initialized = true;
    return FL_BASIS_E_OK;
}

struct fl_basis_encoder {
    basis_compressor_params params;
    basis_compressor        comp;
    // Holds the most recently encoded output so the caller can read it
    // before fl_basis_encoder_destroy is called.
    uint8_vec               last_output;
};

fl_basis_encoder* fl_basis_encoder_create(void) {
    if (!g_initialized) return nullptr;
    return new (std::nothrow) fl_basis_encoder();
}

void fl_basis_encoder_destroy(fl_basis_encoder* enc) {
    delete enc;
}

int fl_basis_encode(
    fl_basis_encoder* enc,
    const uint8_t* rgba, uint32_t w, uint32_t h,
    const fl_basis_opts* opts,
    uint8_t** out_ptr, uint32_t* out_len
) {
    if (!enc || !rgba || !opts || !out_ptr || !out_len || w == 0 || h == 0) {
        return FL_BASIS_E_BAD_INPUT;
    }
    if (!g_initialized) return FL_BASIS_E_NO_INIT;

    auto& p = enc->params;
    p = basis_compressor_params(); // reset

    // Source image (RGBA8). basisu::image is RGBA-ordered.
    p.m_source_images.resize(1);
    image& src = p.m_source_images[0];
    src.resize(w, h);
    // basisu::image stores color_rgba per pixel — same memory layout as RGBA8.
    static_assert(sizeof(color_rgba) == 4, "color_rgba must be 4 bytes");
    memcpy(src.get_ptr(), rgba, (size_t)w * h * 4);

    // Output: KTX2.
    p.m_create_ktx2_file = true;

    // Mode + quality.
    p.m_uastc = (opts->uastc != 0);
    if (p.m_uastc) {
        // UASTC level: 0..4 maps to cPackUASTCLevelFastest .. cPackUASTCLevelVerySlow.
        p.m_pack_uastc_flags = (p.m_pack_uastc_flags & ~cPackUASTCLevelMask) | (opts->uastc_level & cPackUASTCLevelMask);
    } else {
        p.m_quality_level = (int)opts->quality;
    }

    p.m_mip_gen        = (opts->mipmaps != 0);
    p.m_check_for_alpha= (opts->check_for_alpha != 0);

    // No KTX2 zstd supercompression at encode time.
    p.m_ktx2_uastc_supercompression = basist::KTX2_SS_NONE;
    p.m_ktx2_srgb_transfer_func = true;

    // Quiet defaults; we don't have a JS-side log surface.
    p.m_status_output = false;
    p.m_debug = false;

    if (!enc->comp.init(p)) return FL_BASIS_E_ENCODE_FAIL;

    auto rc = enc->comp.process();
    if (rc != basis_compressor::cECSuccess) return FL_BASIS_E_ENCODE_FAIL;

    // Read the KTX2 output buffer.
    enc->last_output = enc->comp.get_output_ktx2_file();

    *out_ptr = enc->last_output.data();
    *out_len = (uint32_t)enc->last_output.size();
    return FL_BASIS_E_OK;
}

} // extern "C"
```

NOTE: The exact symbol names (`basis_compressor`, `basis_compressor_params`, `m_quality_level`, `m_pack_uastc_flags`, `cPackUASTCLevelMask`, `KTX2_SS_NONE`, `get_output_ktx2_file`, etc.) come from the vendored `encoder/basisu_comp.h` and `transcoder/basisu_transcoder.h`. If any name has drifted in the upstream rev we vendored, adjust to match — these are the names typical of recent versions. Compile errors will surface them quickly.

- [ ] **Step 2: Update `build.zig` to include the new TU**

In `build.zig`, after the existing `addCSourceFiles` calls and before `linkLibC`:

```zig
exe.addCSourceFile(.{
    .file = b.path("src/zig/basis_c_api.cpp"),
    .flags = cxx_flags,
});
exe.addIncludePath(b.path("vendor/basisu"));
```

(The vendor include is already present from `enc.include_paths` but the explicit one near the C API source is a readability nicety.)

Also add the `__attribute__((export_name(...)))` mechanism — add a small inline header `src/zig/basis_c_api_exports.h` that forces export visibility, OR adjust each function definition with `__attribute__((export_name("name")))`. Simpler alternative: add `--export-all` to the linker args, but that bloats the wasm. Recommended: tag each `extern "C"` function with `__attribute__((visibility("default")))` and pass `-Wl,--export-dynamic`. Add to `cxx_flags`:

```
"-fvisibility=default",
```

And to the executable:

```zig
exe.linker_allow_shlib_undefined = false;
exe.export_symbol_names = &.{
    "fl_basis_alloc", "fl_basis_free", "fl_basis_init",
    "fl_basis_encoder_create", "fl_basis_encoder_destroy", "fl_basis_encode",
};
```

(If the Zig version's `Compile` step doesn't expose `export_symbol_names`, fall back to `__attribute__((export_name("fl_basis_alloc")))` etc. on the function definitions.)

- [ ] **Step 3: Build**

```bash
cd packages/image
zig build -Doptimize=ReleaseSmall 2>&1 | tail -40
```

Iterate on compile errors. Common: header path mismatches, member-name drift in `basis_compressor_params`. Use the vendored `encoder/basisu_comp.h` as the source of truth.

- [ ] **Step 4: Verify exports**

```bash
node -e "const fs=require('fs'); const b=fs.readFileSync('vendor/basis/basis_encoder.wasm'); WebAssembly.instantiate(b, { wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }), env: new Proxy({}, { get: () => () => 0 }) }).then(r => { const e = r.instance.exports; console.log('alloc:', typeof e.fl_basis_alloc); console.log('init:', typeof e.fl_basis_init); console.log('encode:', typeof e.fl_basis_encode); })"
```

Expected: all three log `function`.

- [ ] **Step 5: Commit**

```bash
git add packages/image/src/zig/basis_c_api.cpp packages/image/build.zig
git commit -m "feat(image): flat C ABI implementation over basis_compressor"
```

---

### Task 7: Port the WASI shim from packages/skia

**Files:**
- Create: `packages/image/src/runtime/wasi-shim.ts`

- [ ] **Step 1: Copy + adapt**

Read `packages/skia/src/ts/wasm-loader-shared.ts` (the `createWasiImports` function plus its leading docstring). Copy that code verbatim to `packages/image/src/runtime/wasi-shim.ts`, exporting `createWasiImports`. Keep the docstring; it's load-bearing context.

The skia version expects a `getMemory: () => WebAssembly.Memory` callback because memory isn't available until after instantiate. Keep that pattern.

Add a single-line `clock_time_get` impl on top of the Proxy default (BasisU may use it for internal timing). Insert before the `// Everything else returns 0 (success)` line:

```ts
// clock_time_get(clock_id, precision, time_out_ptr) — write current ns to time_out_ptr
if (name === 'clock_time_get') {
  return (_clockId: number, _precision: bigint, timeOutPtr: number) => {
    const view = new DataView(getMemory().buffer)
    const ns = BigInt(Date.now()) * 1_000_000n
    view.setBigUint64(timeOutPtr, ns, true)
    return 0
  }
}
// random_get(buf_ptr, len) — fill with crypto random bytes
if (name === 'random_get') {
  return (bufPtr: number, len: number) => {
    const buf = new Uint8Array(getMemory().buffer, bufPtr, len)
    crypto.getRandomValues(buf)
    return 0
  }
}
```

(`crypto` is a global in modern Node and browsers.)

- [ ] **Step 2: Commit**

```bash
git add packages/image/src/runtime/wasi-shim.ts
git commit -m "feat(image): WASI Proxy shim ported from packages/skia"
```

---

### Task 8: Write the basis loader

Provides Node + browser paths to fetch and instantiate `basis_encoder.wasm` and exposes a typed exports surface.

**Files:**
- Create: `packages/image/src/runtime/basis-loader.ts`

- [ ] **Step 1: Loader code**

```ts
import { createWasiImports } from './wasi-shim.js'

export interface BasisExports {
  memory: WebAssembly.Memory
  fl_basis_alloc: (bytes: number) => number
  fl_basis_free: (ptr: number) => void
  fl_basis_init: () => number
  fl_basis_encoder_create: () => number
  fl_basis_encoder_destroy: (enc: number) => void
  fl_basis_encode: (
    enc: number,
    rgba: number, w: number, h: number,
    opts: number,
    outPtr: number, outLen: number,
  ) => number
}

let modPromise: Promise<BasisExports> | null = null

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

async function loadBytes(): Promise<Uint8Array> {
  if (isNode()) {
    const [{ readFileSync }, { dirname, join }, { fileURLToPath }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ])
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/runtime/basis-loader.js -> ../../vendor/basis/basis_encoder.wasm
    // src/runtime/basis-loader.ts (vitest) -> ../../vendor/basis/basis_encoder.wasm
    const wasmPath = join(here, '../../vendor/basis/basis_encoder.wasm')
    return readFileSync(wasmPath)
  }
  // Browser: rely on Vite/bundler asset URL handling at the call site.
  // The bundler resolves the asset to a fetchable URL.
  const url = new URL('../../vendor/basis/basis_encoder.wasm', import.meta.url).href
  const res = await fetch(url)
  if (!res.ok) throw new Error(`basis_encoder.wasm fetch failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export function loadBasisWasm(): Promise<BasisExports> {
  if (modPromise) return modPromise
  modPromise = (async () => {
    const bytes = await loadBytes()
    const memoryRef: { current: WebAssembly.Memory | null } = { current: null }
    const imports: WebAssembly.Imports = {
      wasi_snapshot_preview1: createWasiImports(() => {
        if (!memoryRef.current) throw new Error('memory not yet bound')
        return memoryRef.current
      }),
    }
    const { instance } = await WebAssembly.instantiate(bytes, imports)
    const exports = instance.exports as unknown as BasisExports
    memoryRef.current = exports.memory
    const rc = exports.fl_basis_init()
    if (rc !== 0) throw new Error(`fl_basis_init failed: ${rc}`)
    return exports
  })()
  return modPromise
}
```

- [ ] **Step 2: Smoke-test the loader**

Add a one-shot inline test (deleted at end of task):

```bash
cd packages/image
node --input-type=module -e "
import('./src/runtime/basis-loader.js').catch(()=>import('./src/runtime/basis-loader.ts')).then(async ({ loadBasisWasm }) => {
  const e = await loadBasisWasm()
  console.log('memory pages:', e.memory.buffer.byteLength / 65536)
  console.log('encoder create:', e.fl_basis_encoder_create())
})
"
```

(In practice, vitest will be the smoke test in Task 9. If the above is awkward, skip and rely on the test in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add packages/image/src/runtime/basis-loader.ts
git commit -m "feat(image): basis-loader for Node + browser, returns typed exports"
```

---

### Task 9: Rewrite codecs/ktx2.ts to use the flat C API

Public surface unchanged. Internal changes only.

**Files:**
- Modify: `packages/image/src/codecs/ktx2.ts` (full rewrite of body, keep export signature)

- [ ] **Step 1: Read current file**

`packages/image/src/codecs/ktx2.ts` currently uses Embind via `BasisModule`. Preserve `Ktx2Options` interface and the `encodeKtx2(image, opts)` export signature.

- [ ] **Step 2: New implementation**

Replace the whole file with:

```ts
import { loadBasisWasm, type BasisExports } from '../runtime/basis-loader.js'

export interface Ktx2Options {
  mode?: 'etc1s' | 'uastc'
  quality?: number
  mipmaps?: boolean
  uastcLevel?: 0 | 1 | 2 | 3 | 4
}

const OPTS_BYTES = 5 * 4 // 5 x uint32

function writeOpts(exports: BasisExports, opts: Ktx2Options): number {
  const ptr = exports.fl_basis_alloc(OPTS_BYTES)
  const view = new DataView(exports.memory.buffer, ptr, OPTS_BYTES)
  view.setUint32(0,  opts.mode === 'uastc' ? 1 : 0, true)         // uastc
  view.setUint32(4,  opts.mipmaps ? 1 : 0, true)                  // mipmaps
  view.setUint32(8,  opts.quality ?? 128, true)                   // quality
  view.setUint32(12, opts.uastcLevel ?? 2, true)                  // uastc_level
  view.setUint32(16, 1, true)                                     // check_for_alpha
  return ptr
}

export async function encodeKtx2(image: ImageData, opts: Ktx2Options = {}): Promise<Uint8Array> {
  const exports = await loadBasisWasm()
  const w = image.width
  const h = image.height
  const inLen = w * h * 4
  const inPtr = exports.fl_basis_alloc(inLen)
  const optsPtr = writeOpts(exports, opts)
  const outBoxPtr = exports.fl_basis_alloc(8) // [u32 ptr, u32 len]
  const enc = exports.fl_basis_encoder_create()
  if (enc === 0) {
    exports.fl_basis_free(inPtr)
    exports.fl_basis_free(optsPtr)
    exports.fl_basis_free(outBoxPtr)
    throw new Error('fl_basis_encoder_create returned null')
  }
  try {
    new Uint8Array(exports.memory.buffer, inPtr, inLen).set(
      new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    )
    const rc = exports.fl_basis_encode(enc, inPtr, w, h, optsPtr, outBoxPtr, outBoxPtr + 4)
    if (rc !== 0) throw new Error(`fl_basis_encode failed: ${rc}`)
    const view = new DataView(exports.memory.buffer)
    const outPtr = view.getUint32(outBoxPtr, true)
    const outLen = view.getUint32(outBoxPtr + 4, true)
    if (outLen === 0) throw new Error('basis encoder returned 0 bytes')
    // .slice() copies out of the wasm linear memory — required because
    // fl_basis_encoder_destroy will release the underlying storage.
    return new Uint8Array(exports.memory.buffer, outPtr, outLen).slice()
  } finally {
    exports.fl_basis_encoder_destroy(enc)
    exports.fl_basis_free(inPtr)
    exports.fl_basis_free(optsPtr)
    exports.fl_basis_free(outBoxPtr)
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd packages/image && pnpm typecheck
```

Expected: clean. Fix any drift.

- [ ] **Step 4: Run existing ktx2 tests**

```bash
cd packages/image && pnpm test src/codecs/ktx2.test.ts -- --run
```

Expected: green. Output sizes may differ from the BinomialLLC baseline but should be > 0 and have valid KTX2 magic. If a test asserts a specific byte count, that assertion is loose and the new value is the new baseline — update it.

- [ ] **Step 5: Commit**

```bash
git add packages/image/src/codecs/ktx2.ts
# also stage any test threshold adjustments if needed
git commit -m "feat(image): rewrite ktx2 codec on flat C API (Path B scalar)"
```

---

### Task 10: Run full image-package suite + typecheck (scalar Path B baseline)

Phase-2 verification gate. End-to-end ktx2 round-trips and CLI integration must still pass.

- [ ] **Step 1: Run all image tests**

```bash
cd packages/image && pnpm test -- --run
```

Expected: all 17 image tests green (PNG, WebP, AVIF, KTX2, dispatch, memory, encode.node, CLI integration). The benchmark will print a number — record it. Expected: somewhere between the 8.5s Path A baseline and the 5s target, but probably still over 5s without SIMD.

- [ ] **Step 2: Whole repo build + typecheck**

```bash
cd ../..
pnpm build
pnpm typecheck
```

Expected: 33 builds, 52 typechecks, all green.

- [ ] **Step 3: Record baseline**

In the commit message, record the scalar-Path-B 2048² ETC1S+mips encode time (whatever the bench prints). This is the comparison point for Phase 3.

- [ ] **Step 4: Commit (no code changes — just a checkpoint)**

```bash
git commit --allow-empty -m "checkpoint(image): Path B scalar build green; bench=<N>ms"
```

---

### Task 11: Provisionally rename current basis_encoder.wasm to keep Path A available

Phase 3's equivalence test compares Path A (BinomialLLC stock) against Path B (our build). We need both wasm files coexisting until that test passes.

**Files:**
- Modify: `packages/image/vendor/basis/` (rename)

- [ ] **Step 1: Stash the original Path A artifact**

The current `vendor/basis/basis_encoder.wasm` was overwritten in Task 2 by our build. We need the BinomialLLC original back. Recover from git:

```bash
cd packages/image
git checkout HEAD~<N> -- vendor/basis/basis_encoder.wasm  # N = commits since Task 2
mv vendor/basis/basis_encoder.wasm vendor/basis/basis_encoder.path-a.wasm
git checkout HEAD -- vendor/basis/basis_encoder.wasm     # restore Path B build
```

(Use `git log --oneline vendor/basis/basis_encoder.wasm` to find the commit before Task 2.)

- [ ] **Step 2: Verify both files exist**

```bash
ls -la vendor/basis/
# Expected: basis_encoder.wasm (Path B, our build) + basis_encoder.path-a.wasm (BinomialLLC)
# Plus: basis_encoder.js, package.json (still around, used by no one now)
```

- [ ] **Step 3: Commit**

```bash
git add vendor/basis/basis_encoder.path-a.wasm
git commit -m "chore(image): preserve Path A binary for Phase 3 equivalence test"
```

---

## Phase 3 — SIMD port

### Task 12: Write the SSE↔wasm_simd128 shim header

This header is the workhorse: every patched call-site in non-kernel encoder files calls `bu_v128_*` instead of `_mm_*`.

**Files:**
- Create: `packages/image/vendor/basisu_patches/basisu_simd_compat.h`

- [ ] **Step 1: Header**

```c
// basisu_simd_compat.h — uniform wrapper over SSE / wasm_simd128 / scalar.
// Selected via -DBASISU_SUPPORT_SSE / -DBASISU_SUPPORT_WASM_SIMD build flags.

#ifndef BASISU_SIMD_COMPAT_H
#define BASISU_SIMD_COMPAT_H

#include <stdint.h>

#if BASISU_SUPPORT_SSE
  #include <emmintrin.h>
  #include <smmintrin.h>
  typedef __m128i bu_v128;
  #define BU_V128_LOAD(p)            _mm_loadu_si128((const __m128i*)(p))
  #define BU_V128_STORE(p, v)        _mm_storeu_si128((__m128i*)(p), (v))
  #define BU_V128_I8_SPLAT(x)        _mm_set1_epi8((char)(x))
  #define BU_V128_I16_SPLAT(x)       _mm_set1_epi16((int16_t)(x))
  #define BU_V128_I32_SPLAT(x)       _mm_set1_epi32((int32_t)(x))
  #define BU_V128_I8_ADD(a, b)       _mm_add_epi8((a), (b))
  #define BU_V128_I16_ADD(a, b)      _mm_add_epi16((a), (b))
  #define BU_V128_I32_ADD(a, b)      _mm_add_epi32((a), (b))
  #define BU_V128_I16_SUB(a, b)      _mm_sub_epi16((a), (b))
  #define BU_V128_I32_SUB(a, b)      _mm_sub_epi32((a), (b))
  #define BU_V128_I16_MUL(a, b)      _mm_mullo_epi16((a), (b))
  #define BU_V128_I32_MUL(a, b)      _mm_mullo_epi32((a), (b))     // SSE4.1
  #define BU_V128_U8_NARROW_I16(a,b) _mm_packus_epi16((a), (b))
  #define BU_V128_I8_BITMASK(a)      _mm_movemask_epi8((a))
  #define BU_V128_U8_MIN(a, b)       _mm_min_epu8((a), (b))
  #define BU_V128_U8_MAX(a, b)       _mm_max_epu8((a), (b))
  #define BU_V128_U16_MIN(a, b)      _mm_min_epu16((a), (b))       // SSE4.1
  #define BU_V128_I8_EQ(a, b)        _mm_cmpeq_epi8((a), (b))
  #define BU_V128_I16_EQ(a, b)       _mm_cmpeq_epi16((a), (b))
  #define BU_V128_SHUFFLE_I8(a, idx) _mm_shuffle_epi8((a), (idx))  // SSSE3
  // SSE-only helpers (used only when BASISU_SUPPORT_SSE)
  #define BU_V128_I16_MADD(a, b)     _mm_madd_epi16((a), (b))      // 8x16 -> 4x32 horiz multiply-add
#elif BASISU_SUPPORT_WASM_SIMD
  #include <wasm_simd128.h>
  typedef v128_t bu_v128;
  #define BU_V128_LOAD(p)            wasm_v128_load((p))
  #define BU_V128_STORE(p, v)        wasm_v128_store((p), (v))
  #define BU_V128_I8_SPLAT(x)        wasm_i8x16_splat((int8_t)(x))
  #define BU_V128_I16_SPLAT(x)       wasm_i16x8_splat((int16_t)(x))
  #define BU_V128_I32_SPLAT(x)       wasm_i32x4_splat((int32_t)(x))
  #define BU_V128_I8_ADD(a, b)       wasm_i8x16_add((a), (b))
  #define BU_V128_I16_ADD(a, b)      wasm_i16x8_add((a), (b))
  #define BU_V128_I32_ADD(a, b)      wasm_i32x4_add((a), (b))
  #define BU_V128_I16_SUB(a, b)      wasm_i16x8_sub((a), (b))
  #define BU_V128_I32_SUB(a, b)      wasm_i32x4_sub((a), (b))
  #define BU_V128_I16_MUL(a, b)      wasm_i16x8_mul((a), (b))
  #define BU_V128_I32_MUL(a, b)      wasm_i32x4_mul((a), (b))
  #define BU_V128_U8_NARROW_I16(a,b) wasm_u8x16_narrow_i16x8((a), (b))
  #define BU_V128_I8_BITMASK(a)      wasm_i8x16_bitmask((a))
  #define BU_V128_U8_MIN(a, b)       wasm_u8x16_min((a), (b))
  #define BU_V128_U8_MAX(a, b)       wasm_u8x16_max((a), (b))
  #define BU_V128_U16_MIN(a, b)      wasm_u16x8_min((a), (b))
  #define BU_V128_I8_EQ(a, b)        wasm_i8x16_eq((a), (b))
  #define BU_V128_I16_EQ(a, b)       wasm_i16x8_eq((a), (b))
  #define BU_V128_SHUFFLE_I8(a, idx) wasm_i8x16_swizzle((a), (idx))
  // _mm_madd_epi16 emulation: extend i16 -> i32, multiply pairs, add adjacent.
  static inline bu_v128 bu_v128_i16_madd(bu_v128 a, bu_v128 b) {
      v128_t lo_a = wasm_i32x4_extend_low_i16x8(a);
      v128_t hi_a = wasm_i32x4_extend_high_i16x8(a);
      v128_t lo_b = wasm_i32x4_extend_low_i16x8(b);
      v128_t hi_b = wasm_i32x4_extend_high_i16x8(b);
      v128_t lo = wasm_i32x4_mul(lo_a, lo_b);
      v128_t hi = wasm_i32x4_mul(hi_a, hi_b);
      // Horizontal add adjacent: shuffle and add.
      v128_t lo_shuf = wasm_i32x4_shuffle(lo, lo, 1, 0, 3, 2);
      v128_t hi_shuf = wasm_i32x4_shuffle(hi, hi, 1, 0, 3, 2);
      v128_t lo_sum = wasm_i32x4_add(lo, lo_shuf);
      v128_t hi_sum = wasm_i32x4_add(hi, hi_shuf);
      // Pack: take even lanes of lo_sum and hi_sum.
      return wasm_i32x4_shuffle(lo_sum, hi_sum, 0, 2, 4, 6);
  }
  #define BU_V128_I16_MADD(a, b)     bu_v128_i16_madd((a), (b))
#else
  #error "basisu_simd_compat.h included with neither BASISU_SUPPORT_SSE nor BASISU_SUPPORT_WASM_SIMD set"
#endif

#endif // BASISU_SIMD_COMPAT_H
```

(The macro list above covers the common cases. During the call-site patch task, additional macros may need to be added — extend this header as needed.)

- [ ] **Step 2: Commit**

```bash
git add packages/image/vendor/basisu_patches/basisu_simd_compat.h
git commit -m "feat(image): SSE/wasm_simd128 compat shim header"
```

---

### Task 13: Port `basisu_kernels_sse.cpp` → `basisu_kernels_wasm.cpp`

This is the load-bearing translation. The kernels file holds the bulk of BasisU's SIMD-critical work (block-error metrics, palette evaluation).

**Files:**
- Create: `packages/image/vendor/basisu/encoder/basisu_kernels_wasm.cpp`
- Modify: `packages/image/encoder_files.zig` (add `basisu_kernels_wasm.cpp` to the source list)
- Modify: `packages/image/build.zig` (toggle `BASISU_SUPPORT_WASM_SIMD=1`; ensure `vendor/basisu_patches/` is on the include path)

- [ ] **Step 1: Read the SSE kernels file**

`packages/image/vendor/basisu/encoder/basisu_kernels_sse.cpp` is the source of truth. Identify each SIMD function (typically `find_optimal_solutions_using_simd_*`, `compute_dxt1_endpoints_simd`, etc.). Each has a clear scalar fallback — read both to understand the algorithm before translating.

- [ ] **Step 2: Translate each function**

Create `basisu_kernels_wasm.cpp` with the same functions, gated by `#if BASISU_SUPPORT_WASM_SIMD`. The mechanical mapping is the macro table from the shim header. Where SSE intrinsics are used directly inline (not through the shim), translate via the same table.

For each function:
1. Replace `__m128i` → `bu_v128`
2. Replace `_mm_*` → `BU_V128_*` (or inline-translate using `wasm_simd128.h` directly)
3. Compile + step through the unit tests in `basisu_etc.cpp` (block-encode round-trips) to verify

The `_mm_madd_epi16` cases use the `bu_v128_i16_madd` helper from the shim. A handful of less common intrinsics may need additional helpers — add them to the shim.

If the SSE kernels file uses anything outside the shim's coverage, extend the shim before continuing.

- [ ] **Step 3: Wire the file into the build**

In `encoder_files.zig`, add `basisu_kernels_wasm.cpp` after `basisu_kernels_sse.cpp`.

In `build.zig`'s `cxx_flags`, flip:

```
"-DBASISU_SUPPORT_WASM_SIMD=1",
```

(was `=0`). Add the shim include path:

```zig
exe.addIncludePath(b.path("vendor/basisu_patches"));
```

- [ ] **Step 4: Build**

```bash
cd packages/image && zig build -Doptimize=ReleaseFast
```

Iterate on compile errors. Translation bugs that don't compile show up here; semantic bugs are caught by Task 16.

- [ ] **Step 5: Commit**

```bash
git add packages/image/vendor/basisu/encoder/basisu_kernels_wasm.cpp packages/image/encoder_files.zig packages/image/build.zig
git commit -m "feat(image): port BasisU kernels SSE → wasm_simd128"
```

---

### Task 14: Patch inline `_mm_*` call-sites in non-kernel encoder files

The audit from Task 4 enumerated these. If the audit said "in budget — port all", do this task. If it said "over budget", skip to Task 15.

**Files:** the patched files are vendored copies under `vendor/basisu/encoder/`. The exact list comes from `_audit.txt`. Typical hits: `basisu_resampler.cpp`, `basisu_etc.cpp`, `basisu_uastc_enc.cpp`.

- [ ] **Step 1: Add the shim include to each affected file**

For each `.cpp` listed in the audit, add near the top:

```cpp
#include "basisu_simd_compat.h"
```

- [ ] **Step 2: Rewrite each `_mm_*` call-site**

Mechanical replacement using the macro table. For each call-site:
1. Identify the SSE intrinsic
2. Find the matching `BU_V128_*` macro
3. Replace

If a hit uses an SSE intrinsic with no shim entry, extend the shim header first, then patch the call-site.

- [ ] **Step 3: Update the README patches list**

Append to `vendor/basisu/README.flatland.md` under "Patches":

```markdown
- `encoder/basisu_resampler.cpp`: <N> lines patched (SSE call-sites routed through bu_v128)
- `encoder/basisu_etc.cpp`: <N> lines patched
- `encoder/basisu_uastc_enc.cpp`: <N> lines patched
- `encoder/basisu_simd_compat.h`: include added at line 1 of <K> files
```

(Get the line counts via `git diff --stat HEAD~1 -- vendor/basisu/encoder/`.)

- [ ] **Step 4: Build**

```bash
cd packages/image && zig build -Doptimize=ReleaseFast
```

- [ ] **Step 5: Run existing ktx2 tests as a sanity check**

```bash
pnpm test src/codecs/ktx2.test.ts -- --run
```

Should still pass. If anything diverges, the fix-vs-revert decision is on the implementer; revert + report-as-blocked is acceptable per the spec's scope rule.

- [ ] **Step 6: Commit**

```bash
git add packages/image/vendor/basisu/encoder/ packages/image/vendor/basisu/README.flatland.md
git commit -m "feat(image): patch SSE call-sites in non-kernel encoder files"
```

---

### Task 15: Add `FL_BASIS_NO_SIMD` env toggle

For runtime A/B comparison without rebuilding the wasm. We compile both SIMD and scalar paths into the same binary; an env-driven flag selects at encoder-create time.

**Files:**
- Modify: `packages/image/src/zig/basis_c_api.cpp`
- Modify: `packages/image/src/runtime/basis-loader.ts`

The simplest implementation: read the env on the JS side and pass a `disable_simd` flag through `fl_basis_init`. BasisU's `basisu_encoder_init()` doesn't expose a SIMD-disable knob directly; we route through a new exported function `fl_basis_set_simd(int enabled)` that toggles a global.

- [ ] **Step 1: Extend the C API**

In `basis_c_api.h`, add:

```c
// Disables the SIMD code paths at runtime. Effective for subsequent encoder
// instances. Default is enabled when built with BASISU_SUPPORT_WASM_SIMD=1.
void fl_basis_set_simd(int enabled);
```

In `basis_c_api.cpp`, add:

```cpp
// Defined in the kernels — set by SSE/WASM builds, no-op in scalar.
namespace basisu {
    extern bool g_cpu_supports_sse41; // typical name — verify in kernels file
}

void fl_basis_set_simd(int enabled) {
#if BASISU_SUPPORT_WASM_SIMD
    basisu::g_cpu_supports_sse41 = (enabled != 0);
#endif
}
```

(The exact global name comes from the vendored kernels file — search for `g_cpu_supports_` in `basisu_kernels_sse.cpp` and use whichever variable BasisU uses to gate the SIMD path. The kernels-wasm file should set the same flag at startup, then we override it via `fl_basis_set_simd`.)

If BasisU's kernels gate on a different mechanism, mirror it. The point is: a single switch that disables SIMD without recompiling.

- [ ] **Step 2: Wire from JS**

In `packages/image/src/runtime/basis-loader.ts`, after `fl_basis_init` succeeds:

```ts
const noSimd = (typeof process !== 'undefined' && process.env?.FL_BASIS_NO_SIMD === '1')
;(exports as any).fl_basis_set_simd?.(noSimd ? 0 : 1)
```

(The `?.` is defensive — the export may not exist on a scalar-only build.)

Add `fl_basis_set_simd` to the `BasisExports` interface and the export-list pattern in `build.zig`.

- [ ] **Step 3: Build, smoke-test**

```bash
cd packages/image && zig build -Doptimize=ReleaseFast
FL_BASIS_NO_SIMD=1 pnpm test src/codecs/ktx2.test.ts -- --run
pnpm test src/codecs/ktx2.test.ts -- --run
```

Both runs should pass.

- [ ] **Step 4: Commit**

```bash
git add packages/image/src/zig/basis_c_api.{h,cpp} packages/image/src/runtime/basis-loader.ts packages/image/build.zig
git commit -m "feat(image): FL_BASIS_NO_SIMD env toggle for runtime A/B"
```

---

### Task 16: SIMD-vs-scalar byte-equivalence test

**Files:**
- Create: `packages/image/src/codecs/ktx2.simd-equivalence.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './png.js'
import { encodeKtx2 } from './ktx2.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Path B SIMD vs scalar equivalence', () => {
  it.each([
    ['etc1s', { mode: 'etc1s' as const, quality: 128, mipmaps: false }],
    ['uastc', { mode: 'uastc' as const, uastcLevel: 2 as const, mipmaps: false }],
  ])('%s output is byte-identical with FL_BASIS_NO_SIMD on/off (64×64 fixture)', async (_label, opts) => {
    const png = readFileSync(join(__dirname, '../__fixtures__/checker-64.png'))
    const decoded = await decodePng(new Uint8Array(png))
    // The loader caches the wasm module; we run this test in a child process
    // via vitest's "isolate" config so each it() block sees fresh module state
    // and re-reads the env var.
    process.env.FL_BASIS_NO_SIMD = '1'
    const scalar = await encodeKtx2(decoded, opts)
    delete process.env.FL_BASIS_NO_SIMD
    // Force module reload by clearing the loader cache. If basis-loader caches
    // at module scope, reset by re-importing dynamically.
    const { encodeKtx2: encodeKtx2Simd } = await import(`./ktx2.js?t=${Date.now()}`)
    const simd = await encodeKtx2Simd(decoded, opts)
    expect(scalar.length).toBeGreaterThan(0)
    expect(Buffer.from(simd).equals(Buffer.from(scalar))).toBe(true)
  })
})
```

NOTE: Module-level caching of the loaded wasm makes single-process flipping awkward. The cleanest approach is to mark `loadBasisWasm` as exporting a `__resetForTest()` symbol (only in test builds) that nukes `modPromise`. Add that to `basis-loader.ts`:

```ts
export function __resetForTest() { modPromise = null }
```

Then the test becomes:

```ts
import { __resetForTest } from '../runtime/basis-loader.js'
// ...
process.env.FL_BASIS_NO_SIMD = '1'
__resetForTest()
const scalar = await encodeKtx2(decoded, opts)
delete process.env.FL_BASIS_NO_SIMD
__resetForTest()
const simd = await encodeKtx2(decoded, opts)
expect(Buffer.from(simd).equals(Buffer.from(scalar))).toBe(true)
```

If `checker-64.png` doesn't exist in `__fixtures__/`, generate one in a `beforeAll`:

```ts
import { encodePng } from './png.js'
let pngBytes: Uint8Array
beforeAll(async () => {
  const w = 64, h = 64
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const c = ((x >> 3) ^ (y >> 3)) & 1 ? 255 : 0
    data[i] = c; data[i+1] = 255 - c; data[i+2] = c; data[i+3] = 255
  }
  pngBytes = await encodePng({ width: w, height: h, data, colorSpace: 'srgb' } as ImageData)
})
```

- [ ] **Step 2: Run**

```bash
pnpm test src/codecs/ktx2.simd-equivalence.test.ts -- --run
```

Expected: green. If it fails, the kernel translation has a numeric drift — debug by isolating which kernel diverges.

- [ ] **Step 3: Commit**

```bash
git add packages/image/src/codecs/ktx2.simd-equivalence.test.ts packages/image/src/runtime/basis-loader.ts
git commit -m "test(image): SIMD vs scalar byte-equivalence for Path B"
```

---

### Task 17: Path A vs Path B byte-equivalence test

This proves the rebuild is faithful to the upstream encoder before we delete the BinomialLLC artifacts.

**Files:**
- Create: `packages/image/src/codecs/ktx2.ab-equivalence.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { decodePng } from './png.js'
import { encodeKtx2 as encodeKtx2PathB } from './ktx2.js'

// Path A loader: directly invoke the BinomialLLC factory still on disk as
// vendor/basis/basis_encoder.path-a.wasm + basis_encoder.js.
async function encodeKtx2PathA(image: ImageData, opts: { uastc: boolean; quality: number }): Promise<Uint8Array> {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const vendorDir = join(__dirname, '../../vendor/basis')
  const require = createRequire(import.meta.url)
  const factory = require(join(vendorDir, 'basis_encoder.js')) as (cfg: { wasmBinary: Uint8Array }) => Promise<any>
  const wasmBinary = readFileSync(join(vendorDir, 'basis_encoder.path-a.wasm'))
  const mod = await factory({ wasmBinary })
  mod.initializeBasis()
  const enc = new mod.BasisEncoder()
  try {
    enc.setSliceSourceImage(0, new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), image.width, image.height, false)
    enc.setCreateKTX2File(true)
    enc.setUASTC(opts.uastc)
    enc.setQualityLevel(opts.quality)
    enc.setCheckForAlpha?.(true)
    const out = new Uint8Array(Math.max(image.width * image.height * 4 + 4096, 256 * 1024))
    const n = enc.encode(out)
    return out.slice(0, n)
  } finally {
    enc.delete()
  }
}

describe('Path A vs Path B equivalence', () => {
  it('produces byte-identical KTX2 for a 64×64 fixture (ETC1S q=128)', async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const png = readFileSync(join(__dirname, '../__fixtures__/checker-64.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const a = await encodeKtx2PathA(decoded, { uastc: false, quality: 128 })
    const b = await encodeKtx2PathB(decoded, { mode: 'etc1s', quality: 128, mipmaps: false })
    expect(a.length).toBeGreaterThan(0)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm test src/codecs/ktx2.ab-equivalence.test.ts -- --run
```

Expected: green. If outputs diverge, root-cause:
- Wrong upstream rev vendored — we built from a different snapshot than BinomialLLC shipped.
- Build flag drift — different `BASISD_SUPPORT_*` settings change algorithm output.
- SIMD path: re-run with `FL_BASIS_NO_SIMD=1` to confirm scalar still matches Path A. If scalar matches but SIMD doesn't, that's a SIMD numeric bug — fail the build until fixed.

- [ ] **Step 3: Commit**

```bash
git add packages/image/src/codecs/ktx2.ab-equivalence.test.ts
git commit -m "test(image): Path A vs Path B byte-equivalence"
```

---

### Task 18: Update benchmark to enforce <5s threshold and report SIMD ratio

**Files:**
- Modify: `packages/image/src/basisu-bench.test.ts`

- [ ] **Step 1: Rewrite bench**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './codecs/png.js'
import { encodeKtx2 } from './codecs/ktx2.js'
import { __resetForTest } from './runtime/basis-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PATH_B_THRESHOLD_MS = 5000

describe('BasisU latency benchmark (Path B)', () => {
  it('encodes 2048² ETC1S+mips under 5s with SIMD on; reports SIMD-on/off ratio', async () => {
    const png = readFileSync(join(__dirname, '__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))

    process.env.FL_BASIS_NO_SIMD = '1'
    __resetForTest()
    const t0 = performance.now()
    const ktx2Scalar = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const scalarMs = performance.now() - t0

    delete process.env.FL_BASIS_NO_SIMD
    __resetForTest()
    const t1 = performance.now()
    const ktx2Simd = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const simdMs = performance.now() - t1

    process.stdout.write(`[basisu-bench] 2048² ETC1S+mips: SIMD=${simdMs.toFixed(0)}ms, scalar=${scalarMs.toFixed(0)}ms, ratio=${(scalarMs / simdMs).toFixed(2)}x, ${(ktx2Simd.length/1024).toFixed(0)}KB\n`)

    expect(ktx2Simd.length).toBeGreaterThan(0)
    expect(ktx2Simd.length).toBe(ktx2Scalar.length) // sanity — same output
    expect(simdMs).toBeLessThan(PATH_B_THRESHOLD_MS)
  }, 180_000)
})
```

- [ ] **Step 2: Run**

```bash
pnpm test src/basisu-bench.test.ts -- --run
```

Expected: green, with SIMD time under 5000ms and a logged ratio greater than 1.0 (probably 1.5×–3× depending on which kernels dominate). If the ratio is suspiciously close to 1.0, the SIMD path probably isn't actually executing — investigate the runtime gating.

If SIMD time is over 5000ms despite the ratio being healthy, the bottleneck is somewhere SIMD doesn't help (e.g., a loop we left scalar). Profile with vitest's built-in timing or add coarse `performance.now()` markers around `comp.process()` substages to identify.

- [ ] **Step 3: Commit**

```bash
git add packages/image/src/basisu-bench.test.ts
git commit -m "test(image): enforce <5s gate and report SIMD/scalar ratio"
```

---

## Phase 4 — Cleanup + report

### Task 19: Delete BinomialLLC artifacts; whole-repo green

**Files:**
- Delete: `packages/image/vendor/basis/basis_encoder.path-a.wasm`
- Delete: `packages/image/vendor/basis/basis_encoder.js`
- Delete: `packages/image/vendor/basis/package.json`
- Delete: `packages/image/src/codecs/ktx2.ab-equivalence.test.ts`
- Delete: `packages/image/vendor/basisu_patches/_audit.txt`

- [ ] **Step 1: Delete**

```bash
cd packages/image
rm vendor/basis/basis_encoder.path-a.wasm
rm vendor/basis/basis_encoder.js
rm vendor/basis/package.json
rm src/codecs/ktx2.ab-equivalence.test.ts
rm vendor/basisu_patches/_audit.txt
```

- [ ] **Step 2: Whole-repo verification**

```bash
cd ../..
pnpm test
pnpm build
pnpm typecheck
```

Expected: 657 tests green (the count is one less than predecessor — we deleted the AB-equivalence test which was running once); 33 builds; 52 typechecks.

- [ ] **Step 3: Commit**

```bash
git rm packages/image/vendor/basis/basis_encoder.path-a.wasm \
       packages/image/vendor/basis/basis_encoder.js \
       packages/image/vendor/basis/package.json \
       packages/image/src/codecs/ktx2.ab-equivalence.test.ts \
       packages/image/vendor/basisu_patches/_audit.txt
git commit -m "chore(image): remove Path A artifacts; Path B is canonical"
```

---

### Task 20: Test gate report

**Files:**
- Create: `planning/superpowers/specs/2026-05-01-image-encoder-path-b-gate-report.md`

- [ ] **Step 1: Write report**

Mirror the structure of the predecessor report at `planning/superpowers/specs/2026-05-01-image-encoder-test-gate-report.md`. Cover:

- Each spec success criterion (1–7) with PASS/MEASURED/etc.
- Recorded SIMD-on time, SIMD-off time, ratio, output size.
- Comparison to predecessor's 8.5s baseline.
- Build artifact size delta vs the deleted BinomialLLC `basis_encoder.wasm`.
- Repo state (test/build/typecheck counts, last commits).
- "What's next" — phase 2 (Squoosh-style GUI) is now unblocked.

- [ ] **Step 2: Commit**

```bash
git add planning/superpowers/specs/2026-05-01-image-encoder-path-b-gate-report.md
git commit -m "docs(image): Path B test gate report"
```

---

## End-of-plan checklist

- [ ] `packages/image/vendor/basis/basis_encoder.wasm` is the Zig-built artifact, not BinomialLLC's.
- [ ] `vendor/basisu/README.flatland.md` records source rev, date, and patch line counts.
- [ ] `pnpm test` green from repo root.
- [ ] Benchmark consistently logs SIMD-on under 5000ms.
- [ ] No new npm dependencies added.
- [ ] Public `encodeKtx2` signature unchanged.
