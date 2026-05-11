---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

### Analytic GPU text rendering pipeline
- Initial `@three-flatland/slug` package: font parsing, text shaping, band-based GPU curve + band texture packing, analytic winding-number fill shader (`slugFragment`) for subpixel-accurate per-fragment coverage
- `SlugText` Three.js object with instanced rendering; `SlugFont` / `SlugFontLoader` for runtime and baked font data
- Dynamic instance-quad dilation for AA at any DPI

### Baked fonts + CLI (`slug-bake`)
- `slug-bake` CLI tool pre-bakes `.ttf` fonts to `.slug.{json,bin}` for zero-opentype-runtime cost
- `--output / -o` flag for custom output path bases
- `--stroke-widths / --stroke-join / --stroke-cap / --miter-limit` flags bake stroke pseudo-glyphs into the same texture pair; `SlugFont.getStrokeGlyph()` for runtime lookup

### Text measurement
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]`; dispatches to baked or runtime path

### Text decorations
- `StyleSpan` API with `underline` and `strike` fields; decoration metrics sourced from OpenType post + os2 tables and baked into `BakedJSON.metrics`
- `SlugGeometry.setGlyphs` accepts optional decorations array; rect sentinel renders in same draw call as glyphs

### Stroke / outline
- `SlugStrokeMaterial`: per-fragment distance-to-quadratic-Bezier stroke shader (TSL); axis-aligned quad expansion for correct exterior clipping; reduced Newton seed count for faster first-compile
- `SlugText.outline`: opt-in child InstancedMesh sharing the fill mesh's `instanceMatrix`; runtime-uniform `setOutlineWidth` / `setOutlineColor` (zero rebuild)
- `SlugText.setOpacity()` for fill / outline-only modes
- `SlugOutlineOptions` exported from package root
- Full quadratic-Bezier stroke offsetter pipeline: adaptive subdivision, per-segment Tiller-Hanson offset, join geometry (bevel / miter / round), cap geometry (flat / square / triangle / round), CCW+CW annular contour stitching
- `bakeStrokeForGlyph` helper bridges offsetter output to `SlugGlyphData`; `slug-bake` packs stroke sets into baked format via `BakedJSON.strokeSets`

### Font stacks + fallback
- `SlugFontStack(fonts)`: per-codepoint fallback chain; `resolveCodepoint` / `resolveText` / `wrapText` / `emitDecorations`
- `SlugFont.hasCharCode(c)` for cheap codepoint-coverage checks
- `SlugStackText extends Group`: one `InstancedMesh` per font in the stack; styles, outline, and `setOpacity` at parity with `SlugText`

### Performance
- Curve texture: `RGBA16F` (8 bytes/texel, down from 16); band texture: `RG32F` (8 bytes/texel)
- Band count 8 → 16: halves expected curves/band; `MAX_CURVES_PER_BAND` 64 → 40
- Shader skips post-rootCode work for ~30% of non-crossing curves

## Bug fixes
- Stroke quad exterior clipping: expansion now axis-aligned per quadrant instead of along unit normal (fixes squared-off outer ring)
- Shader compile lag on first outline-enable: reduced from 3 Newton seeds × 3 iterations to 1 seed + 2 endpoints, halving WGSL size
- `SlugText._setFont` defers `visible = true` until `_rebuild` has written glyph data, preventing WebGPU "binding size is zero" on R3F first-render pass
- `parseFont` emits advance-only glyph entries for space/tab/zero-width controls; runtime shapers pass `{ features: [] }` to prevent `liga`/`rlig` array-length drift at wrap points
- Kern extractor now filters to source IDs only, preventing crash when stroke glyph IDs fall outside opentype's known range
- `SlugStackText.dispose()` tears down outline meshes before disposing shared geometry, preventing GPU leaks on scene toggle

## Breaking changes

> `BAKED_VERSION` was bumped twice: 2 → 3 (texture format changes) and 3 → 4 (decoration metrics). Any previously baked `.slug.{json,bin}` files must be re-baked with the current `slug-bake` CLI. The `SlugFontLoader.BAKED_VERSION` / `clearCache` static members were removed.

---

`@three-flatland/slug` ships a full analytic WebGPU text-rendering pipeline: baked or runtime font loading, text measurement, word-wrap, underline/strike decorations, per-font-stack rendering with fallback chains, and a quadratic-Bezier stroke offsetter with bake-time stroke-set integration.

