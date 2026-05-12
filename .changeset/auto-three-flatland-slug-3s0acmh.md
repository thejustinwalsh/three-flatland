---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement, field-aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break using baked or runtime shaper
- `SlugFont.hasCharCode(c)` — codepoint coverage check
- `SlugFontStack(fonts)` — ordered font fallback chain with per-codepoint resolution and `wrapText` support for mixed-font content
- `SlugStackText` — multi-font renderable; one `InstancedMesh` per font in the stack
- `SlugStackText.styles`, `.outline`, `.setOpacity()` — feature parity with `SlugText`
- `SlugText.outline` / `setOutlineWidth()` / `setOutlineColor()` — opt-in stroke outline via child `InstancedMesh`
- `SlugText.setOpacity(value)` — fill opacity for outline-only mode
- `SlugText.styles: StyleSpan[]` — underline and strikethrough decorations
- `SlugStrokeMaterial` — stroke `NodeMaterial` with runtime-uniform width and color; exported from package root alongside `SlugOutlineOptions`
- `bakeStrokeForGlyph(source, options)` — contour offsetting + GPU packing for pre-baked stroke glyphs
- `strokeOffsetter(curves, closed, options)` — quadratic-Bezier stroke offsetter with bevel/miter/round joins and flat/square/round/triangle caps
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline (extracted from `fontParser`)
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit`, and `--output/-o` flags
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — lookup pre-baked stroke `SlugGlyphData`; `BakedJSON.strokeSets` optional field carries the metadata
- `SlugFontLoader`: `BAKED_VERSION` version-check machinery removed (pre-release; no migration story)

## Bug Fixes

- Stroke quad clipping: expansion now axis-aligned per-vertex instead of along the diagonal unit normal — fixes outer stroke ring squared off at glyph extents
- Stroke shader compile latency halved: single Newton seed at `t=0.5` + 3 iterations + 2 endpoint candidates replaces 3-seed × 3-iteration spread
- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild` — prevents WebGPU "Binding size is zero" error on the R3F render that fires before `useFrame`
- `SlugStackText.dispose()` tears down outline meshes and stroke materials before disposing shared geometries
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` collapsing whitespace at word-boundary checks
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab, zero-width controls)
- Kerning extraction filters to source IDs only — stroke glyph IDs in offset ranges caused `_push is not a function`
- Baked `measureText` uses bounds-area gate instead of `curves.length > 0` — previously returned zero ink bounds for all baked glyphs
- `SlugText._setFont` skips outline rebuild when outline is not enabled — avoids GPU resource cost for non-outline users

## Performance

- Curve texture: RGBA32F → RGBA16F, halving memory bandwidth
- Band texture: RGBA32F → RG32F, halving memory bandwidth; baked fixtures shrink ~45%
- `MAX_CURVES_PER_BAND` 64 → 40 (Inter corpus p999 = 25, max = 38); reduces shader register pressure
- Band count 8 → 16, halving expected curves per band and per-fragment ALU work
- Shader wraps post-`rootCode` solve in `If(rootCode > 0)` — skips ~30% of non-crossing curves per band

## Baked Format

- `BAKED_VERSION` 3 → 4: decoration metrics (`underlinePosition`, `underlineThickness`, etc.) added to `BakedJSON.metrics`; re-bake required
- `BAKED_VERSION` 2 → 3: RGBA16F curve texture + RG32F band texture; re-bake required
- `BakedJSON.strokeSets` optional field carries pre-baked stroke metadata; absent for fonts baked without stroke flags

## Examples

Both Three.js and React examples maintain 1:1 feature parity throughout.

- Canvas2D compare overlay with onion/split/diff/off modes and a draggable split handle
- Hover-to-measure overlays showing cyan ink bounds and dashed yellow font envelope; paragraph monitors (block width/height/lines)
- Font Awesome Solid icon fallback demo using a baked 12-icon PUA subset alongside Inter
- Tweakpane controls replace Web Awesome throughout; Outline folder (style/width/color), Styles folder (underline/strikethrough scope), compare mode includes an `Off` option
- DPR and fullscreen resize propagated to both canvases via `useWindowSize` DPR tracking and a `DprSync` component

## Summary

Adds the complete `@three-flatland/slug` analytic text rendering pipeline: font stack fallback, text measurement, underline/strikethrough decorations, runtime stroke outlines backed by a quadratic-Bezier offsetter, and baked stroke export via the CLI. Significant GPU bandwidth reductions land alongside, and both Three.js and React examples demonstrate all features at 1:1 parity.

