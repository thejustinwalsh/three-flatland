---
date: 2026-05-04
topic: context-anchor
status: handoff
branch: feat-vscode-tools
purpose: One-page state snapshot for resuming Phase 2.1.2 after a /compact.
---

# Context anchor — resume Phase 2.1.2

This document is a self-contained handoff. Read this and the linked specs; you have everything you need.

## Where we are

`feat-vscode-tools` branch. Phase 2.1.1 (compare-slider primitives + encode tool consumer) shipped. Phase 2.1.2 (loader fork + own transcoder) is the next thing to execute.

## What shipped in Phase 2.1.1

Shared primitives in `@three-flatland/preview/canvas`:

- `ImageSource` — discriminated union (`{kind:'url'} | {kind:'texture'}`); `ThreeLayer` accepts both
- `CompareLayer` — WebGPU R3F + TSL split shader, sibling to ThreeLayer
- `CompareContext` + `useCompareController()` — splitU + loading state via context
- `CanvasStage` extension — `compareImageSource`, `initialSplitU`, `onSplitChange`, `mipLevelB`, `compareLoading` props
- `CompareSliderOverlay` — HTML drag UI (line + handle, click-anywhere-to-seek)
- `CompareLoadingOverlay` — spinner positioned over the right half during encode

Encode tool (`tools/vscode/webview/encode/`) is a thin consumer:
- `ComparePreview.tsx` (130 LOC) builds textures, mounts `<CanvasStage>` with overlays
- KTX2 path uses three's stock `KTX2Loader` with a throwaway WebGLRenderer for `detectSupport()` — **this is the hack Phase 2.1.2 removes**
- Toolbar layout follows merge pattern (Undo/Redo left, Knobs + mip stepper middle, spacer, Save right). Panel headerActions = `<EncodeMenu />` only
- Custom-editor activation on `*.png` / `*.webp` / `*.avif` / `*.ktx2` with inspect mode
- Vite plugin `copyBasisTranscoder()` emits unhashed `basis_transcoder.{js,wasm}` to `dist/webview/assets/` — so three's KTX2Loader's literal-filename fetch resolves
- Bug fixes that landed during shake-out: `gl` → `renderer` prop on webgpu Canvas; `screenUV.x` (not `uv().x`) for the split decision so slider tracks under pan/zoom; `useFrame` + ref to push uniforms (eliminated drag lag); ImageData not stringified in encode subscription (was OOMing); KTX2 race fixed by tracking `encodedFormat` separately from doc-slice `format`; V-flip for `CompressedTexture` sample (KTX2 origin is bottom-left); desat path short-circuited via `select()` to avoid phantom desat at loading=0

Gate report: `planning/superpowers/specs/2026-05-02-image-encoder-compare-slider-gate-report.md`. Whole-repo: 654 tests / 5 skipped / 659 total, 33 builds, 53 typechecks, all green.

## What spark.js decision means

**spark.js is TABLED.** License audit found the shaders are EULA-bound and explicitly prohibited from inclusion in middleware / dev toolkits. Three-flatland is exactly that, so we cannot ship a default integration. See `planning/superpowers/specs/2026-05-02-sparkjs-runtime-design.md` for the full audit. Phase 2.1.2 plan is independent of spark and references it only as a generic "future encoder integration" placeholder.

## Phase 2.1.2 — what to build

Spec: `planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md` (the `# Phase 2.1.2 — three-flatland image loader stack` section, near the bottom).

### Goal

Replace the Phase-2.1.1 stopgaps (three's `KTX2Loader`, three's `basis_transcoder.{js,wasm}`, the throwaway WebGLRenderer hack, the Vite copy plugin) with a fully owned loader stack:

- `packages/image/src/loaders/Ktx2Loader.ts` — TS-port of three's KTX2Loader
- `packages/image/src/loaders/BaseImageLoader.ts` — abstraction with `LoaderResult.recovery: RecoveryDescriptor` field
- `packages/image/src/loaders/registry.ts` — `LoaderRegistry` with lazy Ktx2 proxy + `NativeBitmapLoader` for PNG/WebP/AVIF (no wasm in the runtime for browser-supported formats)
- `packages/image/src/zig/basis_transcoder_c_api.{h,cpp}` + `packages/image/build.zig` second target — our own `basis_transcoder.wasm` from the same vendored sources we already use for the encoder
- `packages/image/src/runtime/transcoder-loader.ts` — JS wrapper around our transcoder wasm
- Migration of three-flatland's `TextureLoader` / `SpriteSheetLoader` to dispatch via the registry

### Critical constraints

- **Browser-only runtime — no wasm decoders for PNG/WebP/AVIF.** Native `ImageBitmapLoader` is the path for those. Wasm-based jsquash decoders stay in `@three-flatland/image` for tools/CLI bakers, NOT for the runtime.
- **Lazy everything.** `import { Ktx2Loader }` is ~2KB; the wasm transcoder + JS wrapper only fetch on first KTX2 parse.
- **`LoaderResult.recovery: RecoveryDescriptor`** is the device-lost-recovery seam (Phase 3.0 builds the coordinator on top). Subclasses populate it at parse time. Cheap to add now, expensive to retrofit.
- **No vendored upstream binaries.** Three's `basis_transcoder.{js,wasm}` get removed; ours replace them. Vite's `copyBasisTranscoder` plugin in `tools/vscode/vite.config.ts` should also be removed as part of this phase.
- **WebGL2 + WebGPU both supported** — `renderer` parameter accepts either. Adapt internally per backend.

