# @three-flatland/image

> PNG/WebP/AVIF/KTX2 encode + KTX2 transcode (browser + Node + CLI) backed by a vendored basisu wasm port.

**For wasm/Zig build work, read `.library/zig-wasi/cookbook.md` FIRST.** This package is the reference implementation that informed the cookbook — the patterns there apply uniformly and are not repeated here.

## Companion docs

- `.library/zig-wasi/cookbook.md` — prescriptive field guide for `wasm32-wasi` reactor builds with Zig + uwasi + wasm-opt
- `.library/three-flatland/loader-architecture.md` — where `Ktx2Loader` fits in the broader three-flatland loader story (it is Tier 2 — "direct" / format-specific)

---

## Architecture overview

### Two wasm artifacts

| Artifact | Output path | Size | Purpose |
|---|---|---|---|
| `basis_encoder.wasm` | `libs/basis/basis_encoder.wasm` | ~2.5 MB | PNG/WebP/AVIF/KTX2 **encode** |
| `basis_transcoder.wasm` | `libs/basis/basis_transcoder.wasm` | ~950 KB | KTX2 **decode/transcode** (Ktx2Loader) |

Why split: the transcoder doesn't need the encoder's PNG/EXR loaders, the SPMD ETC1S/UASTC encoding kernels, or the full zstd encoder. Decoder-only zstd amalgamation (`zstddeclib.c`) is used on the transcoder side.

### Encode-API orientation

`src/encode.ts` is the top-level encode dispatcher — it routes by `format` to a per-format codec. Each format lives in `src/codecs/<format>.ts` (currently `png`, `webp`, `avif`, `ktx2`). To add a new format: add a codec file there and wire it into `encode.ts`. `src/encode.node.ts` is the Node-only entry — it runs encoders inline on the main thread with no Worker. The Worker pattern is KTX2-only (due to its 2–5s encode time); PNG/WebP/AVIF stay on the main thread in both entries.

### Browser vs Node entries

`package.json` exports:
- `browser` condition → `dist/index.js` (Vite `?worker&inline` blob-URL Workers)
- `node` condition → `dist/node.js` (inline wasm on main thread, no Worker)
- `./loaders/ktx2` subpath → `dist/loaders/Ktx2Loader.js` (three.js-compatible loader)
- `./cli` subpath → `dist/cli.js`

### Flat C ABI (DCE roots)

Both wasm modules expose only tagged `__attribute__((export_name(...)))` symbols:
- **Encoder**: `fl_basis_*` — defined in `src/zig/basis_c_api.cpp`
- **Transcoder**: `fl_transcoder_*` / `fl_ktx2_*` / `fl_basis_*` — defined in `src/zig/basis_transcoder_c_api.cpp`

With `rdynamic = false` (mandatory), wasm-ld roots DCE at these exports only. Everything unreachable from them is dead-code-eliminated. Cookbook §3 and §9 explain the mechanism.

---

## Build entry points

```sh
pnpm --filter @three-flatland/image build:wasm   # zig build → libs/basis/*.wasm
pnpm --filter @three-flatland/image build         # tsup → dist/
pnpm --filter @three-flatland/image typecheck
pnpm exec vitest run packages/image/src/...       # see Tests section
```

`build:wasm` resolves `wasm-opt` from the workspace's transitive `binaryen` dep before falling back to PATH.

---

## Vendored basisu — what's modified vs upstream

Source: `vendor/basisu/` (upstream clone) + `vendor/basisu_patches/` (our patches).

| File | What's changed |
|---|---|
| `vendor/basisu_patches/sse_to_wasm.h` | Translates SSE2/SSE4.1 intrinsics (`_mm_*`) to `wasm_simd128.h` equivalents. Enables `BASISU_SUPPORT_SSE=1` on wasm targets. |
| `vendor/basisu_patches/basisu_simd_compat.h` | Companion compat header for the SSE bridge. |
| `vendor/basisu/zstd/zstd.c` | Patched to guard `ZSTD_MULTITHREAD` with `!__wasi__` — no pthreads on WASI. Encoder side only. |
| `vendor/basisu/zstd/zstddeclib.c` | Decoder-only amalgamation; used by transcoder build (encoder uses full `zstd.c`). Not patched but included selectively — see `build.zig`. |

