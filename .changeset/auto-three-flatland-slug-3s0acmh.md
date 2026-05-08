---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize) → TextMetrics` — single-line ink + font-box metrics, aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? }) → ParagraphMetrics` — multi-line block metrics matching `SlugText` line-height defaults
- `SlugFont.wrapText(text, fontSize, maxWidth?) → string[]` — line-break output matching the shaped result (baked + runtime)
- `SlugFont.hasCharCode(c) → boolean` — cheap codepoint-coverage check via cmap
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?) → SlugGlyphData | null` — look up pre-baked stroke glyphs by parameter set
- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugStackText extends Group` — multi-font renderable; one `InstancedMesh` per font in the stack
- `SlugStackText.styles: StyleSpan[]`, `SlugStackText.outline`, `SlugStackText.setOpacity()` — full parity with `SlugText`
- `SlugText.outline: SlugOutlineOptions` — opt-in child stroke mesh sharing fill geometry; `setOutlineWidth()`, `setOutlineColor()` for runtime-uniform updates
- `SlugText.setOpacity(value)` — fade fill without rebuilding geometry; enables outline-only mode
- `SlugText.styles: StyleSpan[]` — underline and strikethrough spans via `StyleSpan { start, end, underline?, strike? }`
- `SlugStrokeMaterial` — exported from package root alongside `SlugOutlineOptions`
- `buildGpuGlyphData()`, `buildGpuGlyphFromCurves()`, `buildAdvanceOnlyGlyph()` — shared contour-to-GPU pipeline builders
- `bakeStrokeForGlyph(source, options) → SlugGlyphData | null` — build-time stroke glyph from source contours

## CLI

- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake stroke pseudo-glyphs into the same curve + band textures; stored in `BakedJSON.strokeSets`
- `slug-bake --output / -o <base>` — custom output path base

## Performance

- Band count 8 → 16: ~50% fewer curves/fragment in the hot shader loop
- Skip non-crossing curves in shader: ~30% fewer ops over whitespace fragments
- `curveTexture` → `RGBA16F`, `bandTexture` → `RG32F`: ~45% smaller `.slug.bin` files, ~20% GPU time reduction
- `MAX_CURVES_PER_BAND` reduced from 64 to 40 (covers 100% of Inter's glyph corpus)
- Stroke shader compile cost halved: single Newton seed at `t=0.5` + endpoints; removes ~half the generated WGSL

## Bug fixes

- Runtime shapers now pass `{ features: [] }` to `stringToGlyphs` — suppresses `liga`/`rlig` which collapsed whitespace at wrap points
- `SlugText._setFont` defers `visible = true` to inside `_rebuild` — prevents GPU pipeline errors on first R3F render before geometry is ready
- Stroke quad expansion changed to axis-aligned per-axis push — fixes stroke clipping at glyph bounding box corners
- `SlugStackText.dispose()` now tears down outline child meshes before disposing shared geometry — prevents double-free and GPU leaks on scene toggle
- `parseFont` emits advance-only entries for whitespace/zero-width cmap glyphs — matches baked-path advance resolution

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3** (texture format change): existing `.slug.{json,bin}` files must be re-baked with `slug-bake`
- **BAKED_VERSION 3 → 4** (decoration metrics added to `BakedJSON`): re-bake required again after the decorations commit

Fonts baked with the previous format will fail to load; run `slug-bake` on your source `.ttf` files to regenerate.

Phase 1–5 of the slug roadmap: measurement, decorations, font stacks, analytic stroke rendering, and a full quadratic Bezier offsetter pipeline. Two texture-format changes require re-baking existing `.slug.bin` assets.

