# Atlas Merge Tool — Design

**Date:** 2026-04-30
**Status:** Draft → ready for plan

## Problem

Animation work routinely spans several source spritesheets, each with their own
`*.atlas.json` sidecar. Shipping them as separate atlases means more draw calls
and more textures to manage. Existing third-party packers (TexturePacker,
free-tex-packer) lose our richer animation/event metadata, and don't understand
our schema. We need an in-editor tool that takes N source `*.atlas.json` files
and produces a single merged atlas — image plus sidecar — preserving frames,
animations (incl. holds, pingpong, events), and per-frame pivots.

## Scope

### In v1

- Multi-select right-click → "Merge atlases…" command in the VSCode Explorer.
- Ephemeral webview panel (no project file).
- Two-tab UI: **Sources** (artboards on a pannable canvas with conflict
  highlighting) and **Merged** (live-packed preview with animation playback).
- Hybrid conflict resolution: pass-through unique names; collisions flagged for
  inline rename, with a per-source "Namespace this source" bulk action.
- MaxRects-BSSF packing, no rotation. Knobs: max output size, padding,
  power-of-two. Output dimensions always rounded up to a multiple of 4.
- Output: new `<name>.png` and `<name>.atlas.json` written via save dialog.
  Original sources untouched. Optional "Delete original `.atlas.json` files"
  checkbox in the save dialog (defaults off).
- Merge orchestrator and packing live in vscode-free modules so a future CLI
  can wrap them.

### Deferred to v2+

- Standalone CLI binary.
- Extrude / edge bleed.
- Trim transparent pixels per frame.
- Persisted merge configurations as a project file (`*.atlasmerge.json`).
- Drag-to-reposition artboards on the canvas (v1 uses an auto grid).
- Multiple output formats (WebP/AVIF/KTX2).

## User flow

1. User multi-selects ≥1 `*.atlas.json` files in the Explorer (or `*.png` files
   that have sidecars; those resolve to their sidecar via filename pattern).
2. Right-click → **"Merge atlases…"** (also available via command palette).
3. A new VSCode webview panel opens, titled e.g. `Merge: knight, goblin,
   player`. It is ephemeral — closing the panel discards in-progress state.
4. **Sources** tab loads with each source rendered as an artboard on a
   pannable/zoomable canvas (`Viewport`/`RectOverlay` from
   `@three-flatland/preview`). The right-side **Conflicts** panel lists frame
   and animation collisions.
5. User resolves conflicts inline (rename per item) or in bulk (toolbar:
   "Namespace this source" applies the source alias as a prefix). Source
   aliases are editable per-artboard, defaulting to the sidecar filename minus
   `.atlas.json`.
6. User switches to **Merged** tab to see the live-packed atlas (re-packs on
   any source/alias/name/knob change). Animation drawer at the bottom plays
   the merged animations against the packed image.
7. User clicks **Pack & Save** — save dialog for `<name>.png`; the sidecar is
   written as `<name>.atlas.json` next to it. Save is gated on zero unresolved
   conflicts.

## UI structure

- **Top:** Tab strip — `Sources` ↔ `Merged`.
- **Toolbar (shared):** `Add source…`, `Namespace all`, `Save…`, settings
  popover (max size, padding, power-of-two toggle). The Merged tab adds a
  status readout: e.g. `4096 → 2048 fit · 87% utilization`.
- **Sources tab:**
  - Main canvas: each source rendered as its own image with a `RectOverlay`.
    Conflicting rects get a red ring; selected conflict gets focus highlight.
    Each artboard has a header with editable alias text input, frame/anim
    counts, and a per-source action menu (Namespace this source, Remove from
    merge).
  - Right panel: two collapsible sections — **Frame conflicts** and
    **Animation conflicts**. Each conflict row shows `name`, source aliases
    involved, and an inline rename input. Conflicts resolve from the panel or
    by clicking the rect/animation chip on the artboard.
- **Merged tab:** packed atlas at top (image + `RectOverlay`),
  `AnimationDrawer` underneath, resolution status in the toolbar.

## Conflict resolution model

- Frames and animations are **independent namespaces** — a frame named `walk`
  and an animation named `walk` do not conflict.
- A name passes through unchanged if globally unique across all sources.
- On collision, the entry is flagged. Default suggested fix is
  `<source-alias>/<name>`. A toggle in settings switches this to
  `<name>_<n>` auto-suffix style (mirrors the existing
  `uniqueKey` behavior in `sidecar.ts`).