**`basisu_wasm_api.cpp` is excluded from both compile lists.** Its `bu_*` exports are unused DCE roots that would survive with `rdynamic = true`. Keep it out. Cookbook §9 for the general rule.

The encoder uses `basisu_kernels_wasm.cpp` (wasm SIMD kernels) instead of `basisu_kernels_sse.cpp` (x86 SSE). The wasm kernel file provides the `_sse41`-suffixed symbols that basisu's hot paths call. Do not re-add `basisu_kernels_sse.cpp`. Curated source lists live in `encoder_files.zig` and `transcoder_files.zig`.

Build flags mirror upstream basisu's emscripten reference build (`webgl/encoder/CMakeLists.txt`, `webgl/transcoder/CMakeLists.txt`). Cookbook §6 explains the philosophy.

---

## JS-side runtime — uwasi shim

**File**: `src/runtime/wasi-shim.ts`

Wraps `uwasi` with `useNoFs` — a custom feature provider that returns `EBADF` for `fd_*` calls, `ENOENT` for `path_*` calls, and `0` for `fd_write` so libc's buffered-IO path doesn't error. **Do not switch to ENOSYS**: wasi-libc's stdio init treats `ENOSYS` on `fd_prestat_get` as a hard error and calls `proc_exit(71)` before any `fl_*` exports run. Cookbook §11 documents this gotcha.

`instantiateWithWasi<T>(bytes)` is the helper both runtimes use:

```ts
const exports = await instantiateWithWasi<BasisExports>(bytes)
// _initialize (C++ global ctors) already ran via wasi.initialize() inside the helper
const rc = exports.fl_basis_init()
if (rc !== 0) throw new Error(`fl_basis_init failed: ${rc}`)
```

Library init (`fl_basis_init` / `fl_transcoder_init`) must run AFTER `instantiateWithWasi` returns. Two-phase init — cookbook §12.

**Runtime entry points:**
- `src/runtime/basis-runtime.ts` — encoder instantiation (`instantiateBasis`)
- `src/runtime/transcoder-runtime.ts` — transcoder instantiation (`instantiateTranscoder`)
- `src/runtime/basis-loader.ts` — main-thread singleton: `fetchBasisBytes()` + `loadBasisWasm()`
- `src/runtime/transcoder-loader.ts` — main-thread singleton: `fetchTranscoderBytes()` + `loadTranscoderWasm()`

---

## Worker pattern (browser only)

KTX2 encode is slow (2–5s for ETC1S on a 2048² source). It runs in a `?worker&inline` blob-URL Worker. PNG/WebP/AVIF stay on the main thread.

**Worker entries**: `src/runtime/basis-encoder-worker.ts` (encode), `src/loaders/ktx2-worker.ts` (transcode).

**Critical**: Workers receive wasm bytes via `postMessage`, not a URL. Inside a `?worker&inline` blob URL Worker, `import.meta.url` IS the blob URL — there is no valid base path. `new URL('../../libs/basis/foo.wasm', import.meta.url)` throws "Invalid URL". Pattern:

```ts
// Main thread: fetch bytes where import.meta.url resolves normally
const wasmBytes = await fetchBasisBytes()
// Transfer the ArrayBuffer to the worker (zero-copy)
worker.postMessage({ type: 'init', wasmBytes }, [wasmBytes])
```

Cookbook §13 is the canonical reference for Vite `?worker&inline` chunking rules.

---

## Loaders surface

`Ktx2Loader` (`src/loaders/Ktx2Loader.ts`) extends `THREE.Loader<CompressedTexture>`. R3F-compatible.

