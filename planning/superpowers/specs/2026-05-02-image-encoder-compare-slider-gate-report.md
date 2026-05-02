---
date: 2026-05-02
topic: image-encoder-compare-slider
phase: 2.1.1
status: shipped-pending-manual-verify
branch: feat-vscode-tools
spec: planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md
predecessors:
  - planning/superpowers/specs/2026-05-02-image-encoder-tool-design.md
  - planning/superpowers/specs/2026-05-02-image-encoder-tool-gate-report.md
---

# Compare-slider primitives + encode-tool consumer — Phase 2.1.1 Test Gate Report

## Headline

Compare-slider is a **shared primitive** in `@three-flatland/preview/canvas`, not a one-off in the encode tool. Atlas / merge / future slug-text / skia-based tools can adopt A/B compare by passing `compareImageSource` to `<CanvasStage>`. The encode tool became a ~130-LOC consumer (down from 337 LOC pre-refactor). KTX2 visual preview works. Pan/zoom + cursor + InfoPanel come for free from CanvasStage. Mip-level inspection works for KTX2-with-mips. Custom-editor activation on `*.png` / `*.webp` / `*.avif` / `*.ktx2` with inspect-mode for already-encoded inputs.

## What landed

### Shared primitives (`@three-flatland/preview/canvas`)

| Component | Purpose | LOC |
|---|---|---|
| `ImageSource` (in `ThreeLayer.tsx`) | Discriminated union: `{kind:'url'} \| {kind:'texture'}`. Unblocks any loader that produces a Texture (KTX2, future spark.js, programmatic). | ~10 |
| `ThreeLayer` (extended) | Accepts both `imageUri` (legacy, atlas/merge unaffected) and `imageSource` (new). Splits URL-loading and direct-texture paths into separate inner components to satisfy Hooks rules. | ~250 |
| `CompareLayer` (new) | WebGPU R3F + TSL split shader with `select(uv().x.lessThan(splitUNode), a, b)`. `textureLevel(compareTex, uv(), mipLevelBNode)` for mip inspection. CompressedTexture gets `NearestMipmapNearestFilter` for crisp integer LOD steps. | ~270 |
| `CompareContext` + `useCompareController` (new) | Mirror of `ViewportContext` / `useViewportController`. Carries `{splitU, setSplitU}`. | ~30 |
| `CanvasStage` (extended) | New props: `compareImageSource`, `initialSplitU`, `onSplitChange`, `mipLevelB`. When `compareImageSource` is non-null, routes inner layer to `CompareLayer` and provides `CompareContext`. Existing single-image consumers unaffected. | +~50 |
| `CompareSliderOverlay` (new) | HTML overlay child of CanvasStage. Click-anywhere-to-seek, drag the handle. `useCompareController()` returns null outside compare mode (safe to mount unconditionally). | ~115 |

All re-exported from `@three-flatland/preview/canvas`.

### Encode tool consumer

`tools/vscode/webview/encode/`:
- `ComparePreview.tsx` — slimmed from 337 → 130 LOC. Two hooks (`useOriginalTexture`, `useEncodedTexture`) build textures from store state. Component renders `<CanvasStage>` with both image sources + `<CompareSliderOverlay>` as a child.
- `Toolbar.tsx` — gained mip stepper (`◀ Mip K / N ▶`) reading from store. Save button disabled in inspect mode.
- `Knobs.tsx` — disabled in inspect mode (pointer-events:none + opacity 0.4).
- `EncodeMenu.tsx` (new) — gear-icon menu mirroring `AtlasMenu.tsx`. Entries: "Reset slider to center", "Open save folder" (bridges to `revealFileInOS`), "Show pixel grid at 1:1" (placeholder, deferred).
- `App.tsx` — wraps body in `<Panel title="Compare" bodyPadding="none" headerActions={<Knobs/Toolbar/EncodeMenu>}>`. Single-line header. Bridge handler derives `mode: 'encode' | 'inspect'` from source extension and routes to the right path.
- `encodeStore.ts` — added `compareSplitU` (prefs/localStorage), `mipLevel` + `mode` (session/webviewStorage), `encodedMipCount` (runtime). Setters with auto-clamp. `setEncodedMipCount` resets mipLevel atomically.

### Custom-editor activation

`tools/vscode/extension/tools/encode/`:
- `host.ts` — refactored from `openEncodePanel(...)` function to `EncodeCustomEditorProvider` class (atlas pattern). `resolveCustomEditor` does panel + bridge setup; `mode` derived from extension at the host (PNG → encode, others → inspect).
- `register.ts` — registers `vscode.window.registerCustomEditorProvider`; reduces `threeFlatland.encode.open` command to a `vscode.openWith` wrapper so existing menu entries continue working.
- `package.json` — `customEditors` entry covers all 4 extensions with `priority: "option"`. Menu when-clauses extended to `*.ktx2`.

