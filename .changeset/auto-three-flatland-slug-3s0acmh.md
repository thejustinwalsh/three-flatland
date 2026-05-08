---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — Canvas2D-aligned single-line metrics (width, actualBoundingBox*, fontBoundingBox*)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block metrics respecting the same lineHeight default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-accurate wrapping matching `SlugText` output
- `SlugFont.hasCharCode(c)` — codepoint coverage check via the font's cmap
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` → `SlugGlyphData | null` — look up a pre-baked stroke glyph from a `strokeSets` entry
- `SlugFontStack(fonts)` — per-codepoint font fallback chain; `resolveCodepoint()`, `resolveText()`, `emitDecorations()`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — stack-aware wrapping for mixed-font content
- `SlugStackText` (extends `Group`) — multi-font renderable; one `InstancedMesh` per font in the stack
- `SlugStackText.styles: StyleSpan[]` — underline/strikethrough spans on stack-rendered text
- `SlugStackText.outline: SlugOutlineOptions` — outline rendering on stack text; `setOutlineWidth()`, `setOutlineColor()`
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugStackText.dispose()` — full teardown: outline meshes, fill meshes, geometries, materials
- `SlugText.outline: SlugOutlineOptions | null` — opt-in outline rendering via a child `InstancedMesh` sharing the fill geometry
- `SlugText.setOpacity(value)` — runtime opacity for Outline-only mode (fill alpha=0)
- `SlugText.setOutlineWidth(value)` / `setOutlineColor(value)` — zero-rebuild runtime setters
- `StyleSpan { start, end, underline?, strike? }` — decoration span API
- `SlugFont.emitDecorations()` — build `DecorationRect[]` from shaped glyphs and style spans
- `SlugStrokeMaterial` — exported stroke `NodeMaterial` with runtime-uniform width/color
- `SlugOutlineOptions` — exported options type

## CLI (`slug-bake`)

- New flags: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` — bake stroke pseudo-glyphs alongside fill glyphs
- New flag: `--output / -o` — custom output base path
- `BakedJSON.strokeSets?` — optional metadata array for stroke-baked fonts; absent for fonts baked without stroke flags (backward compatible)

## Pipeline

- `strokeOffsetter(curves, closed, options)` — full quadratic-Bezier stroke offsetter: adaptive subdivision, per-segment Tiller-Hanson offset, miter/round/bevel joins, flat/square/triangle/round caps
- `bakeStrokeForGlyph(source, options)` → `SlugGlyphData | null` — stroke bake helper for CLI, runtime async workers, and SVG paths
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared GPU pipeline builders factored out of `fontParser`

## Performance

- Curve texture: RGBA16F (half bandwidth vs RGBA32F)
- Band texture: RG32F (half bandwidth vs RGBA32F)
- Band count: 8 → 16, cutting expected curves/band roughly in half
- `MAX_CURVES_PER_BAND`: 64 → 40 (covers 100% of Inter's corpus; reduces shader register pressure)
- Shader: non-crossing curves skip the sqrt/divisions/saturates entirely
- Outline shader: compile time halved; single Newton seed with 3 iterations instead of 3 seeds × 3 each; runtime GPU cost drops ~⅔

## Bug Fixes

- Outline quads clipped at glyph extents — axis-aligned expansion now applied per-axis before pixel-AA dilation pass
- First outline-enable toggle caused hundreds of ms hitch — shader size halved, pipeline compile time halved
- Whitespace collapsed at wrap points due to opentype.js `liga`/`rlig` features shortening the glyph array; runtime shapers now pass `{ features: [] }`
- `SlugText` flipped `visible=true` before first `_rebuild`, causing WebGPU "binding size is zero" errors on R3F's initial render pass; visibility now set inside `_rebuild`
- Baked-path `measureText` returned zero ink bounds for every glyph; fixed with bounds-area gate (`xMax > xMin`)

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: curve texture changed to RGBA16F, band texture to RG32F, `MAX_CURVES_PER_BAND` reduced to 40. Re-run `slug-bake` on all `.slug.{json,bin}` assets.
- **BAKED_VERSION 3 → 4**: decoration metrics (underlinePosition, underlineThickness, strikethrough*, subscript*, superscript*) added to `BakedJSON.metrics`. Re-run `slug-bake` on all assets.
- `SlugFontLoader.clearCache` removed — cache is already keyed by `url:runtime?`, no migration needed.

Adds full text measurement, decoration, font-stack fallback, outline rendering, and stroke bake support to `@three-flatland/slug`. Texture format and band-layout changes require re-baking all `.slug.*` assets.