**Key design**: caps are provided to the loader via `setSupportedFormats(caps: Ktx2Capabilities)` — there is no `detectSupport(renderer)` requirement. The VSCode tool probes caps in `tools/vscode/webview/encode/gpuCaps.ts` using a throwaway WebGL2 context; Ktx2Loader accepts whatever it's given.

Format selection logic lives in `src/loaders/ktx2-transcode.ts`. Priorities follow the [Khronos 3D Formats Guidelines](https://github.com/KhronosGroup/3D-Formats-Guidelines):
- ETC1S: ETC2 > ETC1 > BC7 > DXT > PVRTC > RGBA32
- UASTC: ASTC > BC7 > ETC2 > DXT > ETC1 > PVRTC > RGBA32
- UASTC HDR: BC6H > RGBA_HALF

Decoding KTX2 to `ImageData` for the encode tool preview is a separate code path in `tools/vscode/webview/encode/decodeKtx2.ts`. It uses `Ktx2Loader` with all-false caps to force RGBA32 fallback.

---

## Common gotchas

- **Transcoder initial_memory = 32 MB is required.** Static data (`basisu_transcoder_tables_*.inc`) alone is ~17 MB; 16 MB causes instantiation failure. See `build.zig` comment at the transcoder target.

- **KTX2 stores image data bottom-up — do NOT Y-flip at upload.** KTX2 uses OpenGL bottom-up storage convention; the loader sets `flipY = false` to avoid double-flipping at GPU upload. The transcoded RGBA from a Basis-encoded KTX2 is therefore bottom-up; the consumer is responsible for any final orientation correction. Adding a row flip in `decodeKtx2.ts` breaks the preview.

- **Loader scope: Basis-encoded KTX2 only.** This package's KTX2 transcoder only handles Basis-encoded KTX2 (ETC1S/UASTC/UASTC-HDR `compressionScheme`). Raw KTX2 with a `vkFormat` payload (uncompressed RGBA, BC7-passthrough, etc.) is rejected. Don't try to extend the transcode path for raw formats — that's a separate decoder.

- **`basisu_kernels_wasm.cpp` not `basisu_kernels_sse.cpp`.** The wasm kernel provides `_sse41`-suffixed symbols. Re-adding the SSE file causes duplicate-symbol link errors (both files export the same names).

- **Vite `?worker&inline` + `new URL(...)` warning.** Vite walks the worker's full static import graph. `new URL('...wasm', import.meta.url)` in any statically imported file triggers `[vite:worker] "to" undefined`. Keep URL-resolution code in files the worker does NOT statically import — the worker receives pre-fetched bytes. `basis-loader.ts` is the "main-thread only" file; the worker imports from `basis-runtime.ts` directly.

- **Two-phase init order.** `instantiateWithWasi` runs C++ global ctors. Then you MUST call the library's own init export (`fl_basis_init` / `fl_transcoder_init`). Calls that rely on basisu's internal tables before the second phase crash silently or produce wrong output.

- **`fl_transcoder_free` all allocations in `finally` blocks.** The transcoder operates on wasm linear memory with its own allocator. `ktx2-transcode.ts` has the reference pattern: allocate input buffer + scratch ptrs before the `try`, free all in `finally`.

---

## Tests

```sh
# KTX2 encode round-trip
pnpm exec vitest run packages/image/src/codecs/ktx2.test.ts

# Node entry (inline wasm, no Worker)
pnpm exec vitest run packages/image/src/encode.node.test.ts

# Perf gate — 5s budget for 2048² ETC1S+mips encode
# Flaky near threshold; re-run once if it fails by < 5%
pnpm exec vitest run packages/image/src/basisu-bench.test.ts

# Equivalence test vs three.js KTX2Loader
pnpm exec vitest run packages/image/src/loaders/Ktx2Loader.equivalence.test.ts

# Transcoder loader
pnpm exec vitest run packages/image/src/runtime/transcoder-loader.test.ts
```
