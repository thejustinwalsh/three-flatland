---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**Stroke rendering (Phase 4–5)**

- `SlugText.outline` — opt-in child mesh renders a stroke behind each fill; settable as constructor option or runtime property; `setOutlineWidth` / `setOutlineColor` update uniforms with zero geometry rebuild
- `SlugStrokeMaterial` — TSL NodeMaterial for distance-to-curve stroke coverage; exported from package root alongside `SlugOutlineOptions`
- `SlugStackText.outline` — full outline parity with SlugText; one `SlugStrokeMaterial` mesh per font in the stack; `setOutlineWidth` / `setOutlineColor` work across all fonts
- `SlugStackText.setOpacity(value)` — forwards to every per-font fill material; enables fill-opacity=0 outline-only mode in icon/stack scenes
- Stroke quad expansion fixed: axis-aligned per-vertex dilation replaced diagonal unit-normal expansion, eliminating the square clipping artefact at glyph bbox extents
- Shader compile hitch on first outline enable reduced ~50% by simplifying Newton solver to single seed + endpoints (3 candidates vs 5); per-fragment runtime cost also drops ~⅔
- `slugDilate` no longer accepts a `strokeHalfWidth` parameter — fill callers are unaffected; stroke expansion now happens in the vertex shader

**Stroke offsetter pipeline (Phase 5, Tasks 16–17)**

- `strokeOffsetter(curves, closed, options)` — complete quadratic-Bézier stroke offsetter: adaptive subdivision → per-segment offset → join insertion (miter / bevel / round) → cap insertion (flat / square / triangle / round) → contour stitching; returns closed contour(s) ready for the fill pipeline
- `bakeStrokeForGlyph(source, options)` — bridges the offsetter and downstream consumers (CLI, runtime worker, SVG shapes); produces a full `SlugGlyphData` with matching `glyphId` / `advanceWidth` / `lsb`; returns `null` for advance-only glyphs
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked stroke pseudo-glyphs are packed into existing curve+band textures at `glyphIdOffset + sourceId`
- `BakedJSON.strokeSets` optional field — absent when no stroke flags passed (old fixtures load unchanged)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke glyph; returns `null` when no matching set exists
- `buildGpuGlyph.ts` — shared pipeline module (`buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`); fontParser, strokeOffsetter, and future SVG path producer all emit identical `SlugGlyphData` records

**Font stacks and icon rendering**

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint` / `resolveText` walk the chain; first matching font wins, uncovered codepoints fall back to primary's notdef
- `SlugFont.hasCharCode(c)` — cheap codepoint-coverage check (baked: cmapLookup; runtime: opentype charToGlyph)
- `SlugStackText extends Group` — multi-font renderable; one `InstancedMesh` per font that contributes glyphs; shared shaping pipeline
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint wrap matching `shapeStackText`'s break policy; lets Canvas2D overlays stay line-for-line with GPU output when content mixes fonts
- `SlugFontStack.emitDecorations()` — builds decorations using primary-font metrics so underline/strike lines stay consistent across mixed-font runs
- `SlugStackText.styles: StyleSpan[]` — underline / strike parity with SlugText; decorations attach to the primary font's mesh only
- `SlugStackText.dispose()` fixed — previously left outline child meshes and `SlugStrokeMaterial` instances allocated after scene toggle; now tears down outlines before geometries to avoid double-free

**Text measurements**

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line, CanvasRenderingContext2D-aligned field names; works on both runtime and baked paths; constant per-call cost via pre-computed `SlugGlyphData.bounds`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText + measureText`; same `lineHeight` default (1.2) as `SlugText`
- Baked measure now gates ink accumulation on `xMax > xMin` bounds-area instead of `curves.length > 0`; the old heuristic silently returned zero ink bounds for every baked glyph

**Text decorations**

- `StyleSpan { start, end, underline?, strike? }` — manual-aligned style range per Slug §2.7/§2.8
- `SlugText.styles?: StyleSpan[]` — constructor option and runtime setter; threads through shaper + decoration emission
- `SlugGeometry.setGlyphs` accepts optional `decorations` array; decoration rects are appended as sentinel instances (`glyphJac.w = -1`) rendered in the same draw call at full coverage
- `BAKED_VERSION` bumped 3 → 4 to include decoration metrics (underlinePosition, underlineThickness, strikethroughPosition, strikethroughThickness); included fixtures re-baked

**Performance**

- Band count 8 → 16: halves expected curves per band (mean ~6.3 → ~3.2); band texture grows ~1.5× (~7.1 MB → ~11.2 MB) — acceptable for a font library
- Shader skips sqrt + coverage work for ~30% of curves per band that don't cross the ray at the fragment's position
- `curveTexture` → RGBA16F (8 bytes/texel vs 16); `bandTexture` → RG32F (8 bytes/texel vs 16); together drop GPU bandwidth ~20%
- `MAX_CURVES_PER_BAND` 64 → 40; `BAKED_VERSION` bumped 2 → 3; fixtures re-baked (13 MB → 7.1 MB, ~45% smaller on disk)

**API additions and fixes**

- `SlugFont.wrapText(text, fontSize, maxWidth?)` — dispatches to opentype or baked shaper; used by compare overlays to keep Canvas2D line breaks identical to shaped output
- `SlugText.setOpacity(value)` — fill-opacity uniform setter; no geometry rebuild
- `SlugOutlineOptions.color` accepts `number | string | Color`
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab, zero-width controls); matches bake CLI post-pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; eliminates whitespace collapse at wrap points caused by `liga`/`rlig` shortening the glyph array vs `text.length`
- `SlugText._setFont` defers `visible = true` until inside `_rebuild` after real glyph data is written; prevents TSL pipeline-build against an uninitialized buffer on first R3F render
- `SlugFontLoader` BAKED_VERSION machinery removed (package unreleased; no migration story)
- `slug-bake` CLI gains `--output` / `-o` for custom output base paths
- Stem darkening and thickening options added to `SlugMaterial` / `SlugText`; coverage calculations updated
- `SlugMaterial` dynamic dilation corrected for quad rendering

**Initial release**

- Full GPU text rendering pipeline: font parsing (opentype.js runtime + `slug-bake` CLI for baked assets), text shaping, band-based curve texture packing, TSL fill shader with analytic per-fragment coverage
- `SlugFont`, `SlugFontLoader`, `SlugGeometry`, `SlugMaterial`, `SlugText` — core rendering objects
- React subpath (`three-flatland/react`) with R3F-compatible prop-set / useFrame pattern
- Both Three.js and React examples with Canvas2D comparison overlays (onion / split / diff modes)

BREAKING CHANGES: `BAKED_VERSION` was bumped twice (2→3 and 3→4); any `.slug.bin` / `.slug.json` files produced by earlier versions of `slug-bake` must be re-generated with the current CLI.

Phase 4–5 stroke pipeline ships the full quadratic-Bézier offsetter, baked stroke sets, runtime outline rendering with live width/color controls, and SlugFontStack for multi-font / icon rendering.

