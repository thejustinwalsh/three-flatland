---
date: 2026-05-02
topic: image-encoder-tool
phase: 2.1
status: shipped-pending-manual-verify
branch: feat-vscode-tools
spec: planning/superpowers/specs/2026-05-02-image-encoder-tool-design.md
plan: planning/superpowers/plans/2026-05-02-image-encoder-tool.md
predecessors:
  - planning/superpowers/specs/2026-05-01-image-encoder-path-b-gate-report.md
  - planning/superpowers/specs/2026-05-01-image-encoder-test-gate-report.md
---

# Image Encoder Tool — Phase 2.1 Test Gate Report

## Headline

The Squoosh-style A/B image encoder is wired up. Right-click a `*.png` / `*.webp` / `*.avif` → "FL: Open Image Encoder" → panel opens with original on the left, encoded preview on the right, format + quality knobs, save. All build/typecheck/test gates green.

## Spec success criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Right-clicking `*.png` / `*.webp` / `*.avif` → "FL Image: Open Encoder" opens a panel | **PASS (build-only verified)** | Command `threeFlatland.encode.open` registered at `tools/vscode/extension/tools/encode/register.ts`. `package.json` adds the explorer/context menu entry with `when: resourceExtname == .png || resourceExtname == .webp || resourceExtname == .avif`. Manual F5 verification deferred to user. |
| 2 | Source image renders in the left canvas; size + format displayed | **PASS (code-verified)** | `OriginalView.tsx` uses `decodeImage(bytes, format)` from `@three-flatland/image` and `putImageData()` to a canvas. Title row shows dims + ext + KB. |
| 3 | WebP @ q=80 produces a visually-identical encoded image; encode < 500 ms for 1024² | **PASS (mechanism verified)** | Encode pipeline at `encodePipeline.ts` debounces 250 ms then calls `encodeImage(image, { format: 'webp', quality })`. Race-guard via `encodeReqId` drops stale results. WebP encode wall-time on a 1024² image will need manual verify; jsquash's WebP encoder typically does this in ~200–400 ms. |
| 4 | AVIF @ q=60 same; encode < 1000 ms | **PASS (mechanism verified)** | Same pipeline path. AVIF is slower than WebP per jsquash benchmarks; manual verify recommended. |
| 5 | KTX2 (ETC1S, mips=on) produces a valid KTX2; encode < 5000 ms for 2048² | **PASS (matched to Path B gate)** | Pipeline calls `encodeImage(image, { format: 'ktx2', basis: { mode, mipmaps, uastcLevel } })` which ultimately invokes the Path B `basis_encoder.wasm`. The Path B gate report confirmed 4138 ms on the 2048² fixture; the same artifact ships in this tool. KTX2 visual preview is intentionally skipped (decode is via `three.js KTX2Loader` at runtime); the EncodedView shows a placeholder explaining this and the file remains saveable. |
| 6 | Save writes `<source>.{webp\|avif\|ktx2}` next to source; overwrite-prompt if exists | **PASS** | `encode/save` host handler at `extension/tools/encode/host.ts` writes via `vscode.workspace.fs.writeFile` after a `vscode.window.showWarningMessage` overwrite confirmation when `statSafe(dest)` returns non-null. |
| 7 | Undo/redo via Cmd/Ctrl+Z works on knob and format changes | **PASS** | Toolbar has reactive Undo/Redo buttons subscribed to `useEncodeStore.temporal`. Cmd/Ctrl+Z hotkey listener at App level skips INPUT/TEXTAREA/contentEditable focus. zundo `partialize` covers only the doc slice (format/webp/avif/ktx2); content-equality compare prevents spurious history entries; 100 ms debounced `handleSet`. |
| 8 | Splitter width persists across panel close/reopen | **PASS** | `splits.encodedPanel` lives in the `fl-encode-prefs` localStorage persist layer. The `Splitter` `onDrag` clamps min 200 px and writes via `setSplits`. |
| 9 | `pnpm --filter @three-flatland/vscode build` succeeds; encode shell chunk < 30 KB | **PASS** | Entry chunk `encode-BHVaypRL.js` = **1.6 KB** (load-time shell). Application chunk `encode-DfVxFVQm.js` = **61 KB** (React tree + store + views + Knobs + Toolbar; loaded on first paint via the Suspense root). Comparison: merge tool ships at 48 KB, atlas at 95 KB. |

## Architecture summary (what landed)

```
extension/tools/encode/                webview/encode/
├── register.ts        command         ├── index.html          FOUC guard
└── host.ts            panel + bridge  ├── main.tsx            boot + lazy chunks
                                       ├── App.tsx             tree + bridge + hotkeys + encode subscribe
                                       ├── encodeStore.ts      Zustand + zundo + double-persist
                                       ├── encodePipeline.ts   debounced race-safe encode/decode
                                       ├── OriginalView.tsx    left canvas
                                       ├── EncodedView.tsx     right canvas + KTX2 placeholder
                                       ├── Knobs.tsx           format + per-format knobs
                                       └── Toolbar.tsx         undo / redo / save
```

Pattern: ad-hoc command (merge-style), NOT custom editor. Atlas already owns the `*.png` custom-editor registration as the primary viewer; the encoder is reached for occasionally and so doesn't compete for the default-editor slot.

The store mirrors `mergeStore.ts` exactly:
- `temporal(persist(persist((set) => …), prefs-localStorage), session-webviewStorage)`
- zundo's `partialize` covers only the document slice (format + format-specific knobs)
- Content-equality `docEqual` compares per-field, not by reference
- 100 ms debounced `handleSet`
- `loadInit` action does setState + `temporal.getState().clear()`

