# Encode tool — info panel + cleanup pass

**Status:** draft
**Date:** 2026-05-04
**Scope:** `tools/vscode/webview/encode/`, `tools/design-system/src/primitives/NumberField.tsx`

## Goals

1. Surface live compression stats next to the compare panel so the user can see, per encode change, what they gain across **wire size**, **CPU memory**, and **GPU memory**.
2. Close the encoder-options gap in `Knobs.tsx` — every knob the encoder accepts must be reachable from the UI.
3. Fix three bugs in `NumberField` (visualizer scale, lost pointer capture, oversized field) and tighten Knobs spacing.

The whole change ships together — they're the same UX surface.

## Non-goals

- No static market-share / ecosystem-support stats. Settled science (WebP, AVIF, Basis/KTX2 are all >95% supported) carries no signal; tracking it is overhead. Everything in the panel is sourced live from the running encode or probed once from the host machine.
- No fetch-from-docs-site infrastructure. Dropped because there are no static stats worth fetching.
- No per-section collapsible disclosure. The sidebar itself is the disclosure surface; collapse it via the splitter or hide it via the menu.
- No CI / cron jobs.

## Layout

```
┌─ Toolbar ────────────────────────────────────────────────┐
├─ Compare panel ──────────────────┬─ Info panel ──────────┤
│                                  │ Source                │
│   <CanvasStage + slider>         │ Wire                  │
│                                  │ CPU memory            │
│                                  │ GPU representation    │
│                                  │ Host GPU support      │
└──────────────────────────────────┴───────────────────────┘
                                   ↑ Splitter (vertical)
                                     persisted in localStorage
                                     min 240, max 480, default 320
```

- New `splits.infoPanelWidth` field added to the prefs slice (`localStorageStorage`) so the width survives panel close + VSCode restart, matching the established splitter pattern.
- `<Splitter axis="vertical" onDrag={...}>` between Compare and Info; parent owns the width state and clamps min/max.
- `Info` is a `<Panel title="Info">` with `bodyPadding="normal"`. Body content is a vertical scroll container (`<Scrollable>`) so dense stats don't push the panel taller than the parent.
- The Info panel is hidden in `mode === 'inspect'`. Inspect mode shows an already-encoded artifact with no original to compare against; most rows would be N/A or duplicate. Future work could surface a slimmer inspect-mode info panel, but it is out of scope here.

## Sections

### 1. Source

Always shown. No bar.

```
File          checker.png
Dimensions    2048 × 2048
Original      2.3 MB · PNG
```

Sourced from `fileName`, `sourceImage.width/height`, `sourceBytes.length`. Format detected from `fileName` extension (same `detectFormat` used in `App.tsx`).

### 2. Wire

Bar treatment. Highlights the wire-transfer win.

```
Encoded       412 KB · WebP q=80
              ▓▓▓░░░░░░░░░░░░░░  17% of original
Saved         1.9 MB
```

- Bar baseline = `sourceBytes.length`.
- Bar fill = `min(1, encodedBytes.length / sourceBytes.length)`. Width clamped to 100% — encoded artifacts that grow past the source are unusual but possible.
- Right-side label = `${(encoded/source*100).toFixed(0)}% of original`. Shown in `vscode.errorFg` if encoded > source (visual cue that this knob choice is regressive).

### 3. CPU memory after decode

Plain rows. The win is in what's *not* allocated.

```
Original RGBA       16.0 MB  (kept for compare)
Encoded artifact:
  Compressed bytes  412 KB
  Decoded RGBA      16.0 MB    ← WebP / AVIF
  — or —
  Decoded RGBA      not allocated  ← KTX2

KTX2 transcoder writes GPU-native blocks directly. No RGBA round-trip.
```

- "Original RGBA" = `sourceImage.width * sourceImage.height * 4` (always present in encode mode).
- "Compressed bytes" = `encodedBytes.length`.
- "Decoded RGBA" branch is conditional on `encodedFormat`:
  - WebP / AVIF → show the size, computed from `encodedImage.width * encodedImage.height * 4`.
  - KTX2 → show "not allocated" + the trailing one-line note explaining why. Keep the note within the section so the absence of an allocation is *the point*, not a confusing blank.

### 4. GPU representation (format + memory merged)

Bar treatment. Format heading + per-mip table + total.

```
Format        BC7 (4 bpp · sRGB)
Mip 0         2048 × 2048    4.0 MB
Mip 1         1024 × 1024    1.0 MB
Mip 2         512 × 512      256 KB
…
Total         8 levels       5.3 MB
              ▓▓░░░░░░░░░░░░░░░  33% of RGBA8 baseline
```

