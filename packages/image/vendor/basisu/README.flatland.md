# Vendored BasisU sources

| Field | Value |
|---|---|
| Upstream | https://github.com/BinomialLLC/basis_universal |
| Tag | v2_1_0 |
| Commit SHA | 45d5f41015eecd9570d5a3f89ab9cc0037a25063 |
| Imported | 2026-05-01 |
| License | Apache-2.0 (see LICENSE) |

## Subset taken

- `encoder/` — full directory (less OpenCL and PVRTC2 sources, see Patches)
- `transcoder/basisu_transcoder.h` and headers transitively included by the encoder
- `zstd/` — encoder's vendored zstd

## Subset NOT taken

- `webgl/`, examples/, tests/
- OpenCL build path (original `encoder/basisu_opencl.cpp` is removed; replaced by `basisu_opencl_stub.cpp`)
- PVRTC2 sources (we only target ETC1S + UASTC)
- Transcoder `.cpp` files were originally NOT taken in Task 1 since we only encode, but
  `basisu_transcoder.cpp` was added in Task 3 because the encoder calls
  `basist::basisu_transcoder_init()` at init time. See "Additional files fetched (Task 3)" below.

## Additional files fetched (Task 3)

The following files were not part of the original vendor subset (Task 1) but are required by
the encoder or transcoder. They were fetched from the same upstream commit `45d5f41015eecd9570d5a3f89ab9cc0037a25063`:

**transcoder/:**
- `basisu_transcoder.cpp` — encoder calls `basisu_transcoder_init()` at init time; linker requires the implementation
- `basisu_transcoder_internal.h` — included by `basisu_transcoder.h` and `basisu_enc.h`
- `basisu_transcoder_uastc.h` — included by encoder headers (`basisu_bc7enc.h`, `basisu_uastc_enc.h`, etc.)
- `basisu_astc_helpers.h` — included by `basisu_gpu_texture.h`
- `basisu_astc_hdr_core.h` — included by `basisu_uastc_hdr_4x4_enc.h`
- `basisu_containers_impl.h` — included by `basisu_transcoder.cpp`
- `basisu_idct.h` — included by `basisu_transcoder.cpp`
- `basisu_transcoder_tables_dxt1_5.inc`, `basisu_transcoder_tables_dxt1_6.inc` — lookup tables
- `basisu_transcoder_tables_bc7_m5_color.inc`, `basisu_transcoder_tables_bc7_m5_alpha.inc`
- `basisu_transcoder_tables_astc.inc`, `basisu_transcoder_tables_astc_0_255.inc`
- `basisu_transcoder_tables_pvrtc2_45.inc`, `basisu_transcoder_tables_pvrtc2_alpha_33.inc`
- `basisu_transcoder_tables_atc_55.inc`, `basisu_transcoder_tables_atc_56.inc`
- `basisu_astc_cfgs.inl`, `basisu_etc1_mods.inl` — inline data tables

**encoder/ (stub/patch files created by flatland):**
- `basisu_opencl.h` — fetched from upstream; the encoder `.cpp` files include it unconditionally
- `basisu_opencl_stub.cpp` — no-op stub (all functions return false/nullptr); original `basisu_opencl.cpp` removed at vendor time
- `basisu_thread_stubs.h` — no-op `std::mutex` / `std::condition_variable` stubs for WASI builds where `_LIBCPP_HAS_NO_THREADS` is defined

## Patches

### `encoder/basisu_enc.h` — WASI thread stub integration (Task 3)

Changed the unconditional `<mutex>`, `<condition_variable>`, `<thread>` includes to be
guarded by `#ifndef _LIBCPP_HAS_NO_THREADS`, and added `#include "basisu_thread_stubs.h"`.
Also patched `job_pool` class to use `#ifndef _LIBCPP_HAS_NO_THREADS` guards around the
thread/mutex/cv members, replacing them with a single-threaded queue-only implementation.
**~20 lines changed.**

### `encoder/basisu_enc.cpp` — WASI single-threaded job_pool (Task 3)

Wrapped the multi-threaded `job_pool` constructor/destructor/add_job/wait_for_all/job_thread
implementations in `#ifndef _LIBCPP_HAS_NO_THREADS`. Added a `#else` block with single-
threaded stubs that just queue and immediately drain jobs synchronously.
**~50 lines changed.**

### `zstd/zstd.c` — disable ZSTD_MULTITHREAD on WASI (Task 3)

Changed the `#ifndef __EMSCRIPTEN__` guard around `#define ZSTD_MULTITHREAD` to also
exclude `__wasi__`, so the amalgamated zstd does not pull in pthreads on WASI targets.
**3 lines changed.**

## SIMD scope decision (Task 4)

`_audit.txt` lists 440 raw `_mm_*` line matches in non-kernel encoder files,
representing approximately 0 distinct call-sites across encoder business-logic files.

All 440 lines originate from `cppspmd_sse.h` — the SPMD abstraction layer header
that is included **exclusively** by `basisu_kernels_sse.cpp`. No other encoder `.cpp`
or `.h` file contains any direct `_mm_*` usage.

- `cppspmd_sse.h`: 440 raw lines, 0 independent call-sites (kernel-companion header only)

**Decision:** port-all (under 30 budget)

This shapes Phase 3 work:

- **Task 13** absorbs `cppspmd_sse.h` into its scope — the kernels file is the only consumer,
  so the wasm port produces a paired `basisu_kernels_wasm.cpp` + `cppspmd_wasm.h` (or an
  equivalent merge) translated together to `wasm_simd128.h`.
- **Task 14** (patch non-kernel `_mm_*` call-sites) becomes a **no-op** and is skipped —
  the audit found zero non-kernel call-sites that need patching.
