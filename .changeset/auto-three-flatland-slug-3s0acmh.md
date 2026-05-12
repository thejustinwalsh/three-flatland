---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Changelog

### Stroke offsetter & baked stroke sets (Phase 5)

- New `strokeOffsetter(curves, closed, options)` pipeline — adaptive quadratic subdivision, per-segment Tiller-Hanson offset, join insertion (bevel/miter/round), cap insertion (flat/square/round/triangle), full closed-contour output
- `bakeStrokeForGlyph(source, options)` bridges the offsetter to GPU-ready `SlugGlyphData`
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked stroke sets stored in `BakedJSON.strokeSets`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` retrieves pre-baked stroke glyph data
- `slug-bake` gains `--output` / `-o` for custom output path bases
- Shared `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` pipeline extracted from `fontParser` so all glyph producers (font, SVG, stroke) emit identical GPU records

### Outline / stroke rendering (Phase 4)

- `SlugStrokeMaterial` — TSL node material using analytic distance-to-quadratic-Bezier (`distanceToQuadBezier`); bevel-via-min joins at exterior corners with no extra geometry
- `SlugText.outline` / `setOutlineWidth()` / `setOutlineColor()` — opt-in child `InstancedMesh` sharing fill geometry, rendered at `renderOrder -1`; runtime-uniform setters, zero rebuild
- `SlugText.setOpacity(value)` for fill opacity independent of outline
- `SlugOutlineOptions` exported from package root
- Fix: stroke quad now expands axis-aligned (W + 2·hw × H + 2·hw) before pixel-AA dilation pass — previously corners were clipped at glyph extents
- Fix: `distanceToQuadBezier` shader reduced to single Newton seed + 3 iterations; halves WGSL compile time and per-fragment GPU cost

### Font stacks & multi-font rendering (Phase 3)

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint()`, `resolveText()`
- `SlugFont.hasCharCode(c)` — cheap codepoint-coverage check
- `SlugStackText` — `Group` subclass with one `InstancedMesh` per contributing font
- `SlugStackText.styles` (underline/strike), `SlugStackText.outline`, `SlugStackText.setOpacity()` — parity with `SlugText`
- `SlugFontStack.emitDecorations()` — stack-aware decoration emission keyed on positioned-glyph identity
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint stack-aware line wrapping; `wrapLinesStack.ts` pipeline module
- `SlugStackText.dispose()` fixed to clean up outline meshes and fill `InstancedMesh` children

### Text decoration (Phase 2)

- `StyleSpan { start, end, underline?, strike? }` API; `SlugText.styles` setter
- `pipeline/decorations.ts` — `emitDecorations()` pure post-pass over shaped glyphs
- `SlugFont.emitDecorations(text, positioned, styles, fontSize)` convenience wrapper
- Decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) sourced from OpenType `post`/`os2` tables at parse time and baked into `BakedJSON.metrics`
- `SlugGeometry.setGlyphs` accepts optional `decorations` array; rect-sentinel instances render solid fill without the curve evaluator

### Measurement API (Phase 1)

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-compatible single-line metrics (width, actualBoundingBox*, fontBoundingBox*)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- Runtime path reads pre-computed `SlugGlyphData.bounds`; baked path uses bounds-area gate (fixes silent zero-ink bounds on baked path)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches to baked or runtime shaper

### Baked fonts & CLI

- `slug-bake` CLI for offline font baking to `.slug.{json,bin}` binary format
- `BAKED_VERSION` progression: 2→3 (RGBA16F curves, RG32F bands, MAX_CURVES_PER_BAND 40), 3→4 (decoration metrics in `BakedJSON.metrics`); old files must be re-baked
- `SlugFontLoader` loads baked font data and forwards `strokeSets` metadata to `SlugFont`

### Performance

- `bandCount` 8→16 halves expected curves/band (~6.3→~3.2 mean); shader early-exits non-crossing curves — ~20-30% fragment ALU reduction
- `curveTexture` → RGBA16F (8 bytes/texel), `bandTexture` → RG32F (8 bytes/texel), `MAX_CURVES_PER_BAND` 64→40 — ~45% smaller `.slug.bin` files, ~20% GPU bandwidth reduction

### Pipeline fixes & robustness

- `parseFont` emits advance-only entries (real `advanceWidth`, empty curves) for whitespace and zero-width control codepoints
- Runtime shapers pass `{ features: [] }` to disable OpenType `liga`/`rlig` — fixes word-boundary drift at wrap points
- `SlugText._setFont` defers `visible=true` until first `_rebuild` — prevents WebGPU zero-binding errors on first R3F frame
- `SlugFontLoader.clearCache` and `BAKED_VERSION` version-check machinery removed (pre-release, no migration story)

### Examples

- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`; React example added for 1:1 Three.js / R3F parity
- Canvas2D compare overlay (onion / diff / split / off modes) in both examples
- Icons mode: FontAwesome Solid 12-glyph baked subset via `slug-bake`, Canvas2D `@font-face` fallback
- Click-to-select line measure overlay with cyan ink and dashed yellow font-envelope bounds
- Compare overlay uses `stack.wrapText` in icons mode for line-break agreement with `SlugStackText`
- `Compare mode Off` hides overlay entirely for clean standalone rendering

Adds the full `@three-flatland/slug` package: analytic WebGPU text rendering via the Slug fill algorithm, baked font pipeline, multi-font fallback stacks, underline/strikethrough decorations, measurement API, and a quadratic-Bezier stroke offsetter for Phase 5 baked strokes.

