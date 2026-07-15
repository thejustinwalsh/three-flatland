# Zig-WASI C/C++ Library Field Guide

> Prescriptive guide for building any C/C++ library as a `wasm32-wasi` reactor
> module using Zig's build system — SIMD enabled, `uwasi` providing JS-side WASI
> imports, `wasm-opt` post-link for size. Distilled from a wasm-encoded image
> library and a 2D graphics library port.
>
> Tool versions: Zig 0.15.x · wasm-opt v129+ (binaryen) · uwasi ^1.x

---

## Table of Contents

1. [Conceptual Model](#1-conceptual-model)
2. [Build Target and Reactor Mode](#2-build-target-and-reactor-mode)
3. [Optimization and DCE](#3-optimization-and-dce)
4. [C++ Flag Baseline](#4-c-flag-baseline)
5. [Stripping libc Bloat — The no-stdio Pattern](#5-stripping-libc-bloat--the-no-stdio-pattern)
6. [Library Feature Flags](#6-library-feature-flags)
7. [SIMD Enablement](#7-simd-enablement)
8. [Curated Source Lists and Per-File Flag Isolation](#8-curated-source-lists-and-per-file-flag-isolation)
9. [Linkage and Export Surface](#9-linkage-and-export-surface)
10. [wasm-opt Post-link](#10-wasm-opt-post-link)
11. [JS-side Runtime with uwasi](#11-js-side-runtime-with-uwasi)
12. [Two-Phase Init](#12-two-phase-init)
13. [Module Chunking / Vite Worker Splits](#13-module-chunking--vite-worker-splits)
14. [Multi-variant Builds](#14-multi-variant-builds)
15. [Verification — Healthy Build Signals](#15-verification--healthy-build-signals)

---

## 1. Conceptual Model

```
  Zig build.zig
      │
      ├─ resolveTargetQuery(wasm32-wasi + featureSet)
      │       sets the CPU profile every downstream TU inherits
      │
      ├─ addCSourceFiles(mylib/*.cpp, cxx_flags)    ← curated list from mylib_files.zig
      │       Clang cross-compiles to wasm32 object files
      │       wasi-libc + libc++ linked from Zig's bundled sysroot
      │
      ├─ addCSourceFile(mylib_c_api.cpp)
      │       flat C ABI shim — __attribute__((export_name)) marks DCE roots
      │
      ├─ addCSourceFile(wasi_stub.c)
      │       __cxa_atexit no-op — static dtors never run in reactor mode
      │
      └─ wasm-opt -Oz  (post-link system command)
              whole-program size pass + DWARF strip → final.wasm

  Browser / Node
      │
      ├─ uwasi  (~3–6 KB JS, composable WASI provider)
      │       useNoFs → EBADF/ENOENT so wasi-libc init completes
      │
      ├─ WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi.wasiImport })
      ├─ wasi.initialize(instance)    ← runs _initialize (C++ global ctors)
      └─ mylib_init()                 ← library-level init (two-phase init, §12)
```

The C ABI shim is the only door out of the wasm sandbox.

---

## 2. Build Target and Reactor Mode

```zig
var query: std.Target.Query = .{ .cpu_arch = .wasm32, .os_tag = .wasi };
query.cpu_features_add = std.Target.wasm.featureSet(&.{
    .simd128,             // 128-bit SIMD; wasm_simd128.h intrinsics + LLVM auto-vec
    .bulk_memory,         // memory.copy/fill; faster memcpy/memset; required by wasi-libc
    .sign_ext,            // sign-extension opcodes; smaller integer casts
    .nontrapping_fptoint, // saturating float-to-int; removes traps on out-of-range casts
});
const target = b.resolveTargetQuery(query);

const optimize: std.builtin.OptimizeMode = .ReleaseFast;
_ = b.standardOptimizeOption(.{ .preferred_optimize_mode = .ReleaseFast }); // CLI hook

const exe = b.addExecutable(.{
    .name = "mylib",
    .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
});
exe.entry = .disabled;          // don't synthesise a main shim
exe.wasi_exec_model = .reactor; // links crt1-reactor.o, provides _initialize
exe.rdynamic = false;           // MANDATORY — see §3
exe.export_table = true;        // preserves __indirect_function_table
exe.initial_memory = 32 * 1024 * 1024;  // tune to library's static data
exe.max_memory = 256 * 1024 * 1024;
```

All four features are universally supported in modern browsers and Node ≥ 18. Do
not add `tail_call` or `exception_handling` unless the library explicitly needs them.

A reactor exports `_initialize` (C++ global ctors) and stays resident. `initial_memory`
must fit all static tables loaded during `_initialize` — underprovisioning causes
instantiation failure.

**Symptom if reactor mode is wrong:** linker error for `main`; or `_initialize`
never called → silent data corruption on first call.

---

## 3. Optimization and DCE

### Decision: `ReleaseFast` + `wasm-opt -Oz`, NOT `ReleaseSmall`

`ReleaseFast` inlines SIMD kernels aggressively ("~20MB raw" per the reference
build). Those inlined bodies are structurally identical — `wasm-opt -Oz`
deduplicates them and strips DWARF ("~3MB"), preserving speed wins. `ReleaseSmall`
avoids the inlining but leaves a slower binary with no dedup win.

**Gotcha: `-flto=full` makes the binary bigger.** LTO pre-merges TUs and leaves
wasm-opt less per-TU structure to deduplicate. **Symptom:** binary with `-flto`
is larger and wasm-opt shrinks it less.

### Gotcha: `rdynamic = false` is mandatory

With `rdynamic` (the default), wasm-ld treats every C++ symbol as a live DCE root.

**Symptom:** 50–200+ exports, binary far larger than expected.

`exe.rdynamic = false` — DCE roots become only `export_name`-tagged symbols.

### Gotcha: `export_name` keeps entire transitive call graphs

If a vendored file has decorated exports you never call, **drop that file** — no
other way to DCE them.

**Symptom:** remove all calls to a subsystem, binary barely shrinks. `wasm-opt
--metrics` shows exports you did not define.

```zig
// "vendor/mylib/mylib_wasm_api.cpp",  // excluded — stray export_name decorations
```

---

## 4. C++ Flag Baseline

```zig
const cxx_flags: []const []const u8 = &.{
    "-std=c++17",             // or c++20 as needed
    "-fno-exceptions",        // removes EH tables, __cxa_throw, unwind machinery
    "-fno-rtti",              // removes typeinfo/dynamic_cast tables
    "-fno-math-errno",        // errno-setting math wrappers not needed in wasm
    "-fno-signed-zeros",      // -0.0 == 0.0 folding
    "-ffp-contract=fast",     // fused multiply-add; free throughput
    "-msimd128",              // emit wasm SIMD from intrinsics or SSE bridge
    "-includesrc/zig/no_stdio.h",  // force-include stdio no-ops (no space after -include)
    "-DNDEBUG",               // kills assert(); removes debug-only code paths
    // + library-specific defines mirroring the emscripten reference build (see §6)
};
```

`-fno-exceptions` and `-fno-rtti` are the most impactful flags. C++ libraries
often provide a `MYLIB_NO_EXCEPTIONS` define. For pure C TUs, use `-std=c11` and
drop the C++ flags — see §8 for the per-file isolation pattern.

---

## 5. Stripping libc Bloat — The no-stdio Pattern

**Symptom of the problem:** `wasm-opt mylib.wasm --metrics` shows 10+ WASI imports.
Cause: `printf`/`fprintf` callsites drag in libc's format-string parser, locale
init, `FILE*` state, and WASI `fd_write`/`path_open`/`environ_*` imports.

Create `src/zig/no_stdio.h` — force-included into every translation unit:

```c
#pragma once
#include <stdio.h>   // MUST come first (see gotcha below)

#define printf(...)   ((int)0)
#define fprintf(...)  ((int)0)
#define vprintf(...)  ((int)0)
#define vfprintf(...) ((int)0)
#define puts(...)     ((int)0)
#define fputs(...)    ((int)0)
#define fputc(...)    ((int)0)
#define putchar(...)  ((int)0)
#define perror(...)   ((void)0)
```

Every `printf(...)` expands to `((int)0)` at preprocess time. wasm-ld DCEs the
entire libc machinery that backed it. Payoff: typically several hundred KB removed
and a meaningful reduction in WASI import count.

### Gotcha: `#include <stdio.h>` MUST come first

If the `#define` lines appear before `#include <stdio.h>`, TUs that use `FILE*` as
a parameter type see the macro before the type is defined.

**Symptom:** `'FILE' undeclared` in vendor source you did not touch.

The header is macro-only — `fopen`/`fread`/`fwrite` type declarations stay intact
for code that passes `FILE*` by pointer; those dead paths are DCE'd by wasm-ld.

---

## 6. Library Feature Flags

### Decision: mirror the upstream emscripten reference build

Most C++ libraries ship a `webgl/` or `web/` subdirectory with a `CMakeLists.txt`
encoding browser-build feature trade-offs. **Mirror it exactly.**

**Symptom of deviation:** link error from a TU you thought was isolated.

### Gotcha: `__EMSCRIPTEN__` guards are free size wins you are missing

`wasm32-wasi` does not define `__EMSCRIPTEN__`, so libraries' browser-specific
reductions are silently absent.

**Symptom:** binary noticeably larger than the equivalent emscripten build.

Fix: audit each guard and mirror via explicit `-D` flags:

```zig
// Upstream's __EMSCRIPTEN__ block drops a large lookup table — force it:
"-DLIB_SUPPORT_HIGHER_OPAQUE_QUALITY=0",
```

### Disable subsystem variants you never call

Grep for `*_NO_*` and `*_DISABLE_*` macros in every embedded amalgamation, even
ones you did not realise the library shipped:

```zig
"-DEMBEDDED_LIB_NO_ARCHIVE_APIS=1", "-DEMBEDDED_LIB_NO_TIME=1",
```

### Decoder-only amalgamation trade-off

Prefer the decoder-only amalgamation when you only need to consume a format.
Compile time drops, intent is explicit. wasm size delta is often small (wasm-ld
DCEs unused encoder paths anyway). Mirror the upstream emscripten build's choice.

---

## 7. SIMD Enablement

WebAssembly has exactly one SIMD profile: **`simd128`** (128-bit lanes). No AVX,
no SSE4, no NEON. Libraries with `_mm_*` SSE intrinsics need a translation shim:

```c
// vendor/mylib_patches/sse_to_wasm.h
#pragma once
#include <wasm_simd128.h>
typedef v128_t __m128i;
#define _mm_load_si128(p)       wasm_v128_load(p)
#define _mm_loadu_si128(p)      wasm_v128_load(p)
#define _mm_store_si128(p, a)   wasm_v128_store(p, a)
#define _mm_add_epi32(a, b)     wasm_i32x4_add(a, b)
// ... one mapping per intrinsic the library uses
```

```zig
exe.addIncludePath(b.path("vendor/mylib_patches")); // contains sse_to_wasm.h
// in cxx_flags: "-DMYLIB_SUPPORT_SSE=1", "-DMYLIB_SUPPORT_WASM_SIMD=1"
```

SSE2/SSE4.1 maps cleanly. AVX2 (256-bit) does not. If the library ships a
dedicated wasm SIMD kernel file, include it and exclude the native x86 kernel.

### Gotcha: `-msimd128` is a no-op for assembly-only SIMD

Libraries whose SIMD comes from x86 assembly gain nothing. Pass the asm-disable
flag (e.g. `-DLIB_DISABLE_ASM=1`).

**Symptom:** compiles fine, `wasm-opt --print | grep v128` shows nothing — hot
paths were x86 assembly, scalar fallback is active.

---

## 8. Curated Source Lists and Per-File Flag Isolation

### Curated source-list pattern

C++ libraries vendor large source trees, but you only want a curated subset. Keep
the compile-unit list in a separate `.zig` file:

```zig
// mylib_files.zig — curated sources, relative to vendor/mylib/.
// Keep in sync with upstream CMakeLists.txt when re-vendoring.
pub const mylib_files: []const []const u8 = &.{
    "src/mylib_core.cpp",
    "src/mylib_codec.cpp",
    "src/mylib_kernels_wasm.cpp",   // wasm_simd128 kernels
    // "src/mylib_kernels_native.cpp", // excluded — wasm kernel provides same symbols
    // "src/mylib_wasm_api.cpp",       // excluded — stray export_name decorations (see §3)
};
pub const include_paths: []const []const u8 = &.{
    "vendor/mylib", "vendor/mylib_patches",
};
```

```zig
const files = @import("mylib_files.zig");
exe.addCSourceFiles(.{ .root = b.path("vendor/mylib"), .files = files.mylib_files, .flags = cxx_flags });
for (files.include_paths) |inc| exe.addIncludePath(b.path(inc));
```

"Drop this file" is a one-line commented-out change. Easy to diff against upstream
CMakeLists on re-vendor.

### Per-source-file flag isolation

An embedded C amalgamation needs a narrower flag set — no C++ flags, no library
macros that are meaningless to plain C:

```zig
exe.addCSourceFiles(.{ .root = b.path("vendor/mylib"), .files = files.mylib_files, .flags = cxx_flags });
exe.addCSourceFiles(.{   // narrower set for the embedded C sub-library
    .root = b.path("vendor/mylib/thirdparty"),
    .files = &.{"compression.c"},
    .flags = &.{ "-msimd128", "-DLIB_DISABLE_ASM=1", "-DNDEBUG" },
});
```

---

## 9. Linkage and Export Surface

**`wasi_stub.c`** — `__cxa_atexit` no-op (static dtors never run in reactor):

```c
int __cxa_atexit(void (*fn)(void *), void *arg, void *dso) {
    (void)fn; (void)arg; (void)dso; return 0;
}
```

Compile with `"-std=c11"`. **Flat C ABI** — `extern "C"` alone does NOT preserve
a symbol. `export_name` is the keepalive:

```cpp
// src/zig/mylib_c_api.cpp
#include <stdint.h>
#include "mylib/mylib.h"

extern "C" __attribute__((export_name("mylib_init")))
int mylib_init() { return MyLib::init() ? 0 : 1; }

extern "C" __attribute__((export_name("mylib_process")))
int mylib_process(uint32_t h, uint8_t* data, uint32_t len) {
    return MyLib::process(h, data, len);
}

// Always export memory helpers — JS needs them to manage wasm linear memory.
extern "C" __attribute__((export_name("mylib_alloc")))
uint8_t* mylib_alloc(uint32_t n) { return static_cast<uint8_t*>(malloc(n)); }

extern "C" __attribute__((export_name("mylib_free")))
void mylib_free(uint8_t* p) { free(p); }
```

Never use `EMSCRIPTEN_KEEPALIVE` — does not produce `export_name`. `memory` and
`__indirect_function_table` are emitted automatically.

**Symptom:** function absent from export section; JS throws "is not a function".
Cause: `extern "C"` without `export_name`.

---

## 10. wasm-opt Post-link

```zig
const opt_step = b.addSystemCommand(&.{
    "wasm-opt", "-Oz",
    "--strip-debug", "--strip-producers",   // DWARF is often 80–90% of raw size
    "--enable-simd", "--enable-bulk-memory",
    "--enable-sign-ext", "--enable-nontrapping-float-to-int",
    "-o", "libs/mylib/mylib.wasm",
});
opt_step.addFileArg(exe.getEmittedBin());
b.getInstallStep().dependOn(&opt_step.step);
```

`-Oz` deduplicates inlined function bodies that LLVM cloned during vectorisation —
a win LLVM cannot achieve at link time.

### Gotcha: `--enable-*` flags MUST mirror compile-time CPU features

**If you compiled with `simd128` and run wasm-opt without `--enable-simd`, it
silently strips all SIMD instructions.** The binary validates but produces wrong
results. Always pass one `--enable-*` per feature in the target query (§2).

**Symptom:** SIMD paths produce wrong output. `wasm-opt --print | grep v128`
shows nothing.

---

## 11. JS-side Runtime with uwasi

`uwasi` — maintained, ~3 KB, composable, structured `WASIProcExit` exceptions.

```ts
import { WASI, useClock, useEnviron, useRandom, useProc, type WASIFeatureProvider } from 'uwasi'
export { WASIProcExit } from 'uwasi'

// WASI errno constants (wasi/api.h) — copy verbatim, these are spec constants.
const WASI_ERRNO_BADF  = 8   // "no more preopens" / "fd not open"
const WASI_ERRNO_NOENT = 44  // "path not found"

const useNoFs: WASIFeatureProvider = () => ({
  fd_prestat_get:      () => WASI_ERRNO_BADF,
  fd_prestat_dir_name: () => WASI_ERRNO_BADF,
  fd_fdstat_get:       () => WASI_ERRNO_BADF,
  fd_fdstat_set_flags: () => WASI_ERRNO_BADF,
  fd_filestat_get:     () => WASI_ERRNO_BADF,
  fd_close:            () => WASI_ERRNO_BADF,
  fd_seek:             () => WASI_ERRNO_BADF,
  fd_read:             () => WASI_ERRNO_BADF,
  fd_write: () => 0,   // return success; libc buffered I/O checks error code only
  path_open:           () => WASI_ERRNO_NOENT,
  path_filestat_get:   () => WASI_ERRNO_NOENT,
})

export async function instantiateWithWasi<T>(bytes: ArrayBuffer): Promise<T> {
  const wasi = new WASI({ features: [useClock, useEnviron, useRandom(), useProc, useNoFs] })
  const result = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: wasi.wasiImport,
  })
  wasi.initialize(result.instance) // runs _initialize; guards double-init — see §12
  return result.instance.exports as unknown as T
}
```

### Gotcha: uwasi default ENOSYS breaks wasi-libc init

**wasi-libc's stdio init treats `ENOSYS` on `fd_prestat_get` as a hard error**,
calling `proc_exit(71)` before any exports run. `EBADF` (8) is the correct signal.

**Symptom:** `WASIProcExit` immediately, exit code 71.

### Gotcha: do NOT call `_initialize` manually

Use `wasi.initialize(instance)`. `_initialize` called directly bypasses the
double-init guard. Running C++ global ctors twice is UB.

**Symptom:** crash or corruption on second instantiation or after HMR reload.

---

## 12. Two-Phase Init

Two steps must complete before calling any library export:

1. **`wasi.initialize(instance)`** — runs `_initialize` (C++ global ctors), inside `instantiateWithWasi`.
2. **`lib_init()` export** — explicit setup the C++ side needs (table init, etc.).

```ts
const exports = await instantiateWithWasi<MyLibExports>(bytes)  // step 1 inside
const rc = exports.mylib_init(); if (rc !== 0) throw new Error(`mylib_init failed: ${rc}`)
```

**Symptom if step 2 is missing:** wrong results or crash on inputs that exercise
code gated behind the library's init.

---

## 13. Module Chunking / Vite Worker Splits

Put `instantiateMyLib` and `new URL('path/to/mylib.wasm', import.meta.url)` in a
dedicated `mylib-loader.ts` reached only via dynamic `import()`. Any static import
of the wasm runtime from main-bundle code defeats the split.

**Vite `?worker&inline` caveat:** Vite walks the worker's entire static import
graph. Any `new URL(..., import.meta.url)` in that graph triggers a warning
(`[vite:worker] "to" undefined`). Keep URL-using code in a file the worker does
not statically import — worker receives pre-fetched bytes via `postMessage`.

---

## 14. Multi-variant Builds

Extract a `buildVariant` helper — same reactor settings every time:

```zig
fn buildVariant(b: *std.Build, name: []const u8, c_api: []const u8,
    variant_flags: []const []const u8, target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const exe = b.addExecutable(.{
        .name = name,
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    exe.entry = .disabled;  exe.wasi_exec_model = .reactor;
    exe.rdynamic = false;   exe.export_table = true;
    exe.addCSourceFile(.{ .file = b.path(c_api),
        .flags = concatFlags(b, base_cxx_flags, variant_flags) });
    exe.addCSourceFile(.{ .file = b.path("src/zig/wasi_stub.c"), .flags = &.{"-std=c11"} });
    exe.linkLibC();  exe.linkLibCpp();
    return exe;
}
```

Share static libraries for common sources; compile once per variant for
variant-specific sources. Do not share a compiled library across variants with
different feature defines — different defines mean different compiled objects.

```zig
// CI fast-path — build only the variant under test:
const skip_a = b.option(bool, "skip-a", "Skip variant A") orelse false;
if (!skip_a) { /* build variant A */ }
```

---

> **Sidebar — Legacy in-tree builds**
>
> Some older in-tree builds may not yet exemplify all patterns in this guide.
> Signs of the older shape: `rdynamic = true`, `import_symbols = true`, no
> `entry = .disabled`, no `wasi_exec_model = .reactor`, no no-stdio header, no
> wasm-opt step. These builds function but do not reflect the prescriptive
> pattern. This guide describes the target state; older builds should be migrated.

---

## 15. Verification — Healthy Build Signals

```sh
wasm-opt libs/mylib/mylib.wasm --metrics
wasm-opt libs/mylib/mylib.wasm --print | grep v128   # verify SIMD instructions
```

| Signal | Healthy | Problem |
|---|---|---|
| Import count | ≤ 6 (`clock_time_get`, `environ_get/sizes_get`, `random_get`, `proc_exit`, optionally `fd_write`) | Many `fd_*`/`path_*` → no-stdio header not force-included or not reaching every TU |
| Export count | `_initialize` + `memory` + `__indirect_function_table` + your N ABI functions | Extra C++ exports → `rdynamic` still `true` or vendored file has stray `export_name` |
| Memory data section | Dominated by library static tables | Large libc string blocks → printf chain still live; check `-include` path |
| Largest single function | < 10% of total size | One function dominates → DCE root pulling in too much; audit C ABI file |
| SIMD opcodes present | `v128` instructions visible | Missing `--enable-simd` in wasm-opt, or `-msimd128` absent, or library SIMD was assembly-only |

| Symptom | Likely cause |
|---|---|
| 13+ WASI imports | no-stdio header not applied; `printf` paths still live |
| 20+ exports | stray `export_name` in vendored file, or `rdynamic = true` |
| Binary barely smaller than raw compiler output | wasm-opt not running, or `--enable-simd` missing |
| `WASIProcExit` immediately, exit code 71 | `fd_prestat_get` returning ENOSYS instead of EBADF |
| Top function > 20% of binary | large SIMD kernel (may be fine) or missed dedup opportunity |
| Undefined symbol after removing a file | hidden cross-TU dependency; re-enable or stub |
| SIMD path produces wrong output | `--enable-simd` missing from wasm-opt invocation |

Diff export counts after any significant flag change:

```sh
wasm-opt before.wasm --metrics 2>&1 | grep exports
wasm-opt after.wasm  --metrics 2>&1 | grep exports
```

An unexpected export count increase almost always means a new source file has
`export_name` decorations you did not notice.