- Format string mapped from `THREE.CompressedTexture.format` numeric constant via a `FORMAT_LABELS` table (extensible). Includes `BC7`, `ASTC 4×4`, `ETC2 RGB/RGBA`, `BC3 (DXT5)`, `BC1 (DXT1)`, `RGBA8`, `RGB8` for the formats `Ktx2Loader` actually emits.
- Per-mip rows from `CompressedTexture.mipmaps[].data.byteLength`. For non-compressed (`RGBA8`) textures we fall back to `width*height*4` — three's `CanvasTexture` doesn't carry pre-uploaded mip blobs.
- Bar baseline = `w*h*4` (RGBA8 single mip — the implicit baseline GPUs would otherwise allocate).
- Bar fill = `min(1, totalGpuBytes / baseline)`.
- For non-mipmapped WebP/AVIF the section collapses to one row (Format = `RGBA8`, single Mip 0 row) + total. The bar still draws — for these formats it's at exactly 100% (no win), which is the truthful signal.

### 5. Host GPU support

Live probe. Plain rows.

```
BPTC (BC7)     ✓
ASTC           ✗
ETC2           ✗
S3TC (DXT)     ✓
PVRTC          ✗
```

- Sourced from `probeKtx2Caps()` (already implemented in `ComparePreview.tsx` — extracted to a shared module).
- Probed once per session; result memoized at module load. Pure function, idempotent.
- `✓` in `vscode.fg`, `✗` in `vscode.descriptionFg`. No bar.

## Data flow

Approach: stats live where the data already does. No central stats slice; presentational component reads from existing store fields + one new runtime slot.

| Stat | Source |
|---|---|
| File name, dims, original bytes | `useEncodeStore` — existing `fileName`, `sourceImage`, `sourceBytes` |
| Encoded bytes, format, q-level | `useEncodeStore` — existing `encodedBytes`, `encodedFormat`, `webp.quality` / `avif.quality` / `ktx2.{mode,quality,uastcLevel}` |
| GPU format + per-mip dims/bytes | New `gpuStats` runtime field, populated by `useEncodedTexture` once the texture resolves |
| Host caps | Module-level memoized `probeKtx2Caps()` result |

### New store fields

Inside `RuntimeSlice`:

```ts
gpuStats: {
  format: number | null     // THREE format constant or null for RGBA8 fallback
  formatLabel: string       // human label
  bytesPerBlock: number     // for sanity / future use
  mips: { width: number; height: number; bytes: number }[]
} | null
```

Inside `PrefsSlice`:

```ts
splits: { infoPanelWidth: number }   // default 320
```

The existing `setEncodedMipCount` action is renamed `setGpuStats(stats)` and now sets the full struct. `mipLevel` clamping behavior stays the same (clamp to `mips.length - 1`).

## Cleanup pass

### A. ETC1S quality knob (encoder gap fix)

Add to `Knobs.tsx`:

```tsx
{format === 'ktx2' && ktx2.mode === 'etc1s' && (
  <NumberField
    value={ktx2.quality}
    min={1}
    max={255}
    step={1}
    width={64}
    onChange={setKtx2Quality}
    aria-label="ETC1S quality"
  />
)}
```

Default stays at 128. Wired to existing `setKtx2Quality` (already present in store, just unexposed).

### B. NumberField — `width` prop

Add an optional `width?: number` prop to `NumberField`. When set, applies as inline width (px) overriding the default `100%`. Consumer-controlled because the right size depends on the expected character count.

In `Knobs.tsx`:
- WebP / AVIF / ETC1S quality: `width={64}`  (1–3 chars)
- UASTC level: `width={56}`  (1 char)

### C. NumberField — visualizer scale fix

Current bug: drag overlay grows linearly with pixel distance, ignoring value bounds. With `min=0, max=4, step=1`, the value caps after 16 px of drag but the bar grows to 200 px.

Fix: derive overlay fill from *value progress toward the bound*, not raw pixel distance.

```ts
const dir = Math.sign(rawDelta) || 1
const bound = dir > 0 ? max : min
const finite = Number.isFinite(bound)
let normalized: number
if (finite) {
  // 0 at drag start, 1 at bound. Clamp so over-drag past bound stays at 1.
  const span = bound - dragStartValue.current
  normalized = span === 0 ? 0 : (next - dragStartValue.current) / span
  normalized = Math.min(1, Math.max(0, normalized))
} else {
  // Unbounded: fall back to pixel-ratio behavior.
  normalized = Math.abs(cappedDelta) / MAX_DRAG_PX
}
setDragDelta(dir * normalized)
setAtCap(finite && Math.abs(next - bound) < 1e-9)
```

`atCap` already drives the error-color overlay state; this fix makes "at cap" correlate with the actual value boundary.

### D. NumberField — lost pointer capture fix

