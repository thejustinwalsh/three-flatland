---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`; works on both baked and runtime paths with constant per-call cost
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line measurement respecting the same lineHeight default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-wrap matching the shaper's break-at-last-space + hard-break-fallback policy
- `SlugFont.hasCharCode(codepoint)` — codepoint coverage check (used internally by `SlugFontStack`)
- `SlugFontStack(fonts: SlugFont[])` — per-codepoint font fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugStackText extends Group` — multi-font renderable; one `InstancedMesh` per font for per-draw-call texture binding; supports `styles`, `outline`, `setOpacity`, and `dispose`
- `SlugText.outline` — opt-in stroke child mesh (`SlugStrokeMaterial`) sharing the fill mesh's `instanceMatrix`; no geometry copy, zero drift
  - `SlugText.setOutlineWidth(value)` / `SlugText.setOutlineColor(value)` — runtime-uniform setters, zero rebuild
- `SlugText.setOpacity(value)` — forwards to the fill material's opacity uniform
- `SlugText.styles: StyleSpan[]` — underline / strikethrough decoration spans; settable at construction or runtime
- `SlugStrokeMaterial` — TSL stroke `NodeMaterial`; exported from package root alongside `SlugOutlineOptions`
- `buildGpuGlyphData`, `buildGpuGlyphFromCurves`, `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline (`pipeline/buildGpuGlyph.ts`) used by font parser, stroke offsetter, and future SVG path support
- `bakeStrokeForGlyph(source, options)` — converts fill glyph contours to stroke pseudo-glyph via the offsetter pipeline
- Stroke offsetter pipeline (`pipeline/strokeOffsetter.ts`): adaptive subdivision, Tiller-Hanson per-segment offset, join insertion (bevel/miter/round with miterLimit fallback), cap insertion (flat/square/triangle/round), full closed/open contour orchestrator
- `slug-bake` CLI: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags bake stroke sets into `.slug.{json,bin}`; `--output / -o` for custom output base path
- `BakedJSON.strokeSets` field carries stroke metadata; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` looks up pre-baked stroke glyphs at runtime
- `SlugFontStack.emitDecorations()` — per-glyph advance lookup via `WeakMap`; decoration rects use primary font metrics for visual consistency across mixed-font runs
- `pipeline/decorations.ts` `emitDecorations` accepts a function-callback variant of the advance lookup (legacy `Map` signature unchanged)
- `srcCharIndex` on `PositionedGlyph` — unambiguous glyph-to-character mapping for style span passes

## Improvements

- Stem darkening and thickening options added to `SlugMaterial` / `SlugText`
- Baked font format (`slug-bake` CLI, `SlugFontLoader`, `BakedJSON`) — includes font metrics, glyph bounds, and curve/band textures; `SlugFontLoader` auto-selects baked vs runtime path
- `parseFont` emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for cmap'd glyphs with no outline (space, tab, zero-width controls) — matches the CLI bake post-pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — disables opentype.js ligature substitution that was collapsing whitespace at wrap points
- `SlugText._setFont` defers `visible = true` until the first `_rebuild` writes glyph data — prevents blank-canvas on R3F's first frame before `useFrame` fires
- `SlugStrokeMaterial` quad expansion: axis-aligned per-vertex push (`±strokeHalfWidth` on each axis independently) instead of diagonal unit-normal push — eliminates stroke clipping at glyph bbox edges
- Stroke fragment shader: single Newton seed at t=0.5 (was 3 seeds) + 2 endpoints — halves generated WGSL size and pipeline compile time, reduces per-fragment cost ~⅔
- Band count 8 → 16: halves expected curves per band, cuts fragment ALU in the hot loop
- Shader skips post-rootCode work for non-crossing curves (`If(rootCode > 0)`) — ~30% of band curves bypass the sqrt/division/saturate path
- `curveTexture` → `RGBA16F` (half-float), `bandTexture` → `RG32F` — halves texture bandwidth; `.slug.bin` ~45% smaller on disk
- `MAX_CURVES_PER_BAND` 64 → 40; CLI warns when any band exceeds the shader bound
- `SlugStackText.dispose()` tears down outline meshes before fill meshes to avoid double-dispose of shared geometry
- `SlugText._setFont` skips outline rebuild when outline is not enabled — avoids GPU resource cost for users who never opt into outlines
- Kerning extraction filters to source glyph IDs only — stroke glyph IDs are out-of-range for opentype.js and caused a runtime error in the kern extractor

## Bug fixes

- Baked-path `measureText` ink-bounds gate changed from `curves.length > 0` (always zero at runtime after unpack) to `xMax > xMin` — fixes zero ink bounds for all glyphs on the baked path
- `SlugFontLoader.clearCache` removed — the static cache is already keyed on `url:runtime?` and the method was a no-op footgun

## BREAKING CHANGES

- `BAKED_VERSION` 2 → 3: texture format changed to RGBA16F curves + RG32F bands + `MAX_CURVES_PER_BAND` 40. Re-bake all `.slug.{json,bin}` files with the updated `slug-bake` CLI.
- `BAKED_VERSION` 3 → 4: baked format now includes OpenType decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`). Re-bake all `.slug.{json,bin}` files; included example fixtures re-baked.
- `SlugFontLoader.clearCache` removed.

This release ships the full text-rendering stack: measurement, decorations (underline/strike), multi-font stacks with per-codepoint fallback, runtime and baked stroke outlines, and a quadratic-Bezier stroke offsetter pipeline for build-time stroke baking.
