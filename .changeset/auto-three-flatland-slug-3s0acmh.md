---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line metrics respecting `maxWidth` / `lineHeight`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — pre-computed line breaks matching the shaper's break policy
- `SlugFont.hasCharCode(codepoint)` — fast codepoint coverage check
- `SlugFontStack(fonts)` — ordered fallback chain; routes each codepoint to the first covering font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint font resolution with the same break policy as `shapeStackText`
- `SlugFontStack.emitDecorations()` — builds decoration rects using the primary font's metrics across mixed-font runs
- `SlugStackText` — `Group` subclass rendering one `InstancedMesh` per font; use when content mixes fonts
- `SlugStackText.styles: StyleSpan[]` — underline / strikethrough spans on stacked text
- `SlugStackText.outline` / `setOutlineWidth` / `setOutlineColor` / `setOpacity` — outline parity with `SlugText`
- `SlugText.styles: StyleSpan[]` — underline / strikethrough decoration ranges
- `SlugText.outline: SlugOutlineOptions` — opt-in analytic stroke rendered behind the fill mesh
- `SlugText.setOutlineWidth` / `setOutlineColor` / `setOpacity` — runtime-uniform setters, zero rebuild
- `SlugStrokeMaterial` — analytic distance-to-curve fragment shader; exported from package root with `SlugOutlineOptions` type
- `StyleSpan`, `TextMetrics`, `ParagraphMetrics`, `SlugOutlineOptions` exported from package root
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke glyph; returns `null` if no matching stroke-set exists

## CLI

- `slug-bake --output / -o <path>` — custom output base for `.slug.json` / `.slug.bin`
- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake one or more stroke pseudo-glyph sets into the same texture pair; stored under `BakedJSON.strokeSets`

## Performance

- Curve texture: `RGBA16F` (half-float) — halves GPU bandwidth vs `RGBA32F`
- Band texture: `RG32F` — removes two wasted float channels per texel
- `MAX_CURVES_PER_BAND` reduced 64 → 40 (p999 Inter corpus = 25, max = 38)
- Band count 8 → 16 — halves expected curves per fragment in the shader hot loop
- Shader: skip post-rootCode solve for non-crossing curves (~30% of curves in a band)
- Stroke shader: single Newton seed (was 3) cuts WGSL size ~50%, halves pipeline compile time and per-fragment GPU cost

## Bug Fixes

- Outline clipping fixed — stroke quad now expands axis-aligned by `strokeHalfWidth` per axis before AA dilation, preventing stroke corners from being culled square at glyph bbox extents
- Pipeline robustness: `stringToGlyphs` called with `{ features: [] }` to suppress `liga`/`rlig` ligature substitution that was collapsing word-boundary arrays and causing whitespace wrapping drift
- `SlugText._setFont` defers `visible = true` until after first `_rebuild`, preventing a zero-size instance buffer error on the first R3F render tick
- `SlugStackText.dispose()` now fully tears down outline meshes and `SlugStrokeMaterial` instances, fixing a GPU memory leak on scene toggle
- `SlugText._setFont` skips outline rebuild when outline is not enabled, avoiding unnecessary GPU resource allocation

## Refactors

- `buildGpuGlyph.ts` — shared pipeline module for curves + contour starts → `SlugGlyphData`; used by `fontParser`, `strokeOffsetter`, and future SVG path producer
- Full quadratic-Bézier stroke offsetter pipeline: adaptive subdivision, per-segment Tiller-Hanson offset, miter/bevel/round join geometry, flat/square/round/triangle cap geometry, contour stitching into fill-pipeline-compatible closed shapes
- `bakeStrokeForGlyph(source, options)` — bridge from stroke offsetter to `buildGpuGlyphData`; preserves `glyphId` / `advanceWidth` / `lsb`

## BREAKING CHANGES

Baked font format was bumped twice during this release cycle. Any `.slug.bin` / `.slug.json` files produced before this release must be re-baked with the current `slug-bake` CLI.

- Format v2 → v3: curve texture switched to `RGBA16F`, band texture to `RG32F`, `MAX_CURVES_PER_BAND` 64 → 40
- Format v3 → v4: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) added to `BakedJSON.metrics`

Releases the initial suite of analytic SDF text rendering for WebGPU: single-font and multi-font stack rendering, underline/strikethrough decorations, opt-in analytic stroke outlines with runtime-uniform width/color, `measureText` / `measureParagraph` APIs, and a `slug-bake` CLI with stroke-set baking support.

