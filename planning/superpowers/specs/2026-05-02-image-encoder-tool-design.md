---
date: 2026-05-02
topic: image-encoder-tool
phase: 2.1
status: draft
branch: feat-vscode-tools
predecessors:
  - planning/superpowers/specs/2026-05-01-image-encoder-design.md
  - planning/superpowers/specs/2026-05-01-image-encoder-path-b-design.md
gate-reports:
  - planning/superpowers/specs/2026-05-01-image-encoder-test-gate-report.md
  - planning/superpowers/specs/2026-05-01-image-encoder-path-b-gate-report.md
---

# VSCode tool: Image Encoder (Squoosh-style A/B)

## Goal

A VSCode webview that opens an image (PNG/WebP/AVIF — anything `@jsquash/*` decodes) and lets the user A/B compare it against a re-encoded variant in WebP, AVIF, or KTX2. Quality knobs are interactive; encode runs locally in the webview against the `@three-flatland/image` package (which now ships with the Path B BasisU encoder for KTX2). Save writes the chosen variant alongside the source.

## Why this works in a webview

Path B's gate-report confirmed the WASM stack runs at full speed in a browser context: 4138 ms to encode a 2048² atlas to ETC1S+mips. For the much smaller images typical of game assets (256² – 1024²), interactive A/B encoding is comfortable. The predecessor phase's WASM-in-webview harness already proved jsquash + our basis_encoder.wasm load cleanly under VSCode's CSP.

## Activation pattern

**Ad-hoc command, NOT a custom editor.** Atlas already owns the `*.png` custom-editor registration as the primary viewer for sprite atlases. The encoder is a transformation/inspection tool you reach for occasionally — Squoosh's analog is "open this image to compare encoding settings", not "this is how I view PNGs."

Wired up exactly like merge:

- `threeFlatland.encode.open` command
- `explorer/context` menu when `resourceExtname == .png || == .webp || == .avif`
- `commandPalette` available when an image is the active editor

Single-image input only at v0; batch mode is a Phase 2.2 follow-up.

## Architecture

```
extension/tools/encode/                webview/encode/
├── register.ts       command          ├── index.html          FOUC guard
└── host.ts           panel + bridge   ├── main.tsx            boot + lazy chunks
                                       ├── App.tsx             tree
                                       ├── encodeStore.ts      Zustand + zundo
                                       ├── OriginalView.tsx    left panel
                                       ├── EncodedView.tsx     right panel
                                       ├── Knobs.tsx           format + quality
                                       └── Toolbar.tsx
```

Mirror the merge tool's file shape exactly. Differences:

- No "sources" list — encode is single-image.
- No worker — encode runs on the main thread for v0; the webview blocks during a heavy KTX2 encode (~4s for 2048²). This is acceptable when the user explicitly hits "Encode" or sits between knob tweaks. A worker is a Phase 2.2 polish.
- Decode happens once at init (PNG/WebP/AVIF source); encode runs every time knobs change (debounced).

## Data flow

```
Host → Webview (encode/init)        { imageUri, fileName, sourceBytes (Uint8Array) }
Webview                              decode source → ImageData (cached)
Webview (knob change, debounced)     encode ImageData → encodedBytes; decode encodedBytes → ImageData (for display)
Webview → Host (encode/save)         { format, bytes, suggestedFilename } → { ok, savedUri }
```

The host reads the source bytes and ships them with `encode/init` rather than handing the webview a fetchable URI. Reasons:
1. Some bundlers / VSCode security layers make webview-side `fetch(vscode-webview://…)` brittle for binary assets.
2. The host already needs to read the file to validate it exists; one read on each side is wasteful.
3. Bytes-via-bridge is the same pattern merge uses for source images — consistent.

## State (encodeStore.ts)

Layered persist + zundo per the merge / atlas template.

```ts
// Document slice (zundo-tracked)
interface DocSlice {
  format: 'webp' | 'avif' | 'ktx2'
  webp: { quality: number }
  avif: { quality: number }
  ktx2: { mode: 'etc1s' | 'uastc'; quality: number; mipmaps: boolean; uastcLevel: 0|1|2|3|4 }
}

// Session slice (webviewStorage)
interface SessionSlice {
  imageUri: string
  fileName: string
  sourceBytes: Uint8Array | null      // for re-encode after rehydrate
  // sourceImage is derived from sourceBytes — not persisted; recomputed onRehydrateStorage
  // encodedBytes / encodedImage are derived — not persisted
}

// Prefs slice (localStorageStorage)
interface PrefsSlice {
  splits: { encodedPanel: number }    // px width of the right panel
  showOriginalSize: boolean           // toggle filesize display in original view
}
```