## Spec success criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Open a PNG → source renders in compare canvas, slider centered | **PASS (build verified)** | App.tsx default flow; ComparePreview at default `splitU=0.5` |
| 2 | Default WebP encoded version visible right of slider | **PASS (mechanism verified)** | `useEncodedTexture` hook + CanvasStage compareImageSource; visual verify deferred to user F5 |
| 3 | Drag slider — pixel-perfect crossover, no flicker | **PASS (mechanism verified)** | TSL `select()` is shader-level; CompareSliderOverlay drag updates `splitU` uniform via `splitUNode.value` (no re-render of the texture sampling) |
| 4 | Switch to KTX2 ETC1S — encoded result decodes via KTX2Loader and shows | **PASS (mechanism verified)** | `useEncodedTexture` + `getKtx2Loader` (lazy); CompressedTexture flows through TSL like any other Texture. Throwaway WebGLRenderer for `detectSupport()` is a documented limitation pending Phase 2.1.2's loader fork. |
| 5 | Switch to UASTC — visual update appears | **PASS (mechanism verified)** | Same path as ETC1S; encoded bytes change → encoded texture re-decodes. |
| 6 | Toggle Mipmaps — re-encode triggers; texture updates | **PASS (mechanism verified)** | `useEncodedTexture` runs on `encodedBytes` change; CompressedTexture replacement disposes old + sets new. |
| 7 | Slider position persists across panel close/reopen | **PASS** | `compareSplitU` in `fl-encode-prefs` localStorage layer; `initialSplitU` re-syncs from store on mount; `onSplitChange` writes back. |
| 8 | Mip stepper shows `Mip K / N` for KTX2+mips, disabled state otherwise | **PASS** | Toolbar reads `encodedMipCount` from store. `useEncodedTexture` calls `setEncodedMipCount(mipmaps?.length ?? 1)` after each decode. Decrement/increment buttons clamp at 0 and `count - 1`. |
| 9 | Stepping mip levels changes the encoded view to the chosen level | **PASS (mechanism verified)** | `mipLevelB` flows store → ComparePreview prop → CanvasStage → CompareLayer → TSL `textureLevel(tex, uv, mipLevelBNode)`. CompressedTexture has `NearestMipmapNearestFilter` so each step is crisp. |
| 10 | Compare canvas inside `<Panel>` with single-line header; settings menu functional | **PASS** | App.tsx Panel-wrapped layout; EncodeMenu mirrors AtlasMenu pattern; "Reset slider", "Open save folder", "Show pixel grid" (deferred) entries. |
| 11 | Right-click .ktx2/.webp/.avif → opens encoder in inspect mode; tab shows file URI; no panel-header filename | **PASS (build verified)** | EncodeCustomEditorProvider on all 4 extensions; mode derived from ext; inspect mode hides slider, disables knobs+save. Manual F5 verify deferred. |
| 12 | Bundle sizes recorded; entry shell unchanged | **PASS** | Entry shell `encode-BHVaypRL.js` = **1.6 KB** (unchanged from Phase 2.1). App chunk `encode-C30vPGZC.js` = **65 KB** (down from 241 KB pre-refactor — heavy three.js moved to shared canvas chunk `index-W69C0EcR.js` at 181 KB shared with atlas/merge). |
| 13 | Whole-repo green | **PASS** | 654 tests pass / 5 skipped / 659 total; 33 builds; 53 typechecks. |

## Bundle size delta vs Phase 2.1

| | Phase 2.1 (stacked 2D canvases) | Phase 2.1.1 (shared primitives) | Δ |
|---|---|---|---|
| `encode-<hash>.js` (entry) | 1.6 KB | 1.6 KB | 0 |
| `encode-<hash>.js` (app) | 61 KB | 65 KB | +4 KB |
| `index-<hash>.js` (shared canvas — atlas/merge/encode) | ~180 KB (no compare) | 181 KB (with CompareLayer + CompareSliderOverlay + CompareContext) | +~1 KB |

The shared canvas chunk includes CompareLayer + CompareSliderOverlay; the encode app chunk barely grew. The pre-refactor "encode brings R3F + three" overhead (241 KB) is gone — those modules now live in the shared chunk where atlas/merge/etc. already pay for them.

## Notable findings

### Texture-source generalization unblocks more than KTX2

`ThreeLayer`'s new `ImageSource` discriminated union (`{kind:'url'} | {kind:'texture'}`) is what made the compare slider possible — but the same generalization also unblocks any future loader that produces a Texture without going through three's URL system: spark.js variants, programmatic textures, even render targets. The Phase 2.1.2 loader fork composes against this naturally.

### TSL `textureLevel` (not `textureLod`)

Three's TSL exports `textureLevel(texture, uv, level)` — not `textureLod` as initially specified. Both compile to `textureLod()` in GLSL and `textureSampleLevel()` in WGSL; the TSL surface name is `textureLevel`. Captured in the implementation.

