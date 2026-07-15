---
date: 2026-05-04
topic: context-anchor
status: handoff
branch: feat-vscode-tools
purpose: One-page state snapshot for resuming Phase 2.1.2 after a /compact.
---

# Context anchor — resume Phase 2.1.2

This document is a self-contained handoff. Read this and the linked references; you have everything you need.

## Where we are

`feat-vscode-tools` branch. Phase 2.1.1 (compare-slider primitives + encode tool consumer) shipped. Phase 2.1.2 (owned KTX2 loader + transcoder) is the next thing to execute.

## Architecture decision (2026-05-04 review — LOCKED)

We did a deep architecture pass and **rejected** the prior plan (BaseImageLoader + LoaderRegistry + NativeBitmapLoader). The canonical pattern is now documented at:

- **`.library/three-flatland/loader-architecture.md`** — hard reference. Read this FIRST.
- `planning/bake/loader-pattern.md` — companion (the "baked → runtime" shape used by some loaders).

Key rules from the canonical reference:
1. Every loader extends `three.Loader<T>` directly. NO `BaseImageLoader`, NO `LoaderRegistry`, NO shared loader-kit package.
2. Format dispatch inside Tier 1 wrappers is inline `if (ext === 'fmt') await import(...)`, not a registry.
3. Format-I/O loaders (Ktx2Loader) live in `@three-flatland/image/loaders/<fmt>` — standalone-publishable.
4. Wasm artifacts live in `packages/<owner>/libs/<library-family>/` (NOT `vendor/`). Group by upstream library, not per artifact (e.g. `libs/basis/` holds both encoder + transcoder).
5. `three-flatland → siblings` is a hard `dependencies`. `siblings → three` is an optional peer (subpath-level dep). Changesets locks co-versioning; bundler dedupe handles bundle correctness.

Commit `9fba867` (BaseImageLoader in image package) was reverted by `20e5fd5`. Do NOT recreate that abstraction.

## What shipped in Phase 2.1.1

Shared primitives in `@three-flatland/preview/canvas`:

- `ImageSource` discriminated union, `ThreeLayer` accepts both
- `CompareLayer` — WebGPU R3F + TSL split shader
- `CompareContext` + `useCompareController()` — splitU + loading state via context
- `CanvasStage` extension — `compareImageSource`, `initialSplitU`, `onSplitChange`, `mipLevelB`, `compareLoading` props
- `CompareSliderOverlay` — HTML drag UI
- `CompareLoadingOverlay` — spinner over the right half during encode

Encode tool (`tools/vscode/webview/encode/`):
- `ComparePreview.tsx` (~130 LOC) — KTX2 path uses three's stock KTX2Loader with throwaway WebGLRenderer for `detectSupport()` + Vite `copyBasisTranscoder()` plugin. **All three of these get removed in Phase 2.1.2.**
- Toolbar follows merge pattern (Undo/Redo left, Knobs + mip stepper middle, spacer, Save right)
- Custom-editor activation on `*.png` / `*.webp` / `*.avif` / `*.ktx2` with inspect mode

Phase 2.1.1 gate report: `planning/superpowers/specs/2026-05-02-image-encoder-compare-slider-gate-report.md`. Whole-repo: 654 tests / 5 skipped / 659 total, all green.

## Phase 2.1.2 — what to build

Spec: `planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md` (the `# Phase 2.1.2 — owned KTX2 loader (canonical pattern)` section, near the bottom).

### Goal

Replace Phase-2.1.1 stopgaps with our own KTX2 loader stack:

- `packages/image/src/loaders/Ktx2Loader.ts` — TS-port of three's KTX2Loader, extends `three.Loader<CompressedTexture>` directly. Subpath-exported as `@three-flatland/image/loaders/ktx2`. Standalone-publishable.
- `packages/image/src/zig/basis_transcoder_c_api.{h,cpp}` + `packages/image/build.zig` second target → `packages/image/libs/basis/basis_transcoder.wasm` (alongside the existing `basis_encoder.wasm`)
- `packages/image/src/runtime/transcoder-loader.ts` — JS wrapper around our transcoder wasm
- `tools/vscode/webview/encode/ComparePreview.tsx` swaps to our Ktx2Loader; drops the WebGLRenderer hack and the Vite copy plugin

### Critical constraints

- **No shared abstractions.** No `BaseImageLoader`, no registry, no NativeBitmapLoader. Each loader extends `three.Loader<T>` directly. (See `.library/three-flatland/loader-architecture.md`.)
- **Lazy everything.** Importing `@three-flatland/image/loaders/ktx2` is ~2 KB; the wasm fetches on first parse.
- **No vendored upstream binaries in dist.** Three's `basis_transcoder.{js,wasm}` get removed; ours replace them. Vite's `copyBasisTranscoder` plugin in `tools/vscode/vite.config.ts` is removed.
- **WebGL2 + WebGPU both supported** — `detectSupport(renderer)` accepts either. Adapt internally per backend.
- **Three.js as optional peer on image package** — encode/decode entries don't need three; only the `loaders/*` subpath does.

### Task list (current TaskList IDs)