Current bug: in VSCode webview iframes, releasing the pointer outside the iframe boundary can drop the `pointerup` event, leaving the field in a stuck `dragging` state.

Fix:
1. Add `onLostPointerCapture={endDrag}` to the decorator div. Fires when capture is broken for any reason (focus change, OS preemption, iframe boundary).
2. Add a window-level `pointerup` + `pointercancel` listener while `dragging === true`:

```ts
useEffect(() => {
  if (!dragging) return
  const onUp = (e: PointerEvent) => {
    setDragging(false); setDragDelta(0); setAtCap(false)
    if (decoratorRef.current?.hasPointerCapture(e.pointerId)) {
      decoratorRef.current.releasePointerCapture(e.pointerId)
    }
  }
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  return () => {
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}, [dragging])
```

Belt-and-suspenders: the React handler still fires for in-bounds releases (faster), the window listener catches the iframe-boundary edge case.

### E. Knobs — inter-field padding

Current: groups rely on the parent Toolbar's gap, which feels tight.

Fix: add `paddingInline: space.xs` (2 px each side = +4 px between adjacent fields) to the `group` / `groupDisabled` styles in `Knobs.tsx`. Cheap, no Toolbar API change.

## File / module layout

New:
- `tools/vscode/webview/encode/InfoPanel.tsx` — presentational; reads store + caps.
- `tools/vscode/webview/encode/gpuCaps.ts` — extracts `probeKtx2Caps()` from `ComparePreview.tsx`, adds module-level memoization. `ComparePreview.tsx` imports it.
- `tools/vscode/webview/encode/gpuStats.ts` — `extractGpuStats(texture: THREE.Texture, w: number, h: number): GpuStats` helper. Reads `mipmaps[].data.byteLength` for compressed textures, falls back to `w*h*4` for `CanvasTexture`.

Modified:
- `tools/vscode/webview/encode/encodeStore.ts` — add `gpuStats` (RuntimeSlice), add `splits.infoPanelWidth` (PrefsSlice), rename `setEncodedMipCount` → `setGpuStats` (with the same mipLevel clamp).
- `tools/vscode/webview/encode/ComparePreview.tsx` — call `extractGpuStats` after texture resolves; pipe to `setGpuStats`. Remove now-inlined `probeKtx2Caps` (re-export via `gpuCaps.ts`).
- `tools/vscode/webview/encode/App.tsx` — split layout: `<Splitter>` between Compare and Info; persist width.
- `tools/vscode/webview/encode/Knobs.tsx` — add ETC1S quality field; add inter-field padding; add `width` per field.
- `tools/design-system/src/primitives/NumberField.tsx` — `width` prop; visualizer scale fix; lost-capture fix.

## Testing

- `Knobs.tsx` — manual smoke: switch format to KTX2 + ETC1S, see quality field appear with default 128, drag/type to verify bound clamping at [1, 255].
- `NumberField` visualizer — manual: set `min=0, max=4`; drag down past min, confirm bar pins at 100% on the left side and never overflows past min.
- `NumberField` lost capture — manual: drag a field, sweep mouse out of the VSCode webview to the host chrome, release; field should not stay stuck in drag state.
- InfoPanel — manual: encode WebP / AVIF / KTX2 ETC1S / KTX2 UASTC; verify all five sections render with non-zero values; verify CPU section toggles between "Decoded RGBA: 16 MB" and "not allocated"; verify GPU section shows mip table for KTX2 with mipmaps and a single row otherwise.
- Splitter persistence — manual: drag the splitter, close the panel, reopen; width is preserved.

No new automated tests. The code surface is presentational + bug fixes; existing zundo undo/redo coverage in the encode tool stays intact (no new fields are added to `partialize`).

## Risks / open questions

- **`extractGpuStats` for unsupported KTX2 fallback.** When `probeKtx2Caps()` returns no compressed format support, the transcoder emits RGBA32 inside a `CompressedTexture`. The `mipmaps` array is still populated; per-mip `data.byteLength` is the right number; `format` will be `THREE.RGBAFormat` (a numeric constant in the `FORMAT_LABELS` map, label `RGBA8`). Verified via reading the loader's transcode path. No special case needed.
- **`THREE.CanvasTexture` lacks `mipmaps`.** `CanvasTexture` (used for WebP/AVIF) has `mipmaps = []` until the renderer auto-generates them on upload. We can't read post-upload mip bytes from the React tree (they live on the GL/GPU side). Mitigation: for non-compressed textures, the mip table renders only "Mip 0 — w×h×4" plus the total; auto-generated mips are not shown. The bar still uses `w*h*4` baseline so the non-win is honest.
- **Inspect-mode info panel.** Out of scope. The Info panel is hidden in `mode === 'inspect'`. A future spec can fold an inspect-only variant in (just GPU representation + Host GPU support).