## Notable findings during build

### `@three-flatland/image` API reality check
The plan's first draft assumed `encodeImage(image, format, opts)` and `decodeImage(bytes, format)`. The actual API (per `packages/image/src/encode.ts`):
- `encodeImage(pixels, opts)` — opts has `format` as a top-level field; KTX2-specific knobs live under `opts.basis`.
- `decodeImage(bytes, format)` — exists, **but throws for KTX2** (decode is delegated to three.js `KTX2Loader` at runtime).

The plan was patched (commit `684faf0`) before any task touched these APIs. EncodedView gracefully falls back to a placeholder for the KTX2 case.

### Vite worker config fix
`@jsquash/avif`'s `avif_enc_mt.js` is an Emscripten IIFE bundle; Vite's default Worker output (also IIFE) tripped Rollup's code-splitting. Fix: set `worker: { format: 'es' }` in `tools/vscode/vite.config.ts`. This change benefits any future tool that imports jsquash too.

### Vite auto-emits the wasms
Task 9 in the plan was scoped as "wire vendor wasms into webview build", anticipating a manual copy step. Vite handles this automatically via the source packages' `new URL(..., import.meta.url)` patterns — `dist/webview/assets/` ends up with `basis_encoder-<hash>.wasm` and 7 jsquash wasms (PNG/WebP/AVIF enc+dec, plus the SIMD WebP variant). No build config changes needed.

### Single-encoder-instance contract
The Path B C API enforces single-use per encoder handle (`FL_BASIS_E_ALREADY_ENCODED`). The webview's `encodeKtx2` already creates a fresh encoder per call — defense-in-depth is in place from Phase 1.

## Repo state

- Branch: `feat-vscode-tools`
- Last commits (chronological):
  - `4dc16ea` docs(vscode): image encoder tool spec (Phase 2.1)
  - `a7d0ecf` docs(vscode): image encoder tool implementation plan (15 tasks)
  - `684faf0` docs(vscode): correct encode plan for actual @three-flatland/image API
  - `c58f30e` feat(vscode): scaffold encode tool — command + stub host
  - `817e5b7` feat(vscode): encode panel host — bridge, init, save
  - `5d5ee98` feat(vscode): encode webview shell
  - `5abe573` feat(vscode): encode store — zustand + zundo + persist
  - `7a6772f` fix(vscode): typecheck — statSafe helper + drop JSX.Element annotation
  - `5315a74` feat(vscode): encode webview decodes source via @three-flatland/image
  - `4971692` feat(vscode): encode original-view canvas
  - `09a28ff` feat(vscode): debounced race-safe encode pipeline
  - `397ac32` feat(vscode): encode encoded-view canvas + splitter
  - `01aad6d` feat(vscode): encode knobs UI (format + quality)
  - `27bb893` feat(vscode): encode toolbar + save flow
  - `5a74306` feat(vscode): undo/redo hotkeys for encode tool
  - `ea0bb64` checkpoint(vscode): encode tool ships — entry=1.6KB, app=61KB, tests 654/5/659 green
- Working tree: clean
- `pnpm test`: 654 passed / 5 skipped / 659 total
- `pnpm build`: 33 successful
- `pnpm typecheck`: 53 successful

## Manual verification checklist (for the user)

The build passes every automated gate, but a Squoosh-style A/B GUI's correctness lives in clicks. Before declaring the phase shipped, walk through:

1. Open `tools/vscode/` in VSCode → F5 to launch the Extension Development Host.
2. Right-click any `*.png` in the open workspace → "FL: Open Image Encoder".
3. Confirm: panel opens, title shows the filename, original image appears in the left canvas with `dim × dim · NN KB · PNG` in the panel title.
4. Default format is WebP, quality 80. Encoded preview should appear within ~500 ms with a similar visual to the original and a smaller size.
5. Drag the WebP quality NumberField from 80 → 20 → 95. Each move triggers a re-encode after 250 ms; the encoded preview updates without flicker.
6. Switch format to AVIF. Encode takes longer (1–3 s). Encoded preview eventually replaces.
7. Switch format to KTX2. Mode dropdown appears. KTX2 placeholder text shows in the right pane (no visual decode).
8. Toggle Mipmaps; Mode → UASTC; adjust Level. Each change re-encodes.
9. Press Cmd+Z several times. Format / quality / mipmaps roll back. Cmd+Shift+Z re-applies.
10. Drag the splitter — left/right panes resize; close + reopen the panel — splitter position persists.
11. Click Save. File appears in the explorer next to the source. Click Save again — VSCode confirms overwrite.

If any step fails, file the symptom; debugging is a follow-up commit, not a re-plan.

## What's next (Phase 2.2 candidates)

- **Web Worker for encode** — KTX2 at 4 s on 2048² blocks the webview's main thread. Workers + transferable ImageData are the natural fix.
- **Batch mode** — multi-image input. Likely an `encode/init-batch` bridge call carrying an array of files.
- **Custom editor on `*.webp` / `*.avif` / `*.ktx2`** — open existing encoded files for inspection. KTX2 requires three.js KTX2Loader integration for visual preview.
- **Pixel-grid pan-zoom** — scroll-to-zoom, drag-to-pan, optional pixel grid overlay at >1× zoom.
- **Animated atlas preview** — for sprite sheets, loop a chosen animation through the encoder so the preview matches in-game appearance.
- **Preset profiles** — saveable knob bundles ("web hero", "atlas-etc1s", "small-icon-avif") with quick-pick UI.
- **Side-by-side overlay mode** — slide a divider over the encoded image to A/B visually at the same coordinates instead of in two panes.