- "Namespace this source" applies the alias prefix in bulk to all of that
  source's frame *and* animation names. Per-source toggle, runs in O(n) and is
  reversible by clearing the alias prefix.
- Animation `frames[]` (playback sequence of frame-name strings) is rewritten
  automatically when referenced frame names are renamed. Never user-facing.
- **Save is gated** on zero unresolved conflicts. The Save button shows
  conflict count when blocked.

## Packing

- **Algorithm:** MaxRects with the best-short-side-fit heuristic, no rotation.
  Inputs are the unique frame rects from each source's `frames[name].frame`
  (in source-image pixels), drawn from the source PNG.
- **Knobs:**
  - Max output size: dropdown 1024 / 2048 / 4096 / 8192. Default 4096.
  - Padding: integer pixels between rects and around the outer border.
    Default 2.
  - Power-of-two output: boolean toggle. Default off.
- **Block alignment:** if power-of-two is off, final output W and H are
  rounded **up to the nearest multiple of 4** (the smallest BC/ETC2 block
  size). This guarantees the merged atlas can be transcoded to a compressed
  texture format later without resampling.
- **Failure mode:** if frames don't fit at the chosen max size, the Merged tab
  shows "Doesn't fit at 4096×4096 — try 8192 or reduce padding". The user can
  still edit conflicts, change knobs, etc. Save remains disabled until pack
  succeeds.

## Data flow / sidecar shape

### Source loading

- Each source = `{ sidecarUri, imageUri, alias, parsed }`.
- Image URI is resolved from the sidecar's `meta.image` (relative to sidecar
  dir), using the same logic the atlas tool's `provider.ts` already uses.
- Sidecars are read via `vscode.workspace.fs.readFile` on the host, parsed and
  schema-validated there, then sent to the webview as already-parsed
  `AtlasJson` objects. Source PNGs are loaded as `webview.asWebviewUri` URLs
  and decoded to `ImageBitmap` in the webview.

### Output writing

1. Webview runs the merge orchestrator with current state, gets packed rects
   + merged animations.
2. Webview composites source frames onto a 2D `OffscreenCanvas` at packed
   positions. Encodes to PNG via `canvas.convertToBlob({ type: 'image/png' })`,
   then `Blob.arrayBuffer()`.
3. Webview sends `{ pngBytes, sidecarJson, sourcesToDelete }` over the bridge.
4. Host shows `vscode.window.showSaveDialog` for the PNG path. Sidecar path is
   derived (`<base>.atlas.json`).
5. Host writes both via `vscode.workspace.fs.writeFile`. If
   `sourcesToDelete` is non-empty, the host calls
   `vscode.workspace.fs.delete(uri, { useTrash: true })` on each — `useTrash`
   so it's recoverable from the OS trash.

### Sidecar `meta.merge` field

```ts
meta.merge?: {
  version: '1'
  sources: Array<{
    uri: string        // workspace-relative when in workspace, else absolute
    alias: string      // alias used during merge (informational)
    frames: number     // count contributed
    animations: number // count contributed
  }>
}
```

The existing schema's `meta` is `additionalProperties: true`, so this lands
without schema edits. We may follow up with a typed branch in the schema for
lint/validation; not required for v1. This field is informational only — the
merge tool never reads from these paths after the fact, and stale entries
(deleted source files) don't break anything.

### Preserved per-frame and per-animation metadata

- Per-frame `pivot` (Vec2) survives merge. Each merged frame's `pivot` is the
  source frame's `pivot` (no transform needed since pivots are normalized
  0–1, and we don't rotate).
- Per-frame `trimmed` / `spriteSourceSize` / `sourceSize` pass through
  unchanged.
- Per-animation `fps`, `loop`, `pingPong`, `events` pass through unchanged.
- `events` keys (frame indices into the playback `frames` array) survive
  rename because the array order is unchanged — only the frame *names* the
  indices resolve to may have changed.

## Package layout

The most architecturally consequential piece. Two new locations:

### `tools/io/src/atlas/` *(new)*

Extracts the vscode-free pieces of the existing
`tools/vscode/extension/tools/atlas/sidecar.ts` into a portable module:

- `types.ts` — `AtlasJson`, `AnimationInput`, `RectInput`, `WireAnimation`,
  `AsepriteFrameTag` (moved from `sidecar.ts`).
- `build.ts` — `buildAtlasJson`, `atlasToRects`, `animationInputToWire`,
  `wireAnimationToInput`, `importAsepriteFrameTags`, `uniqueKey` (moved).
- `maxrects.ts` *(new)* — pure MaxRects-BSSF implementation, ~150 LoC. No
  external deps. Pure function: `pack(rects, opts) → PackResult | NoFit`.
