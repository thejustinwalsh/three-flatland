---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## BREAKING CHANGES

- `BAKED_VERSION` bumped 2 → 3: `curveTexture` format changed to `RGBA16F` (half-float), `bandTexture` to `RG32F`, `MAX_CURVES_PER_BAND` reduced to 40. Existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`.
- `BAKED_VERSION` bumped 3 → 4: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) added to `BakedJSON.metrics`. Existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`.
- `SlugFontLoader.clearCache` removed — the static cache is already keyed on `url:runtime?` so explicit invalidation was redundant.

## New APIs

**Measurement**
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`; dispatches on baked vs runtime path; constant per-call cost via pre-computed bounds
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText` + per-line `measureText`; respects the same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches on baked vs runtime path; both examples use this for Canvas2D comparison so line breaks match Slug shaped output exactly

**Text decorations**
- `StyleSpan { start, end, underline?, strike? }` — underline and strikethrough spans over shaped character ranges
- `SlugText.styles: StyleSpan[]` — constructor option and runtime setter threading through shaper + decoration emission
- `SlugFont.emitDecorations(text, positioned, styles, fontSize)` — thin wrapper using font's own metrics and advance map
- Font-declared decoration metrics sourced from OpenType `post` + `os2` tables and baked into `BakedJSON.metrics`

**Outlines**
- `SlugStrokeMaterial` — stroke `NodeMaterial` using analytic `distanceToQuadBezier` fragment shader; exported from package root alongside `SlugOutlineOptions`
- `SlugText.outline: SlugOutlineOptions | null` — opt-in outline via child `InstancedMesh` sharing fill geometry; `renderOrder = -1` so stroke draws behind fill
- `SlugText.setOutlineWidth(w)`, `SlugText.setOutlineColor(c)` — runtime-uniform setters, zero rebuild
- `SlugText.setOpacity(value)` — forwards to fill material opacity uniform; enables outline-only mode (fill alpha 0)

**Multi-font stack**
- `SlugFont.hasCharCode(codepoint)` — cheap codepoint coverage check via cmap
- `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint(c)`, `resolveText(text)`, `wrapText(text, fontSize, maxWidth?)`, `emitDecorations()`
- `SlugStackText extends Group` — multi-font renderable with one `InstancedMesh` per font; one draw call per contributing font
- `SlugStackText.styles`, `.outline`, `.setOpacity()`, `.dispose()` — full parity with `SlugText`

**Baked stroke**
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — pre-baked stroke glyph lookup by matching stroke set
- `bakeStrokeForGlyph(source, options)` — stroke pseudo-glyph builder; used by CLI bake pass and future runtime fallback
- `BakedJSON.strokeSets?: Array<{ width, joinStyle, capStyle, miterLimit, glyphIdOffset }>` — optional baked format field; absent for non-stroke bakes so old fixtures load unchanged

## CLI (`slug-bake`)

- `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` — bake stroke variants alongside fill glyphs into the same curve+band textures
- `--output` / `-o` — custom output base path

## Performance

- `curveTexture` → `RGBA16F` (half-float): 8 bytes/texel vs 16; resulting `.slug.bin` files ~45% smaller on disk
- `bandTexture` → `RG32F`: 8 bytes/texel vs 16; eliminates wasted channel bandwidth
- `MAX_CURVES_PER_BAND` 64 → 40: covers 100% of Inter's 2849-glyph corpus with a safety margin; reduces shader register pressure
- `bandCount` 8 → 16: ~50% fewer expected curves per band, halving fragment ALU cost in the hot loop
- Non-crossing curves skip Newton solve and coverage math in the fragment shader (~30% of curves per band branch-coherently skipped)
- Stroke fragment shader uses single Newton seed (halves WGSL compile time and ~⅔ per-fragment GPU cost for outlines)
- `SlugText._setFont` deferred outline rebuild — no GPU resource cost for users who never enable outlines

## Stroke rendering pipeline

- Analytic `distanceToQuadBezier` primitive (TSL + CPU reference) — cubic critical-point solve with Newton refinement; bevel-via-min joins at zero extra geometry
- Full quadratic-Bézier stroke offsetter: adaptive subdivision (Tiller-Hanson construction), per-segment offset, bevel/miter/round joins with `miterLimit` fallback (matching SVG stroke-miterlimit), flat/square/round/triangle cap styles, outer+inner contour stitching into annular ring for closed sources
- `buildGpuGlyph.ts` — shared contour-to-GPU pipeline module ensuring consistent `SlugGlyphData` shape across font parser, stroke offsetter, and future SVG path support

## Fixes

- `parseFont` emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for cmap'd glyphs with no outline (space, tab, zero-width controls) — fixes incorrect advances on both runtime and baked paths
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` OpenType ligature features shortening the glyph array
- `SlugText._setFont` defers `visible = true` until first `_rebuild` — fixes WebGPU "Binding size is zero" error in R3F when a render occurs before the instance buffer is initialized
- `slugDilate` axis-aligned stroke expansion — fixes stroke corners clipped/squared-off at glyph extents (diagonal unit-normal expansion only covered ~70% of `halfWidth` per axis)
- Kerning extraction filters to source IDs only — fixes `this.font._push is not a function` crash when stroke glyph IDs (outside opentype.js's range) were passed to the kern extractor
- `SlugStackText.dispose()` tears down outline meshes and `SlugStrokeMaterials` before shared geometry — fixes GPU leaks on repeated scene toggles
- Compare mode `Off` option added — hides compare overlay entirely for standalone Slug rendering and clean screenshots

## Initial release

- Core rendering pipeline: font parsing (OpenType via opentype.js), text shaping, band-accelerated GPU texture packing, TSL/WebGPU `NodeMaterial` with analytic per-fragment coverage
- `SlugText`, `SlugFont`, `SlugFontLoader`, `SlugGeometry`, `SlugMaterial` — primary public API
- `slug-bake` CLI — pre-bakes font glyph data to `.slug.bin`/`.slug.json` so runtime loading requires no opentype.js
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`
- Dynamic per-instance quad dilation for sub-pixel AA
- React (`/react` subpath) and plain Three.js examples with Canvas2D compare overlay (onion/split/diff modes)

This release ships the complete `@three-flatland/slug` package: an analytic GPU text renderer using TSL/WebGPU with support for baked and runtime font loading, text measurement, underline/strikethrough decorations, multi-font fallback stacks, and a complete stroke rendering pipeline. Two baked format version bumps require re-baking all existing `.slug.bin`/`.slug.json` assets with the updated `slug-bake` CLI.

