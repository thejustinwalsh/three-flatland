---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Stroke rendering pipeline

- `SlugStrokeMaterial` — analytic distance-to-quadratic-Bezier stroke in TSL; bevel-via-min joins, sub-pixel hairline widening, runtime-uniform width + color
- `SlugText.outline` — opt-in child InstancedMesh sharing fill geometry; toggled/updated via `outline` setter or `setOutlineWidth` / `setOutlineColor`; `renderOrder -1` draws stroke behind fill
- `SlugText.setOpacity(value)` — fade fill independently of outline for outline-only mode
- `SlugOutlineOptions` exported from package root; `color` accepts `number | string | Color`
- Stroke quad expansion corrected to axis-aligned per-axis growth instead of diagonal-normal dilation — fixes clipped outer ring at glyph bbox edges
- Stroke shader compile cost halved: single Newton seed at t=0.5 with 3 iterations vs prior 3-seed × 3-iter expansion; ~50% less WGSL, eliminates first-draw stall
- `slugDilate` strokeHalfWidth parameter removed; fill-only callers revert to pre-Phase-4 code path

## Stroke offsetter (build-time baked strokes)

- Quadratic-Bezier stroke offsetter in six stages: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, contour stitching, orchestrator
- `strokeOffsetter(curves, closed, options)` — closed source → outer + inner annular contours; open source → one closed contour with caps
- `bakeStrokeForGlyph(source, options)` — bridges offsetter to GPU pipeline; returns null for advance-only glyphs
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed at `glyphIdOffset + sourceId`
- `BakedJSON.strokeSets` optional field; absent for fonts baked without stroke flags (no format break for existing files)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — retrieves pre-baked stroke glyph data
- Kerning extractor now filters to source IDs only, preventing crashes on stroke glyph ID ranges

## Font stack and fallback

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `emitDecorations`
- `SlugFont.hasCharCode(c)` — codepoint coverage check for stack resolution
- `SlugStackText` — multi-font renderable extending `Group`; one `InstancedMesh` per contributing font
- `SlugStackText.styles` — underline/strike spans via `emitDecorations`; decorations attach to primary font mesh only
- `SlugStackText.outline` — per-font sibling stroke `InstancedMesh` with `SlugStrokeMaterial`; `setOutlineWidth`, `setOutlineColor`
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugStackText.dispose()` fixed to clean up outline child meshes and `SlugStrokeMaterial` instances (was leaking GPU resources on scene toggle)
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint line breaking matching `shapeStackText` policy; used by Canvas2D overlays to stay line-for-line with stack output

## Measurement API

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line, CanvasRenderingContext2D-aligned field names
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line over wrapText + per-line measureText
- Runtime measure uses pre-computed `SlugGlyphData.bounds` (constant cost); baked measure gates ink accumulation on bounds-area (fixes zero-bounds bug on baked path)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — dispatches to baked or runtime shaper

## Text decorations

- `StyleSpan { start, end, underline?, strike? }` — character-range decoration spec
- `pipeline/decorations.ts` — `emitDecorations` post-pass; one rect per contiguous styled run per line
- `SlugGeometry.setGlyphs` accepts optional decorations array; decoration instances use rect sentinel (`glyphJac.w = -1`)
- `SlugMaterial` fragment shader short-circuits to full coverage on sentinel — decorations render in the same draw call as glyphs
- `SlugText` accepts `styles?: StyleSpan[]` in constructor and as runtime setter
- `PositionedGlyph.srcCharIndex` added to both runtime and baked shapers for unambiguous glyph→char mapping

## Pipeline internals

- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU factory extracted from fontParser; used by fontParser, strokeOffsetter, and future SVG path producer
- `parseFont` emits advance-only glyph entries for space/tab/zero-width codepoints — matches bake CLI behavior
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents ligature substitution from collapsing whitespace-boundary checks
- `SlugText._setFont` deferred `visible = true` to inside `_rebuild` — prevents WebGPU "binding size is zero" rejection on R3F's pre-data render pass

## Performance

- `bandCount` 8 → 16: ~halves expected curves/band, proportionally reduces fragment ALU
- Shader wraps post-rootCode work in `If(rootCode > 0)` — ~30% of curves in a band skip the hot path
- `curveTexture` → RGBA16F (8 bytes/texel vs 16); `bandTexture` → RG32F (8 bytes/texel vs 16); ~45% smaller `.slug.bin` on disk
- `MAX_CURVES_PER_BAND` 64 → 40 (p999 of Inter corpus is 25); reduces register pressure

## CLI

- `slug-bake --output / -o` for custom output path base
- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` for baked stroke sets
- Bake-time warning when any band exceeds `MAX_CURVES_PER_BAND`

## Bug fixes

- Stem darkening and per-stem thickening options on `SlugMaterial` / `SlugText`
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (no migration story pre-release)

## Examples (React + Three, 1:1 parity)

- Migrated from Web Awesome to `@three-flatland/tweakpane` with Settings + Mode folders
- Measure overlay: hover any line for cyan ink + dashed yellow font-envelope overlays and live monitor updates; paragraph-level block w/h/lines monitors
- Styles folder: underline/strike scope selector (first word / sentence / line)
- Outline folder: Fill / Outline / Both radio, runtime width slider, color picker
- Scene toggle: [Lorem | Icons] radio; icons mode renders `SlugStackText` with Inter + FA-Solid stack; Canvas2D compare switches font stack to match
- FA-Solid PUA icon subset baked with `slug-bake`; `@font-face font-weight: normal` so Canvas2D fallback matches
- Compare mode gains `Off` option; `redrawCompare` short-circuits when hidden
- `DprSync` component (R3F) syncs pixel ratio on monitor swap / fullscreen; Three example unified `relayout()` helper

## Breaking changes

- `BAKED_VERSION` 2 → 3 → 4: existing `.slug.bin` / `.slug.json` files must be re-baked with the current `slug-bake` CLI
- `slugDilate` no longer accepts `strokeHalfWidth` — callers using the fill shader directly should drop that argument

The slug package lands a complete Phase 1–5 rendering surface: measurement, decorations, font stacks with per-codepoint fallback, analytic stroke with runtime-uniform width/color, and a build-time stroke-set bake pipeline backed by a quadratic-Bezier offsetter.