- `merge.ts` *(new)* — pure merge orchestrator: takes
  `{ sidecar, alias, renames }[]`, applies renames, computes conflicts, calls
  `pack()`, returns `{ rects, animations, mergeMeta }`. Used by both the
  webview merge tool and any future CLI.
- `index.ts` — re-exports.

`tools/vscode/extension/tools/atlas/sidecar.ts` becomes a thin vscode wrapper
that re-exports from `@three-flatland/io/atlas` and adds
`writeAtlasSidecar` / `readAtlasSidecar` / `sidecarUriForImage` (the bits that
need `vscode`).

### `tools/vscode/extension/tools/merge/` *(new)*

Mirrors the atlas tool's structure:

- `register.ts` — command registration, multi-select handler
  (`(uri, uris) => …`), opens the webview panel.
- `host.ts` — `vscode.window.createWebviewPanel`, bridge handlers (`merge/load
  sources`, `merge/save`, `merge/delete-sources`).
- `validateMerge.ts` — runs the existing `assertValidAtlas` against the merged
  output before write.

### `tools/vscode/webview/merge/` *(new)*

- `App.tsx` — top-level layout, tabs, toolbar.
- `SourcesView.tsx` — artboard canvas (uses `Viewport`, `RectOverlay`).
- `MergedView.tsx` — packed preview + `AnimationDrawer`.
- `ConflictsPanel.tsx` — right panel.
- `mergeStore.ts` — zustand or local state holding sources, aliases, renames,
  knobs, derived merge result. Calls `merge()` from `@three-flatland/io/atlas`.
- `main.tsx` — webview entry.

### `tools/vscode/extension/index.ts`

Adds `registerMergeTool(context)` alongside `registerAtlasTool(context)`.

### `tools/vscode/package.json` contributes

New command `threeFlatland.merge.openMergeTool`, registered in
`menus.explorer/context` with `when` clause matching multi-selection of
`*.atlas.json` files.

## Reuse from `@three-flatland/preview`

- `Viewport`, `viewBoxFor`, `useViewport` — pan/zoom for the artboards canvas.
- `RectOverlay` — rect rendering on each artboard and on the merged preview.
- `AnimationDrawer`, `AnimationDrawerHeader`, `AnimationTimeline` — Merged
  tab's animation playback strip.
- `useAnimationPlayback`, `createAnimationStore`, `advancePlayhead` — playback
  for the merged animations.
- `dragKit` — *not* used in v1 (artboards are auto-laid out in a grid). Keep
  the door open for v2 manual repositioning.

## Error handling

- **Source has invalid sidecar JSON or fails schema validation:** show a
  modal listing offending files; user can drop them from the merge or cancel.
- **Source image file missing:** the source is loaded but the artboard shows a
  placeholder with the missing-file warning; rect data is still usable for
  conflict resolution but Save is blocked until the image resolves (because
  we can't composite without the bytes).
- **Doesn't-fit at chosen max size:** Merged tab status shows the message;
  Save disabled.
- **User attempts to save with conflicts unresolved:** Save button is
  disabled and tooltips the conflict count; the conflicts panel auto-expands.
- **Output PNG path collides with an existing file:** the save dialog
  surfaces the standard VSCode overwrite-confirm.
- **`useTrash: true` not supported on the platform:** falls back to
  `useTrash: false`; behaviorally identical.

## Testing

- **Pure modules** (`io/atlas/{merge,maxrects,build}.ts`): unit tests with
  Vitest. Use synthetic atlas JSON inputs; assert merged output shape,
  conflict detection, packing correctness on canned inputs (overlap-free,
  tight fit, no-fit cases), rounding to multiple of 4 and to power-of-two.
- **Animation rewrite under rename:** specifically test that renaming
  `idle_0` to `knight/idle_0` correctly rewrites every animation's
  `frames[]` and preserves `events` keys.
- **Schema round-trip:** generate a merged atlas, write it via the existing
  `writeAtlasSidecar`, read it back via `readAtlasSidecar`, assert deep
  equality of all rects, animations (incl. events), pivots, and the new
  `meta.merge` field.
- **Webview / host integration:** out of scope for unit tests — covered by
  manual smoke testing during dev.

## Open follow-ups (not blocking v1)

- Add a typed `meta.merge` branch to `atlas.schema.json` once the field
  shape stabilizes.
- Consider a project-file format (`*.atlasmerge.json`) once we know whether
  users want reproducible merges.
- CLI binary that wraps `merge()` from `@three-flatland/io/atlas`.