### Task list (12 tasks, IDs in TaskList)

| ID | Task |
|---|---|
| 67 | T1 — Vendor + TS-port three's KTX2Loader to `packages/image/src/loaders/Ktx2Loader.ts` |
| 68 | T2 — `BaseImageLoader<T>` abstraction (with `recovery` field) |
| 69 | T3 — `basis_transcoder_c_api.{h,cpp}` flat C API |
| 70 | T4 — Add `basis_transcoder` zig build target |
| 71 | T5 — Transcoder JS wrapper (`runtime/transcoder-loader.ts`) |
| 72 | T6 — Wire Ktx2Loader to use our transcoder |
| 73 | T7 — ComparePreview swap to our Ktx2Loader (drops the throwaway WebGLRenderer + the Vite copy plugin) |
| 74 | T8 — Equivalence test (our transcoder vs three's, on a fixture KTX2) |
| 75 | T9 — Whole-repo gate + bundle size delta |
| 76 | T10 — Test gate report |
| 77 | T11 — LoaderRegistry + lazy Ktx2 + NativeBitmapLoader fallback (with `Map<TextureId, RecoveryDescriptor>`) |
| 78 | T12 — Migrate three-flatland's TextureLoader / SpriteSheetLoader to use the registry |

### Recommended execution order

Tasks are mostly sequential but two pairs can be parallelized:
- T2 (BaseImageLoader) and T1 (KTX2 TS-port) — independent. Do T2 first; T1 then extends it.
- T3 / T4 / T5 (C API + zig target + JS wrapper) — sequential, but they're independent of the JS-side work in T1/T2.
- T6 needs both T1 (loader class) and T5 (transcoder JS wrapper).
- T11 needs T2 and T1.
- T12 needs T11.
- T7 (ComparePreview swap) is the integration test — needs everything else but is the smoke check.

A reasonable order: **T2 → T1 → T3 → T4 → T5 → T6 → T11 → T12 → T7 → T8 → T9 → T10**.

### Reference files (read before dispatching)

- `packages/image/src/zig/basis_c_api.{h,cpp}` — Phase 1's encoder C API. The transcoder C API mirrors its shape.
- `packages/image/build.zig` — Phase 1's encoder build. Adding a second target is straightforward.
- `packages/image/vendor/basisu/transcoder/basisu_transcoder.cpp` — already vendored. Phase 2.1.2 just compiles it.
- `tools/vscode/webview/encode/ComparePreview.tsx` — current KTX2 code path uses three's KTX2Loader; T7 swaps to ours.
- `tools/vscode/vite.config.ts` — has `copyBasisTranscoder()` plugin to delete in T7.

### Bridge / runtime notes

- The encode tool's webview will keep its current `@three-flatland/image` import as the source of jsquash decoders (PNG/WebP/AVIF for the encoded preview). Tools-side wasm doesn't change.
- The runtime side (`packages/three-flatland/src/loaders/`) is what changes — composing against `@three-flatland/image/loaders` registry instead of using three's TextureLoader directly for KTX2.

## Manual verification still pending from Phase 2.1.1

The user reported the mip viewer didn't show different mips when toggled. Last action was a debug log that prints `[encode] KTX2 decoded: N mip level(s), format=…, dims=[…]` after KTX2 decode. **The user has not reported back what the log says.** This may resolve itself once Phase 2.1.2's owned loader lands (which will fully control the mip-data path and the WebGPU renderer integration). Worth re-checking after T7.

## What NOT to do

- Don't add wasm-based PngLoader/WebpLoader/AvifLoader to the runtime. Browsers handle those.
- Don't import or vendor `@spark/web` or any spark.js code anywhere. License audit blocks it.
- Don't change the encode tool's tools-side `@three-flatland/image` jsquash decoders. Those are tool-only.
- Don't break atlas / merge tools. CanvasStage's existing single-image consumers must continue working unchanged through the loader migration. T12 (three-flatland TextureLoader migration) is where that risk lives — verify atlas + merge after T12.

## Branch hygiene

- Stage by exact path. No `git add -A` / `git add .` / `git commit -a`.
- Conventional Commits (releases cut from changesets).
- No Co-Authored-By line.
- Commit messages used in Phase 2.1.1: `feat(image): ...`, `feat(preview): ...`, `feat(vscode): ...`, `fix(...)`, `build(...)`, `docs(...)`. Follow the same.

## Quick recovery if /compact loses something

The two specs to re-read on fresh context:

1. `planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md` — Phase 2.1.2 design + tasks (search `# Phase 2.1.2`)
2. `planning/superpowers/specs/2026-05-02-sparkjs-runtime-design.md` — only the "TABLED" banner + license audit if you wonder why spark isn't in the plan

Plus this anchor doc itself.