| ID | Task |
|---|---|
| 91 | T0 — Revert `9fba867` (BaseImageLoader/registry wrong turn) — **DONE (`20e5fd5`)** |
| 67 | T1 — TS-port three's KTX2Loader to `packages/image/src/loaders/Ktx2Loader.ts` |
| 69 | T3 — `basis_transcoder_c_api.{h,cpp}` flat C API |
| 70 | T4 — Add `basis_transcoder` zig build target → `packages/image/libs/basis/basis_transcoder.wasm` |
| 71 | T5 — Transcoder JS wrapper at `packages/image/src/runtime/transcoder-loader.ts` |
| 72 | T6 — Wire Ktx2Loader to use our transcoder |
| 73 | T7 — `ComparePreview` swap; remove `copyBasisTranscoder` Vite plugin + WebGLRenderer hack |
| 74 | T8 — Equivalence test (our transcoder vs three's, byte-equality of transcoded RGBA on a fixture) |
| 75 | T9 — Whole-repo gate + bundle size delta |
| 76 | T10 — Test gate report |
| 92 | T13 — *(deferred until lighting-stochastic-adoption merges)* — three-flatland `TextureLoader` inline KTX2 branch. Full spec: `2026-05-04-three-flatland-textureloader-ktx2.md`. |

(IDs 68 / 77 / 78 — BaseImageLoader / LoaderRegistry / registry-migration — were **deleted**.)

### Recommended execution order

`T1 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10`. T1 and the T3-T5 transcoder build chain are independent and can parallelize, but T6 needs both.

### Reference files (read before dispatching)

- `.library/three-flatland/loader-architecture.md` — **REQUIRED** architecture reference.
- `planning/bake/loader-pattern.md` — canonical loader-pattern shape (companion).
- `packages/image/src/zig/basis_c_api.{h,cpp}` — Phase 1's encoder C API. Transcoder C API mirrors its shape.
- `packages/image/build.zig` — Phase 1's encoder build. Adding a second target is straightforward.
- `packages/image/vendor/basisu/transcoder/basisu_transcoder.cpp` — already vendored. Phase 2.1.2 just compiles it.
- `tools/vscode/webview/encode/ComparePreview.tsx` — current KTX2 code path uses three's KTX2Loader; T7 swaps to ours.
- `tools/vscode/vite.config.ts` — has `copyBasisTranscoder()` plugin to delete in T7.

### Bridge / runtime notes

- The encode tool's webview keeps its current `@three-flatland/image` import as the source of jsquash decoders (PNG/WebP/AVIF for the encoded preview). Tools-side wasm doesn't change.
- The runtime side (`packages/three-flatland/src/loaders/`) does NOT change in this phase. The Tier 1 inline KTX2 branch in `TextureLoader`/`SpriteSheetLoader` is deferred (T13) until `lighting-stochastic-adoption` merges, since that branch rewrites those loaders.

## What's already on `lighting-stochastic-adoption` (will graft onto eventually)

- `packages/three-flatland/src/loaders/TextureLoader.ts` (190 lines) — extends `three.Loader<Texture>`, wraps THREE's TextureLoader, adds preset hierarchy. Ready to host an inline KTX2 branch.
- `packages/three-flatland/src/loaders/SpriteSheetLoader.ts` — composes against TextureLoader + `@three-flatland/normals`.
- `packages/three-flatland/src/loaders/{LDtkLoader,TiledLoader}.ts` — moved out of `tilemap/`.
- `packages/normals/` — sibling package with `NormalMapLoader` (baked → runtime pattern).

T13 grafts our KTX2 path onto that branch's TextureLoader/SpriteSheetLoader, not the current shape on feat-vscode-tools.

## Manual verification still pending from Phase 2.1.1

The user reported the mip viewer didn't show different mips when toggled. A debug log was added that prints `[encode] KTX2 decoded: N mip level(s), format=…, dims=[…]` after KTX2 decode. The user has not reported back. May resolve in T7 when our owned Ktx2Loader replaces three's stock.

## What NOT to do

- **Do NOT recreate `BaseImageLoader` or `LoaderRegistry`.** The 2026-05-04 review explicitly rejected them. See `.library/three-flatland/loader-architecture.md` rule 1.
- Don't add wasm-based PngLoader/WebpLoader/AvifLoader to the runtime. Browsers handle those.
- Don't import or vendor `@spark/web` or any spark.js code anywhere. License audit blocks it.
- Don't change the encode tool's tools-side `@three-flatland/image` jsquash decoders. Those are tool-only.
- Don't break atlas / merge tools. CanvasStage's existing single-image consumers must continue working unchanged.

## Branch hygiene

- Stage by exact path. No `git add -A` / `git add .` / `git commit -a`.
- Conventional Commits (releases cut from changesets).
- No Co-Authored-By line.

## Quick recovery if /compact loses something

Read in this order on fresh context:

1. **`.library/three-flatland/loader-architecture.md`** — architecture rules (must-read).
2. `planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md` Phase 2.1.2 section — what to build.
3. This anchor doc.
4. Memory: `feedback_loader_architecture.md` — captures the rejected-abstraction rule.
