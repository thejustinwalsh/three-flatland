---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

### Text rendering pipeline
- Initial `@three-flatland/slug` package: analytic GPU text rendering via font parsing, text shaping, and GPU texture packing
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — core public API
- Baked font support with `slug-bake` CLI and `SlugFontLoader`
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`

### Measurement APIs
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned single-line metrics (width, actualBoundingBox, fontBoundingBox)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output matching the Slug shaper

### Text decorations (StyleSpan API)
- `StyleSpan { start, end, underline?, strike? }` — underline and strikethrough spans applied in a single draw call
- `SlugText` accepts `styles?: StyleSpan[]` at construction and as a runtime setter
- Decoration metrics (underlinePosition, underlineThickness, strikethroughPosition/Thickness) sourced from OpenType post + os2 tables and baked into `BakedJSON.metrics`

### Font stack / fallback
- `SlugFontStack(fonts)` — per-codepoint fallback chain; first font covering a codepoint wins
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check
- `SlugStackText` — multi-font `Group` with one `InstancedMesh` per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint line wrapping for Canvas2D parity
- `SlugFontStack.emitDecorations()` — decoration rendering across mixed-font runs

### Outline / stroke rendering (Phase 4)
- `SlugStrokeMaterial` — TSL NodeMaterial using analytic `distanceToQuadBezier` for GPU stroke rendering
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; runtime-uniform `width` and `color` (zero rebuild)
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` / `setOpacity(v)` — live uniform setters; opacity enables outline-only mode
- `SlugOutlineOptions` exported from package root
- `SlugStackText` gains `styles`, `outline`, and `setOpacity` parity with `SlugText`

### Stroke offsetter (Phase 5 prep)
- `strokeOffsetter(curves, closed, options)` — quadratic Bézier stroke offsetter: adaptive subdivision, per-segment Tiller-Hanson offset, join geometry (bevel/miter/round), cap styles (flat/square/triangle/round), full annular stitching
- `bakeStrokeForGlyph(source, options)` — converts source glyph contours to a stroke pseudo-glyph for GPU packing
- `slug-bake` CLI: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` bake flags
- `BakedJSON.strokeSets` optional field; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` runtime lookup
- `slug-bake` CLI: `--output` / `-o` flag for custom output base paths

## Performance

- Curve texture `RGBA32F` → `RGBA16F`: ~50% texture bandwidth reduction; re-baked `.slug.bin` fixtures ~45% smaller on disk
- Band texture → `RG32F`: removes wasted channels
- `MAX_CURVES_PER_BAND` 64 → 40 (covers Inter full corpus at p100); reduces shader register pressure
- `bandCount` 8 → 16: halves expected curves/band, reducing per-fragment ALU work
- Shader: non-crossing curves skip sqrt/divisions/saturates
- `distanceToQuadBezier` TSL: single Newton seed + endpoints cuts WGSL size ~50%, halves pipeline compile time, reduces per-fragment cost ~⅔

## Bug Fixes

- Stroke quad expansion corrected to axis-aligned; diagonal unit-normal expansion was clipping stroke outer ring at glyph extents
- `SlugText._setFont` defers `visible=true` until first `_rebuild`; prevents blank canvas on R3F's first render pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; default `liga`/`rlig` features were collapsing whitespace at wrap points
- Kerning extraction filters to source glyph IDs only; stroke glyph ID ranges caused `_push is not a function` errors
- `SlugStackText.dispose()` tears down outline meshes before fill geometries; previously leaked GPU resources on scene toggle
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab), matching baked path behavior
- Baked measure uses bounds-area gate instead of `curves.length > 0`; old heuristic returned zero ink bounds for every baked glyph

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: curve texture is now RGBA16F, band texture is RG32F — existing `.slug.bin`/`.slug.json` must be re-baked with `slug-bake`
- **BAKED_VERSION 3 → 4**: decoration metrics added to `BakedJSON.metrics` — re-bake required to use underline/strikethrough
- **`SlugFontLoader.clearCache` removed** — static cache is keyed on URL; remove all call sites

Adds analytic GPU text rendering with baked font support, font stacking with per-codepoint fallback, text measurement, StyleSpan decorations, runtime-uniform outline/stroke, and the stroke offsetter pipeline for Phase 5 baked stroke geometry.
