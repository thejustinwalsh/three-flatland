---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59


## New APIs

- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — WebGPU text rendering pipeline backed by TSL shaders
- `slug-bake` CLI: pre-bake font data to `.slug.{json,bin}`; gains `--output/-o` for custom output paths and `--stroke-widths/--stroke-join/--stroke-cap/--miter-limit` flags for baked stroke sets
- `SlugFontLoader` — load baked or runtime (opentype.js) fonts via unified async API
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — line-wrapping dispatched to baked or runtime path
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned single-line metrics
- `SlugFont.measureParagraph(text, fontSize, opts?)` → `ParagraphMetrics` — multi-line metrics respecting `lineHeight`
- `SlugFont.hasCharCode(c)` — codepoint coverage check
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up a pre-baked stroke glyph
- `StyleSpan` API on `SlugText` — underline and strikethrough decorations over character ranges
- `SlugFontStack(fonts)` — per-codepoint font fallback chain with `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugStackText` — multi-font renderable `Group` with one `InstancedMesh` per font; supports `styles`, `outline`, `setOpacity`, `dispose`
- `SlugText.outline` / `SlugText.setOutlineWidth` / `SlugText.setOutlineColor` / `SlugText.setOpacity` — opt-in outline rendering with runtime-uniform width + color
- `SlugStrokeMaterial` — distance-to-quadratic-Bezier fragment shader for stroke rendering; exported from package root with `SlugOutlineOptions`
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline used by fontParser, stroke offsetter, and future SVG path support
- `bakeStrokeForGlyph(source, options)` — bridge between stroke offsetter and bake/runtime consumers
- Full quadratic-Bezier stroke offsetter pipeline: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round joins, flat/square/triangle/round caps, contour stitching

## Performance

- curveTexture → RGBA16F, bandTexture → RG32F: ~45% smaller `.slug.bin` files, ~20% less GPU bandwidth
- bandCount 8 → 16: halves expected curves per band, proportionally reduces fragment ALU
- Shader skips sqrt/division/saturate work for non-crossing curves (~30% savings on text-heavy scenes)
- MAX_CURVES_PER_BAND 64 → 40 (covers p999 of real Inter corpus); bake warns on overflow
- Stroke shader reduced to single Newton seed (3 candidates vs 5): ~50% smaller WGSL, faster pipeline compile and per-fragment runtime

## Bug Fixes

- Stroke quad expanded axis-aligned per-axis instead of along diagonal normal — fixes outer ring clipping square at glyph extents
- `SlugText._setFont` defers `visible=true` until first `_rebuild` — prevents WebGPU binding-size errors on R3F initial render
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` feature application
- `parseFont` emits advance-only entries for cmap'd no-outline glyphs (space, tab) — matches baked path advance resolution
- `SlugStackText.dispose` now tears down outline child meshes before fill meshes to avoid double-free
- Kerning extraction filters to source IDs only — prevents `this.font._push is not a function` when kern extractor encounters stroke glyph ID ranges

## Breaking Changes

- BAKED_VERSION 2→3: curveTexture/bandTexture format changed — existing `.slug.bin/.json` files must be re-baked with `slug-bake`
- BAKED_VERSION 3→4: decoration metrics (underlinePosition/Thickness, strikethroughPosition/Thickness) added to `BakedJSON.metrics` — re-bake required
- `SlugFontLoader.clearCache` removed (cache is already URL-keyed; no migration needed)

## Examples

- `examples/vanilla/slug-text` renamed to `examples/three/slug-text`; React + Three examples kept at 1:1 parity throughout
- Interactive outline controls (style/width/color), measure overlay (click-to-select line), underline/strike style panel, and [Lorem | Icons] scene toggle added to both examples
- Icons mode uses FA-Solid PUA codepoints baked with `slug-bake`; Canvas2D compare switches to a matching `@font-face` stack

This release ships the complete `@three-flatland/slug` text rendering library: analytic GPU coverage via TSL shaders, baked and runtime font loading, measurement, decorations, multi-font stacks, and a pre-baked stroke pipeline built on a full quadratic-Bezier offsetter.
