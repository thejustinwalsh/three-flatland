---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox*, fontBoundingBox*)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions respecting the same `lineHeight` default (1.2) as `SlugText`
- Baked-path bounds fix: switched from `curves.length > 0` to `xMax > xMin` heuristic; previous code returned zero ink bounds for all baked glyphs
- Runtime measure reads pre-computed `SlugGlyphData.bounds` instead of per-call `glyph.getBoundingBox()` — constant cost regardless of glyph complexity

## Text Decorations

- `StyleSpan { start, end, underline?, strike? }` — manual-range decoration API (Slug §2.7/§2.8)
- `SlugText` accepts `styles?: StyleSpan[]` in constructor and as a runtime setter
- Decoration rects appended as sentinel instances in `SlugGeometry`; `SlugMaterial` short-circuits coverage to 1 for rect sentinels — same draw call as glyphs
- Font-declared metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) baked into `BakedJSON.metrics`
- **BAKED_VERSION 3 → 4** — re-bake `.slug.bin/.json` files required

## Font Stacking

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain (Slug §4.6); first covering font wins, notdef falls through to primary
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check (baked: cmapLookup; runtime: opentype charToGlyph)
- `SlugStackText` extends `Group` — multi-font renderable with one `InstancedMesh` per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint wrap matching `SlugStackText` line breaks exactly; backed by `pipeline/wrapLinesStack.ts`
- `SlugFontStack.emitDecorations()` — decoration post-pass for stack runs using primary font's metrics for visual consistency
- `SlugStackText.styles`, `.outline`, `.setOpacity()` — full parity with `SlugText`
- `SlugStackText.dispose()` — properly tears down outline child meshes before fill meshes to avoid double-free

## Text Outline (Phase 4)

- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; rendered at `renderOrder = -1` behind fill
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` — runtime-uniform setters, zero geometry rebuild
- `SlugText.setOpacity(v)` — fades fill material for outline-only mode
- `SlugStrokeMaterial` — stroke `NodeMaterial` with `color`, `opacity`, `strokeHalfWidth` uniforms; exported from package root
- Analytic `distanceToQuadBezier` TSL shader + `slugStroke` fragment shader (bevel-via-min for exterior corners)
- `SlugOutlineOptions` type exported from package root
- Bug fix: stroke quad now expands axis-aligned by `strokeHalfWidth` per axis before the AA dilation pass — previous diagonal-normal expansion clipped the outer stroke ring at glyph bbox extents
- Shader compile cost halved by reducing Newton seeds from 3×3 to 1×3; per-fragment GPU cost also reduced ~⅔

## Stroke Offsetter (Phase 5, Tasks 16–17)

- `strokeOffsetter(curves, closed, options)` — full quadratic-Bézier stroke-offset pipeline:
  - Adaptive subdivision: splits curves until per-segment approximation error < epsilon
  - Per-segment Tiller-Hanson offset producing offset quadratics
  - Join insertion: miter (with miterLimit fallback to bevel), bevel, round
  - Cap insertion: flat, square, triangle, round (semicircle split into ≤60°/segment quads)
  - Contour stitching: closed source → outer CCW + inner CW annular ring; open source → single closed contour with caps
- `bakeStrokeForGlyph(source, options)` — converts a source glyph into a stroke `SlugGlyphData` via `buildGpuGlyphData`; returns `null` for advance-only glyphs
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets` — optional field listing pre-baked stroke configurations with `glyphIdOffset`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke glyph data by matching set

## Pipeline & Internals

- `buildGpuGlyph.ts` — shared contour-to-GPU factory extracted from `fontParser`; three exported builders: `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`
- `parseFont` now emits advance-only glyph entries (real `advanceWidth`, empty curves/bounds) for space, tab, and zero-width codepoints — consistent with bake CLI post-pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — disables `liga`/`rlig` substitution that was collapsing whitespace at word-wrap boundaries
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — same wrap policy as `shapeText`; dispatches baked vs runtime path
- `SlugText._setFont` defers `visible = true` until after first `_rebuild` — prevents WebGPU zero-binding-size errors on the first R3F render pass
- `BAKED_VERSION` migration machinery removed from `SlugFontLoader` (pre-release clean-up)
- Kerning extraction in bake CLI now filters to source glyph IDs only — stroke ID ranges were causing `this.font._push is not a function` errors

## Performance

- Band count 8 → 16: halves expected curves/band (~6.3 → ~3.2 mean); `.slug.bin` grows ~1.5× but ALU per fragment scales down proportionally
- Texture formats: curveTexture → `RGBA16F` (8 bytes/texel), bandTexture → `RG32F` (8 bytes/texel) — ~20% GPU bandwidth reduction; baked files shrink ~45%
- `MAX_CURVES_PER_BAND` 64 → 40 — covers Inter's full corpus (p999 = 25, max = 38) with reduced shader register pressure
- Shader early-exit: wraps post-rootCode work in `If(rootCode > 0)` — ~30% of curves per band skip the solve + coverage path entirely
- **BAKED_VERSION 2 → 3** — re-bake required for texture format change

## CLI

- `slug-bake --output / -o <path>` — custom output base path for baked font files

## Initial Package

- Core WebGPU text rendering pipeline: font parsing (opentype.js), text shaping, GPU curve + band texture packing
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — primary public API
- `SlugFontLoader` with baked font format (`slug-bake` CLI)
- Stem darkening and thickening options on `SlugMaterial` / `SlugText`
- Dynamic quad dilation in `SlugMaterial` for sub-pixel AA
- React subpath (`three-flatland/react` pattern) with R3F component types

Adds Phase 1–5 features to `@three-flatland/slug`: text measurement, style decorations, multi-font stacking, analytic stroke outlines, a full quadratic-Bézier stroke offsetter, and pre-baked stroke sets via `slug-bake`. Includes two performance passes cutting GPU bandwidth ~20–45% and shader compile time ~50%.