Rules from the CLAUDE.md guidelines:
- zundo `partialize` covers ONLY `DocSlice`. UI state (`encodedBytes`, `isEncoding`, `encodeError`) is not undoable.
- Equality is content-based: shallow compare each format sub-object.
- 100ms debounced `handleSet`.
- `loadInit` action that does setState + `temporal.getState().clear()` on init/rehydrate.
- `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` mounted at App level, skipping when focus is in an INPUT.

## UI

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Toolbar:  [↶ undo] [↷ redo]   |   format: [webp ▾]   |   [save]           │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ Original                             │ Encoded · webp                      │
│                                      │                                     │
│   <canvas filling area>              │   <canvas filling area>             │
│                                      │                                     │
│   642 × 480 · 312 KB PNG             │   642 × 480 · 41 KB · 7.6×          │
└──────────────────────────────────────┴─────────────────────────────────────┘
                                       │ Knobs (in right panel footer)
                                       │   Quality: [───●─────] 80
                                       │   Mipmaps: [✓]    (KTX2 only)
                                       │   Mode:    [ETC1S ▾]  (KTX2 only)
```

Splitter dividing left/right at 50/50 by default; user-resizable, position persisted in prefs slice.

Knobs are conditional:
- WebP: quality (0–100)
- AVIF: quality (0–100)
- KTX2: mode (ETC1S/UASTC), quality (1–255 for ETC1S), mipmaps, uastcLevel (0–4 for UASTC)

Each canvas renders the decoded ImageData. Use a `<Panel bodyPadding="none">` chrome around each. Image fits to panel via CSS `object-fit: contain`. Pixel-grid view (no smoothing) when zoomed beyond 1:1 — Phase 2.2.

## Live encode behavior

Knob changes trigger a debounced (~250ms) encode. While encoding, show a subtle progress indicator (a `<vscode-progress-ring>` overlay on the encoded canvas). Old encoded image stays visible until the new one is ready, so the user has visual continuity.

If the user changes knobs during an in-flight encode, the in-flight result is discarded (race-protected via a request-id pattern; only the latest wins). KTX2 takes ~1-4 s on 2048², so this matters.

## Save

`encode/save` request payload: `{ format, bytes, suggestedFilename }` where `suggestedFilename` is `<basename>.<ext>` next to the source. The host writes via `vscode.workspace.fs.writeFile` and returns `{ ok: true, savedUri }`. The webview surfaces a tiny "Saved!" toast via `<vscode-progress-ring>` swap → checkmark.

If the target file exists, the host shows VSCode's standard overwrite confirmation dialog before writing. This matches how the existing CLI baker handles `--force`.

## Out of scope (Phase 2.2)

- Batch mode (multi-image input).
- Web Worker for encode (avoid main-thread blocking on KTX2).
- Pixel-grid / pan-zoom canvas controls.
- Custom editor on `*.webp` / `*.avif` / `*.ktx2` (open and inspect existing encoded files).
- Animated atlas preview during the encode (loop a sprite anim through the encoder).
- Preset profiles ("web hero", "atlas-etc1s", etc.).

## Risks

| Risk | Mitigation |
|---|---|
| WASM CSP issues in the webview | Predecessor phase's harness already verified jsquash + basis_encoder.wasm load under VSCode's CSP with `wasm-unsafe-eval`. The encode tool reuses `composeToolHtml` which sets that CSP. |
| Main-thread blocking during KTX2 encode (~4 s on 2048²) | Acknowledged. Show `<vscode-progress-ring>` overlay. Workers are Phase 2.2. |
| Source images bigger than message-channel limits | VSCode's webview message bus handles MB-scale payloads but isn't designed for it. For v0, limit input to ≤ 16 MB; reject larger and surface a friendly error. |
| Bundle size with @three-flatland/image transitive WASM (~3 MB basis_encoder.wasm + jsquash blobs) | The wasm files are loaded at runtime via fetch; they don't bloat the JS bundle. They DO need to be reachable from the webview's localResourceRoots — must include `dist/vendor/` and the package's wasm subpaths. |

## Success criteria

1. Right-clicking a `*.png` (or `*.webp`/`*.avif`) → "FL Image: Open Encoder" opens a panel.
2. Source image renders in the left canvas; size + format displayed.
3. Selecting WebP at quality=80 produces a visually-identical-to-the-eye encoded image in the right canvas with size + ratio displayed; encode completes in < 500 ms for a 1024² source.
4. Selecting AVIF at quality=60 same as above; encode completes in < 1000 ms.
5. Selecting KTX2 (ETC1S, quality=128, mips=on) produces a valid KTX2 with size displayed; encode completes in < 5000 ms for 2048² (matches Path B gate).
6. Save writes `<source>.{webp|avif|ktx2}` next to the source; if file exists, prompts overwrite.
7. Undo/redo via Cmd/Ctrl+Z works on knob and format changes.
8. Splitter width persists across panel close/reopen.
9. `pnpm --filter @three-flatland/vscode build` succeeds; the encode shell chunk is < 30 KB.
