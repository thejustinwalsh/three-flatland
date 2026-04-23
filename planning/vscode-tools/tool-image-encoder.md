# Tool: Image Encoder (A/B with per-loader GPU memory)

Squoosh-style A/B image encoder across PNG / WebP / AVIF / KTX2, with disk / decoded-RAM / GPU-memory readouts per candidate runtime loader (three default, `KTX2Loader`, spark.js). Pairs with the `spark.js` runtime transcoder, but is independent — any image can be encoded into any supported format regardless of which loader the user runs it through.

## spark.js (context, not a dependency for encoding)

`spark.js` (Ignacio Castano / ludicon): a runtime **transcoder** — not an encoder. Reads a standard image (URL / DOM Image / ImageBitmap / Canvas / GPUTexture; examples ship `.avif`) and emits a compressed `GPUTexture` (BC7 / ASTC / ETC2) in memory at load time. No disk output, no CLI, no encoder utility in the repo. `encodeTexture(source, options)` — the name is misleading; it "encodes" the runtime GPU texture, not a file.

- Repo: https://github.com/ludicon/spark.js
- Overview: https://www.ludicon.com/castano/blog/2025/09/three-js-spark-js/

**Implication for this tool**: we own all on-disk encoding. spark.js only enters as the *runtime path* we simulate for the GPU-memory column — optionally by actually calling `encodeTexture()` in the preview webview against our encoded candidate to read the real transcoded texture size.

## Goal

Right-click a PNG / WebP / AVIF / KTX2 → open a webview that encodes the image to any of the other formats and shows an A/B comparison across three memory axes:

| Axis | Shown as |
|---|---|
| **Disk** | encoded file size (bytes) |
| **Decoded RAM** | decoded-to-RGBA8 size (width × height × 4) |
| **GPU memory** | per runtime loader — see table |

## GPU memory estimation

| Runtime loader | Source format | GPU format (typical desktop) | GPU bytes |
|---|---|---|---|
| three.js default `TextureLoader` | PNG / WebP / AVIF | RGBA8 uncompressed | `w × h × 4` |
| three.js `KTX2Loader` | KTX2 / BasisU | BC7 desktop / ASTC 4×4 mobile | `w × h × 1` (BC7, 8 bpp) |
| **spark.js loader** | PNG / WebP / AVIF / Canvas → compressed `GPUTexture` | BC7 / ASTC 4×4 / ETC2 (chosen per device caps) | measured by spark: `(w * h * bytesPerBlock) / pixelsPerBlock` (BC7/ASTC 4×4 = 1 B/px; ETC2 RGB = 0.5 B/px; ETC2 RGBA = 1 B/px) |

Preferred strategy for the spark column: **run spark.js in the preview webview** against the candidate encoded source, read the resulting `GPUTexture.format` + dimensions, compute exact bytes. Fall back to the table if spark isn't available in that preview context.

Readout updates live as encoder params change. Green/red indicators highlight best-in-class per column. Mipmapped and non-mipmapped sizes both shown — spark mipmaps by default (~+33% GPU memory).

## User flow

1. Right-click `hero.png` → "Open in Image Encoder". (Or command palette: `Image Encoder: Open`.)
2. Webview opens with source on the left; encoded result on the right.
3. Top bar picks output format: PNG / WebP / AVIF / KTX2. Format-specific param panel below.
4. Second top bar picks runtime loader simulation: three default / `KTX2Loader` / spark.js. Updates the GPU memory readout.
5. Live preview: before/after canvas, zoom + pan synced, pixel peeker, delta overlay (per-pixel RGB distance) to catch quality regressions on lossy encodes.
6. Save: writes the encoded output next to the source (`hero.webp`, `hero.avif`, `hero.ktx2`). If a `hero.atlas.json` sibling exists, offer to update `meta.sources` (ajv-validated against the atlas schema in `packages/three-flatland/`).

## Encoder stack (confirmed — spark.js has no encoder)

All encoders are WASM so they work identically in the extension host (Node `worker_threads`) and in a future standalone web playground. Encoding stays in the host; the webview is view-only.

