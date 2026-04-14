---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New package: `@three-flatland/slug`

GPU-accelerated analytic text rendering for Three.js and R3F using WebGPU + TSL shaders. Renders crisp vector text at any size via a signed-distance field approximation evaluated entirely on the GPU — no canvas fallback, no SDF pre-bake per size.

### Core rendering

- `SlugFont` — loads a TTF (opentype.js runtime path) or pre-baked `.slug.bin`/`.slug.json`; exposes `shapeText`, `wrapText`, `measureText`, `measureParagraph`, `emitDecorations`, and cmap coverage queries
- `SlugGeometry` — `InstancedBufferGeometry` with per-glyph Jacobian data; accepts optional decoration rects rendered in the same draw call
- `SlugMaterial` — `MeshBasicNodeMaterial` using TSL; options: `color`, `evenOdd`, `weightBoost`, `stemDarken`, `thicken`, `supersample`, `pixelSnap`, `transparent`
- `SlugText` — high-level `Mesh` subclass; set `text`, `fontSize`, `align`, `maxWidth`, `lineHeight`, `styles` and it re-shapes automatically

### Baked font pipeline

- `slug-bake` CLI tool — converts a TTF to `.slug.bin` + `.slug.json` for zero-runtime opentype.js cost; assets are lazy-loaded via `SlugFontLoader`
- BAKED_VERSION 4 (includes decoration metrics from OpenType `post`/`os2` tables)
- bake-time warning when any band exceeds `MAX_CURVES_PER_BAND`; `analyze-bands` script for corpus tuning

### Measurement API

- `font.measureText(text, fontSize)` → `TextMetrics` — single-line, aligned with `CanvasRenderingContext2D.measureText` field names; O(1) per glyph via pre-computed bounds
- `font.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions that match `SlugText` render output
- `font.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output identical to shaped output, works on both baked and runtime paths

### Decorations

- `StyleSpan { start, end, underline?, strike? }` — character-range styling
- `SlugText` accepts `styles?: StyleSpan[]`; decorations rendered as rect-sentinel instances in the same draw call with no extra GPU pass

### Multi-font fallback

- `SlugFontStack` — ordered font list; `resolveCodepoint(c)` walks the chain and returns the first covering font; `resolveText(text)` yields per-character assignments
- `SlugFont.hasCharCode(c)` — O(1) cmap coverage check (baked: lookup table; runtime: opentype charToGlyph)
- `SlugStackText` — `Group` subclass with one `InstancedMesh` per font; one draw call per font contributing glyphs

### Performance

- `bandCount` 8 → 16: halves expected curves/band (~6.3 → ~3.2 mean), proportional fragment ALU reduction
- Shader skips `sqrt` + coverage solve for ~30% of curves per band that don't cross the ray (`If(rootCode > 0)` guard)
- `curveTexture` → RGBA16F: 8 bytes/texel (was 16); em-space coords fit in half-float mantissa at all realistic sizes
- `bandTexture` → RG32F: 8 bytes/texel (was 16; prior packing left 2 channels unused)
- `MAX_CURVES_PER_BAND` 64 → 40: corpus analysis of 2849-glyph Inter shows p999 = 25, max = 38; reduces shader register pressure
- Baked asset size ~45% smaller on disk (13 MB → 7.1 MB for Inter)
- Dynamic quad dilation for subpixel-accurate glyph extents without over-drawing
- Pixel-grid snapping and optional 2×2 supersampling for small-text quality

### BREAKING CHANGES

**Re-run `slug-bake` on all `.slug.bin`/`.slug.json` assets** — this release incorporates two baked format bumps:
- BAKED_VERSION 2 → 3: `curveTexture` switched to RGBA16F, `bandTexture` to RG32F, `MAX_CURVES_PER_BAND` reduced to 40
- BAKED_VERSION 3 → 4: decoration metrics (`underlinePosition/Thickness`, `strikethroughPosition/Thickness`) added to `BakedJSON.metrics`

Old baked assets will fail to load with the new `SlugFontLoader`.

---

This release introduces the complete `@three-flatland/slug` package — a WebGPU-native analytic text renderer with a full pipeline from TTF parsing to GPU texture packing, plus measurement, decoration, and multi-font fallback APIs. All rendering is done via TSL node materials with no GLSL or SDF pre-generation per font size.
