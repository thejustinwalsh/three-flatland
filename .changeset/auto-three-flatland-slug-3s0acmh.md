---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New package: `@three-flatland/slug`

GPU-accelerated, resolution-independent text rendering for Three.js and React Three Fiber via the Slug algorithm (WebGPU + TSL only).

### Core classes

- `SlugFont` — loads and owns font data; exposes `shapeText`, `wrapText`, `measureText`, `measureParagraph`, and `emitDecorations`
- `SlugText` — high-level Three.js `Object3D` with text, fontSize, color, align, lineHeight, maxWidth, styles, and render quality options
- `SlugMaterial` — TSL node material; drives glyph + decoration rendering in a single draw call
- `SlugGeometry` — instanced geometry; accepts shaped glyphs and decoration rects
- `SlugFontLoader` — Three.js `Loader` subclass; tries pre-baked data first, falls back to runtime opentype.js parsing

### Font loading and baking

- `SlugFontLoader.load(url)` static method for vanilla usage; `useLoader(SlugFontLoader, url)` for R3F; results cached by URL
- `slug-bake` CLI tool pre-processes `.ttf`/`.otf` → `.slug.json` + `.slug.bin`; baked path never loads opentype.js at runtime
- `forceRuntime` option to skip baked data

### Text measurement

- `font.measureText(text, fontSize)` → `TextMetrics` — single-line ink + font-envelope bounds, matching `CanvasRenderingContext2D.measureText` field names
- `font.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions using the same wrap and line-height defaults as `SlugText`

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` — half-open character range with per-span decoration flags
- `font.emitDecorations(text, positioned, styles, fontSize)` → `DecorationRect[]` — pure post-pass; one rect per contiguous styled run per line
- `SlugText` accepts `styles?: StyleSpan[]` at construction and as a runtime setter; decorations render in the same draw call as glyphs

### Render quality options (`SlugMaterialOptions` / `SlugTextOptions`)

- `stemDarken` — stem darkening strength (0 = off, ~0.4 subtle, ~1.0 strong)
- `thicken` — coverage widening at small sizes
- `supersample` — optional 2×2 supersampling (quarter-pixel jitter, 4 taps)
- `pixelSnap` — snap glyph centers to pixel grid for crisp small text (default `true`)
- `evenOdd`, `weightBoost` — winding and weight options carried from initial release

### Performance

- Curve texture changed from RGBA32F to RGBA16F (−50% bandwidth); band texture from RGBA32F to RG32F (−50%)
- `MAX_CURVES_PER_BAND` reduced 64 → 40; `bandCount` doubled 8 → 16 (halves expected curves/band, reducing per-fragment ALU)
- Fragment shader skips the quadratic solve for curves whose root code is 0 (~30% of curves per band)
- Baked fixture size reduced ~45% (13 MB → 7.1 MB for Inter Regular)

### BREAKING CHANGES

- `BAKED_VERSION` has been bumped across multiple iterations (final: 4). Any `.slug.bin` / `.slug.json` files baked with earlier versions must be re-generated with `slug-bake`.

Initial release of `@three-flatland/slug`: a WebGPU-native, resolution-independent text renderer built on the Slug algorithm, with baked font support, text measurement, underline/strikethrough decorations, and multiple render-quality controls — all in a single instanced draw call.