| Target | Encoder | Notes |
|---|---|---|
| PNG | `@jsquash/png` (WASM) — or `sharp` (native Node) | `@jsquash/png` is universal; swap to sharp if speed matters |
| WebP | `@jsquash/webp` (WASM — Squoosh's encoder) | Lossy + lossless; quality 0..100; alpha; full libwebp params |
| AVIF | `@jsquash/avif` (WASM — Squoosh's encoder) | Slow encodes; valuable (spark's own examples ship `.avif`) |
| KTX2 / BasisU | `basis_universal` WASM (Binomial) | ETC1S (small/lossy) + UASTC (larger/high quality); optional mipmap pyramid |

Decode paths (for opening inputs): `@jsquash/*` decode counterparts for PNG/WebP/AVIF; KTX2 input decoded via `KTX2Loader`'s transcoder in a worker for display, or `basis_universal` reverse in the host.

Encoder workers stream progress events through the bridge → webview progress bar.

## Architecture

```
Extension host (ESM)                    Webview (React + StyleX)
  ImageEncoderCommand                     React app
    → spawns webview                        - tools-design-system
  EncoderService                            - before/after canvas, pixel peeker,
    - WASM encoders in worker_threads         delta overlay
    - encode({ input, target, params })     - format picker + param panel
    - decode({ bytes, format })             - loader picker + memory readout
  GpuMemoryEstimator                        - Save button → postMessage
    - disk: trivial
    - RAM: w × h × 4
    - GPU per loader:
        * three-default: analytic
        * three-ktx: analytic (BC7/ASTC)
        * spark: actual run via spark.js in
          a hidden preview WebGPU context
  SidecarPatcher
    - on save, if meta.sources exists in
      matching .atlas.json, splice + validate
      against validateAtlas (from packages/
      three-flatland/sprites)
```

## Contribution

```json
"contributes": {
  "commands": [
    { "command": "threeFlatland.imageEncoder.open", "title": "Open in Image Encoder" }
  ],
  "menus": {
    "explorer/context": [
      {
        "command": "threeFlatland.imageEncoder.open",
        "when": "resourceExtname in threeFlatland.imageExts",
        "group": "navigation@30"
      }
    ]
  }
}
```

`threeFlatland.imageExts` is a context key we set at activation from the package configuration; value includes `.png`, `.webp`, `.avif`, `.ktx2`.

Tool directory: `tools/ext/src/tools/imageEncoder/`.

## Runtime loader work (sister task, not this tool)

Out of scope here but tracked as a follow-up against `packages/three-flatland/`. The `TextureLoader` / `SpriteSheetLoader` should accept:

```ts
loadSpriteSheet('hero', {
  formats: ['webp', 'ktx2', 'png'],   // source format preference, first supported wins
  loader:  'auto'                     // 'spark' | 'three-ktx' | 'three-default' | 'auto'
})
```

- `auto`: spark when a WebP/AVIF source exists and spark is available at runtime; else `three-ktx` when KTX2 exists; else `three-default`.
- Loaders dynamically imported so three's KTX2Loader + BasisU transcoder aren't paid for on the spark path.
- Dev-time warn if a requested format is missing; degrade to next in `formats` array.

The Image Encoder tool produces the alternate source files; the loader picks which to use.

## Sidecar patch (atlas)

When a matching `*.atlas.json` is found:

```diff
 "meta": {
   "image": "hero.png",
   "sources": [
     { "format": "png",  "uri": "hero.png" },
+    { "format": "webp", "uri": "hero.webp" },
+    { "format": "avif", "uri": "hero.avif" },
+    { "format": "ktx2", "uri": "hero.ktx2" }
   ]
 }
```

User confirms via modal before write. ajv-validated against `validateAtlas` (exported from `packages/three-flatland/src/sprites/atlas.schema.ts`) before saving.

## Risks

1. **Encoder performance** — WASM on `worker_thread` can still block large images for seconds. Progress bar + debounce param changes.
2. **KTX2 transcoder + CSP** — if we preview KTX2 output in the webview, CSP needs `wasm-unsafe-eval` for the BasisU transcoder.
3. **Lossy color shifts** — A/B delta overlay is mandatory so users don't ship quality regressions unknowingly.
4. **AVIF encode time** — `@jsquash/avif` is slow at high quality; cap default quality at 50-60 and show encode time in the UI.
5. **spark.js GPU stat reliability** — spark's device-capability detection may pick different target formats in preview (dev machine) vs deploy (user devices). Show the chosen format next to the byte count and note the assumption.

## References

- [spark.js repo](https://github.com/ludicon/spark.js)
- [three.js + spark.js overview](https://www.ludicon.com/castano/blog/2025/09/three-js-spark-js/)
- [Squoosh (reference A/B UX)](https://squoosh.app/)
- [jSquash (WASM encoders: WebP, AVIF, PNG, etc.)](https://github.com/jamsinclair/jSquash)
- [basis_universal](https://github.com/BinomialLLC/basis_universal)
- [KTX 2.0 spec](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html)
- [three.js KTX2Loader](https://threejs.org/docs/#examples/en/loaders/KTX2Loader)