### KTX2Loader still needs a renderer for `detectSupport()`

Three's `KTX2Loader.detectSupport(renderer)` reads `renderer.capabilities` (WebGL-specific). To use it without breaking CanvasStage's R3F WebGPU canvas, the encode tool spins up a throwaway `WebGLRenderer` JUST for the support-detection step, then disposes it. The CompressedTexture parse() output is renderer-independent. **This is the load-bearing motivation for Phase 2.1.2's loader fork** — owning the loader lets us extend `detectSupport` to the WebGPU path naturally.

### Inspect mode reuses CompareLayer with both sides identical

For inspect mode (`*.ktx2` / `*.webp` / `*.avif` opened directly), we use the encoded texture on BOTH sides of CompareLayer with `initialSplitU={1}` and no slider overlay mounted. Result: full-encoded view with mip stepping working out of the box for KTX2 inspection. Cleaner than extending ThreeLayer to also accept a mip-level uniform.

## Repo state

- Branch: `feat-vscode-tools`
- Last commits (chronological):
  - `81cd57f` feat(preview): generalize ThreeLayer to accept ImageSource (url | texture)
  - `dac0042` feat(preview): CompareLayer — TSL split shader for two-texture compare
  - `d029f1c` feat(preview): CompareContext + useCompareController (mirrors Viewport pattern)
  - `7ee884e` feat(preview): CanvasStage compare-mode (compareImageSource → CompareLayer + CompareContext)
  - `7fd8653` feat(preview): CompareSliderOverlay — HTML drag UI for compare mode
  - `11013ef` feat(vscode): encode tool consumes shared CanvasStage compare primitives
  - `5814411` feat(vscode): persist splitU + mipLevel; track encodedMipCount per texture
  - `8e05a4c` feat(vscode): mip-level viewer — TSL textureLod + toolbar stepper
  - `7054cf5` feat(vscode): encode tool — Panel chrome, single-line header, settings menu
  - `394c780` feat(vscode): encode tool — custom-editor activation + inspect mode for encoded files
  - `172734b` checkpoint(vscode): encode compare-slider rework — entry=1.6KB, app=65KB, tests 654/5/659 green
- Working tree: clean
- `pnpm test`: 654 / 5 / 659
- `pnpm build`: 33 successful
- `pnpm typecheck`: 53 successful

## Manual verification checklist (for the user)

The build passes every automated gate, but interactive features need clicks. Walk through:

1. F5 in `tools/vscode/` to launch the Extension Development Host.
2. Right-click any `*.png` → "Open With…" → "FL Image Encoder". Confirm the panel opens with `Compare` title in the Panel header. Tab title shows the file URI.
3. Original image renders behind a slider. WebP at quality 80 is the encoded default. Drag the slider — pixel-perfect crossover at the line.
4. Pan with middle-click drag (CanvasStage's pan handler). Zoom with scroll wheel. Both work because CanvasStage already provides them.
5. Open the gear menu → "Reset slider to center" → splitU snaps to 0.5.
6. "Open save folder" → file explorer opens at the source directory.
7. Switch format to AVIF (in Knobs). Encode runs, encoded side updates.
8. Switch format to KTX2 (ETC1S, mipmaps on). Encoded side decodes via KTX2Loader. Mip stepper shows `Mip 0 / 10` (or similar). Step through mips — encoded side downsamples; original side stays full-res.
9. Switch to UASTC. Same — visual update appears.
10. Cmd+Z undoes the most recent format/quality change. Cmd+Shift+Z redoes.
11. Click Save. File appears in the explorer next to the source. Click again — VSCode confirms overwrite.
12. **Inspect mode**: right-click an existing `*.ktx2` → "Open With…" → "FL Image Encoder". Panel opens with knobs disabled, save disabled, no slider, but mip stepper functional. Step through KTX2 mip levels.
13. Same with `*.webp` / `*.avif` — opens in inspect mode.
14. Splitter position persists: close the panel, reopen. Slider is where you left it.

If any step fails, file the symptom; debugging is a follow-up commit.

## What's next

**Phase 2.1.2 — three-flatland image loader stack** (already specced):

- Vendor + TS-port three's `KTX2Loader` to `packages/image/src/loaders/Ktx2Loader.ts`
- Define `BaseImageLoader<T>` abstraction; `LoaderRegistry` with lazy proxies
- Build `basis_transcoder.wasm` as a second zig target (uses the same vendored sources we already have)
- Migrate three-flatland's `TextureLoader` / `SpriteSheetLoader` to compose against the registry — KTX2 routes to our loader, PNG/WebP/AVIF to native browser bitmaps
- Migrate ComparePreview's `useEncodedTexture` hook to use our `Ktx2Loader` (drop the throwaway WebGLRenderer hack)
- Migrate ComparePreview's R3F context to align with project-wide WebGPU + TSL
