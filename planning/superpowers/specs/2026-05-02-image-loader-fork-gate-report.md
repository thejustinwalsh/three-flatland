---
date: 2026-05-04
topic: phase-2-1-2-gate
status: complete
branch: feat-vscode-tools
purpose: Gate report for Phase 2.1.2 — owned KTX2 loader stack + encoder/transcoder workers.
---

# Phase 2.1.2 — Gate Report

## TL;DR

The encode tool now ships through a fully-owned KTX2 stack: TS-ported KTX2Loader against our zig-built basis_transcoder.wasm, both encoder and decoder running off-main-thread in CSP-friendly blob URL workers, real GPU cap detection driving the transcode-target choice, and a unified worker pattern (init via postMessage'd wasm bytes, transcode via structured-clone copy) shared between encode + transcode sides. Phase 2.1.1's stopgaps — three's vendored KTX2Loader, three's basis_transcoder binaries, the `copyBasisTranscoder` Vite plugin, the throwaway WebGLRenderer for `detectSupport()` — are gone.

## Tasks complete

| | Done | Notes |
|---|---|---|
| T0 | ✅ Revert BaseImageLoader/registry wrong-turn (`9fba867 → 20e5fd5`) | Architecture review converged on the canonical no-registry pattern. |
| T1 | ✅ TS-port KTX2Loader → `@three-flatland/image/loaders/ktx2` | 1175 LOC port; later collapsed to 335 (loader) + 440 (transcode) + 49 (worker) = 824 LOC. |
| T3 | ✅ `basis_transcoder_c_api.{h,cpp}` flat C API | Mirrors `basis_c_api.h` shape; 321 LOC of header + impl. |
| T4 | ✅ `basis_transcoder.wasm` zig build target | Output to `libs/basis/basis_transcoder.wasm` (consolidated alongside `basis_encoder.wasm` per the library-family convention). 1.1 MB after `wasm-opt -Oz`. |
| T5 | ✅ Transcoder JS wrapper (`runtime/transcoder-loader.ts`, later split to `transcoder-loader` + `transcoder-runtime`) | Mirrors `basis-loader.ts` shape; 2 sanity tests. |
| T6 | ✅ Wire Ktx2Loader to our transcoder | Worker-based with main-thread fallback; format-selection table extracted from three's worker. |
| T7 | ✅ ComparePreview swap + drop `copyBasisTranscoder` plugin | Bundler-resolved blob URL Worker via `?worker&inline`; real GPU cap probe via WebGL2 instead of the throwaway WebGLRenderer. |
| T8 | ✅ Equivalence test (skip-by-default) | Compares our `transcodeKtx2` RGBA32 output against three's vendored `basis_transcoder` for an ETC1S fixture. Run when basisu sources bump. |
| T9 | ✅ Whole-repo gate + bundle size delta | This report. |
| T10 | ✅ Gate report | This document. |
| T13 | ⏸️ *(deferred)* Three-flatland TextureLoader inline KTX2 branch | Blocked on `lighting-stochastic-adoption` rewriting `TextureLoader`/`SpriteSheetLoader`. Will graft onto its shape, not the current one. |
| T94 | ✅ Encoder worker symmetry | KTX2 encode now off-main-thread; PNG/WebP/AVIF stay inline (sub-second; AVIF already uses jsquash's internal workers). |

(Original T2/T11/T12 — `BaseImageLoader`, `LoaderRegistry`, registry-migration — were **deleted** during the architecture review. The canonical pattern at `.library/three-flatland/loader-architecture.md` rejects them.)

## Whole-repo gate

| Stage | Result |
|---|---|
| `pnpm -r typecheck` | ✅ All workspaces clean |
| `pnpm test` | ✅ 656 passed, 6 skipped, 662 total (12 test files in `packages/image/src` alone) |
| `pnpm -r build` | ✅ All workspaces produce dist artifacts |
| `pnpm --filter @three-flatland/image build:wasm` | ✅ Both `basis_encoder.wasm` (3.0 MB) and `basis_transcoder.wasm` (1.1 MB) build; `wasm-opt -Oz` post-link applied to both. |
| Vite worker warnings | ✅ None (URL-fetching code split into separate files; worker import graphs are URL-free). |

## Bundle size delta — vscode webview build

KTX2-related artifacts:

| | Before T7 (three's) | After T9 (ours) | Delta |
|---|---|---|---|
| Transcoder JS | `basis_transcoder.js` ~58 KB (unhashed, copy-plugin) | `Ktx2Loader-*.js` 12 KB + `ktx2-worker-*.js` 9.1 KB | **-37 KB** |
| Transcoder WASM | `basis_transcoder.wasm` 527 KB | `basis_transcoder-*.wasm` 1.1 MB | **+573 KB** |
| Encoder WASM | `basis_encoder-*.wasm` 3.0 MB | unchanged | 0 |
| Encoder worker | none (inline) | `basis-encoder-worker-*.js` 3.3 KB | +3.3 KB |
| **Net** | | | **+539 KB** |

Net delta: **+539 KB** on browser-loaded bytes. Most of that is the transcoder wasm being ~2.1× larger than three's emscripten build — a known toolchain difference (zig+WASI vs emscripten+closure; we get a fatter binary but a self-contained, owned, vendor-free stack). Cost concentrated in a single asset that:

- only fetches when KTX2 actually loads (lazy via `?worker&inline` chunk + worker's transferred-bytes init)
- never lands in the initial shell chunk (worker is its own chunk)
- can be optimized later with more aggressive `wasm-opt` passes or by stripping `basisu_transcoder_tables_*.inc` lookup tables behind on-demand wasm fetches (Phase 3.x candidate)

For the encode tool's preview use case (one webview, one user, one decode session) the +539 KB is amortized across the full session and never blocks the initial paint.

## Architecture artifacts

- **`.library/three-flatland/loader-architecture.md`** — canonical rules for the loader pattern. Each loader extends `three.Loader<T>` directly; no shared base, no registry, no loader-kit package. Three-tier surface (everyday `TextureLoader` / direct `Ktx2Loader` / preload). Cross-package dependency policy (hard `dependencies` + lazy `import()`; optional peer for subpath-only `three` deps). Boundary test ("could a non-three-flatland user reasonably want this package alone?").
- **`packages/image/src/loaders/Ktx2Loader.ts`** (335 LOC) — `Loader<CompressedTexture>` subclass, R3F `useLoader`-compatible, cap detection via `detectSupport(renderer)` or `setSupportedFormats(caps)`, auto-dispatches to worker / falls back to inline.
- **`packages/image/src/runtime/transcoder-runtime.ts`** + **`transcoder-loader.ts`** — split-by-URL: `runtime` is the URL-free file (types, `instantiateTranscoder`, struct readers) imported by workers; `loader` is the URL-using composition (`fetchTranscoderBytes`, `loadTranscoderWasm`) imported by main thread.
- **`packages/image/src/runtime/basis-runtime.ts`** + **`basis-loader.ts`** — same split for the encoder side.
- **`packages/image/src/loaders/ktx2-worker.ts`** + **`runtime/basis-encoder-worker.ts`** — long-lived workers; receive wasm bytes via `init` postMessage, queue work via promise chain, transfer results back. Mirror each other's protocols.

## Risks landed during the work (now resolved)

1. **CompressedTexture wrapping RGBAFormat stalled the WebGPU renderer.** Three's GL/WebGPU dispatch on the texture class — `CompressedTexture` takes the `compressedTexImage` upload path, which expects block-compressed data. The forced-RGBA32 fallback was wrapping uncompressed RGBA in `CompressedTexture`, the upload errored, and the renderer's tick stopped firing `useFrame`. Fixed by switching to `DataTexture` for uncompressed transcoder targets. Caught by user feedback during T7.
2. **`?worker&inline` blob URL workers can't resolve `new URL(..., import.meta.url)` for assets.** `import.meta.url` inside a blob URL is the blob URL itself — no valid base path. Worker tried to fetch wasm via that pattern and threw "Invalid URL". Fixed by sending wasm bytes via `init` postMessage (main thread fetches, transfers to worker; worker calls `instantiateTranscoder(bytes)`).
3. **Detached buffer on inline fallback.** `parse()` was transferring the input KTX2 buffer to the worker; if the worker rejected and we fell back to inline, the buffer was already detached on main thread. Fixed by using structured-clone copy (no transfer list) for the input buffer; mipmap results going the other way still transfer.
4. **Y-flip regression on RGBA32.** Three's GL backend honors `flipY=true` for uncompressed RGBA upload but ignores it for compressed formats. The shader V-flip + flipY=true upload double-flipped uncompressed output. Fixed by `texture.flipY = false` in `buildTexture()` so orientation is uniform; CompareLayer's shader does the only flip.
5. **CompareLayer V-flip detection over-triggered.** `(compareTex as CompressedTexture).mipmaps !== undefined` returned true for any Texture (base class initializes `mipmaps = []`), so V-flip applied to CanvasTexture-wrapped WebP/AVIF too. Fixed by detecting the `isCompressedTexture` flag instead.
6. **Compare slider hit-area captured all canvas pointer events.** `inset: 0` + `pointerEvents: auto` blocked pan/zoom. Fixed by making the container `pointer-events: none` and only opting the line + handle back in.
7. **Filter asymmetry between primary and compare sides.** Compare side switched to `NearestMipmapNearestFilter` for textures with mipmaps (KTX2), while primary stayed Linear. Fixed to use same filter on both, with `pixelArt` pref (Segmented control in EncodeMenu, mirrors atlas tool).
8. **Encoder UI lockup during 2-5s ETC1S encode.** Fixed by T94 — `encodeKtx2` auto-routes to the basis-encoder-worker via `?worker&inline`. Loading state spinner stays animated; slider/zoom/pan responsive throughout.
9. **Vite `[vite:worker] "to" undefined` warning.** Fixed in T9 by splitting URL-fetching code (`fetchTranscoderBytes` / `fetchBasisBytes` / `loadXxxWasm`) into separate `*-loader.ts` files; workers import URL-free `*-runtime.ts` modules.

## Followups (not blocking)

- **Phase 3.x — bundle-size cut for `basis_transcoder.wasm`.** Investigate stripping unused decode tables (`basisu_transcoder_tables_astc_*.inc` etc) behind on-demand fetches if they're not used for ETC1S/UASTC paths. Could trim 200-400 KB.
- **Encoder phase callbacks.** Time-estimate progress was specced + skipped; can ship Path A (JS-only ticker) anytime. Phase B (real C++ phase callbacks) is a future task — needs ~150 LOC of C++ + matching wasm exports.
- **PNG/WebP/AVIF off-thread.** Currently only KTX2 routes through a worker. PNG/WebP are sub-500ms; AVIF uses jsquash's internal workers. If a heavier consumer (e.g., an automated batch encode CLI in the browser) shows up, we'd extend `encodeImage` to wrap all formats.
- **T13 unblock.** When `lighting-stochastic-adoption` merges, graft an inline `if (ext === 'ktx2') await import('@three-flatland/image/loaders/ktx2')` branch into the rewritten `TextureLoader`/`SpriteSheetLoader`. Adds `@three-flatland/image` as a hard `dependencies` in three-flatland's `package.json`. Estimated <100 LOC.

## Commit log (Phase 2.1.2 only)

```
398edf5  feat(vscode): encode tool — pixel/bilinear filter pref (default pixel)
1c4ba5b  refactor(image): split URL-fetching out of worker import graphs
d541d87  fix(preview): same sampler on both sides of compare shader
cf3c230  feat(image): KTX2 encoder runs in a worker (Phase 2.1.x T94)
e1c074a  fix(image,vscode): KTX2 preview — real cap detection + DataTexture for uncompressed fallback
96febad  fix(preview): slider overlay was capturing all canvas pointer events
0667ece  fix(preview): detect isCompressed via flag, not mipmaps presence
e46e01c  fix(image): worker init protocol + don't transfer input + flipY=false
230577c  feat(image): ComparePreview swap + CSP-friendly worker via ?worker&inline (Phase 2.1.2 T7)
9f3fbb0  feat(image): rewrite Ktx2Loader on our owned wasm transcoder (Phase 2.1.2 T6)
b3edb98  feat(image): transcoder JS wrapper (Phase 2.1.2 T5)
8594dc0  refactor(image): consolidate libs/basis-transcoder into libs/basis
7774dd6  build(image): basis_transcoder.wasm zig target (Phase 2.1.2 T4)
058aec4  refactor(image): drop fl_basis_set_simd runtime A/B switch
035fde8  feat(image): basis_transcoder C API (Phase 2.1.2 T3)
e266ccb  refactor(image): move basis_encoder.wasm from vendor/ to libs/
6b7060e  feat(image): TS-port three's KTX2Loader (Phase 2.1.2 T1)
c9afebe  docs(phase-2-1-2): rewrite spec + anchor around canonical loader pattern
20e5fd5  Revert "feat(image): BaseImageLoader<T> abstraction (Phase 2.1.2 T2)"
80cecfb  docs(architecture): canonical loader pattern reference (.library/three-flatland)
```
