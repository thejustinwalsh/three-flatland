---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

### Stroke / outline rendering
- `SlugText.outline` — opt-in outline child mesh sharing fill geometry; runtime-uniform `width` and `color` setters (zero rebuild)
- `SlugText.setOpacity(value)` — fade fill independently for outline-only mode
- `SlugText.setOutlineWidth` / `setOutlineColor` — uniform-only updates, no geometry rebuild
- `SlugOutlineOptions` exported from package root
- `SlugStrokeMaterial` — stroke-capable TSL NodeMaterial; same instance-attribute layout as `SlugMaterial`
- Analytic `distanceToQuadBezier` — TSL port + CPU reference; bevel-via-min join dispatch
- Phase 5 stroke offsetter (quadratic-Bézier, build-time):
  - Adaptive subdivision (`subdivideForOffset`) with per-segment Tiller-Hanson offset
  - Join insertion: miter (with `miterLimit` fallback to bevel), round, bevel
  - Cap insertion: flat, square, triangle, round (≤60°-per-segment arc quads)
  - `strokeOffsetter` orchestrator: closed contour → outer CCW + inner CW annular ring; open contour → single closed loop with caps
- `bakeStrokeForGlyph(source, options)` — helper bridging offsetter to the GPU glyph pipeline
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked stroke glyphs stored at `glyphIdOffset + sourceId` in the same curve/band textures
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke glyph from `BakedJSON.strokeSets`
- `SlugStackText.outline` — parity with `SlugText.outline`; one `SlugStrokeMaterial` per font in the stack
- `SlugStackText.setOpacity(value)` — forwards to every per-font fill material

### Font stack & fallback
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `hasCharCode`
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check
- `SlugStackText` extends `Group` — one `InstancedMesh` per font; wrap-aware shaper preserves kerning within same-font runs
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — line-break-consistent wrapping across mixed-font stacks
- `SlugFontStack.emitDecorations()` — decoration rects keyed per positioned-glyph via `WeakMap` for multi-font runs

### Text measurement
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — aligned with `CanvasRenderingContext2D.measureText`; dispatches to baked or runtime impl
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — wraps `wrapText` + per-line `measureText`

### Decorations
- `SlugText.styles: StyleSpan[]` — underline / strikethrough spans; `StyleSpan { start, end, underline?, strike? }`
- `SlugStackText.styles` — decoration parity; underline runs on primary font's line metrics across fallback runs
- Decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) sourced from OpenType post/os2 tables and baked into `BakedJSON.metrics`
- `pipeline/decorations.ts` — `emitDecorations` now accepts a function-callback advance lookup (Map overload preserved)

### Measurement & rendering options
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — baked/runtime dispatch
- `slug-bake` CLI gains `--output` / `-o` for custom output base paths
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline in `pipeline/buildGpuGlyph.ts`; used by font parser, stroke offsetter, and future SVG path support

### Performance
- Curve texture format: `RGBA32F` → `RGBA16F`; band texture: `RGBA32F` → `RG32F` — ~45% smaller `.slug.bin` on disk
- `MAX_CURVES_PER_BAND` 64 → 40 — reduced shader register pressure
- Band count 8 → 16 — halves expected curves per band, reducing per-fragment ALU
- Shader skips `sqrt` / coverage solve for curves that don't cross the ray — ~30% skip rate on empty-space fragments
- Stroke shader compile cost halved: single Newton seed (t=0.5) + endpoints vs. prior 3-seed × 3-iteration spread
- Stroke quad expansion moved axis-aligned to vertex shader; fixes outer ring clipping at glyph bbox extents

## Fixes
- `SlugText._setFont` defers `visible=true` until after first `_rebuild` — prevents WebGPU "binding size is zero" on R3F's first render pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — suppresses `liga`/`rlig` token deletion that caused whitespace collapse at wrap points
- `parseFont` emits advance-only glyph entries for cmap'd no-outline glyphs (space, tab) — fixes advance drift vs. baked path
- Baked `measureText` uses bounds-area gate (`xMax > xMin`) instead of `curves.length > 0` — previously returned zero ink bounds for all baked glyphs
- Stroke outline vertex shader corrected: axis-aligned expansion before AA dilation pass
- `SlugStackText.dispose()` now tears down outline child meshes and `SlugStrokeMaterial` before disposing shared geometry — fixes GPU leak on scene toggle
- Kerning extractor filters to source glyph IDs only — prevents `this.font._push is not a function` when stroke glyph IDs are in the kern table range
- `SlugFontLoader.clearCache` and `BAKED_VERSION` version-check machinery removed

## BREAKING CHANGES

- **Baked font format v2 → v3**: `curveTexture` is now `RGBA16F`, `bandTexture` is `RG32F`, `MAX_CURVES_PER_BAND` is 40. All `.slug.bin` / `.slug.json` files must be re-generated with `slug-bake`.
- **Baked font format v3 → v4**: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`, subscript/superscript fields) added to `BakedJSON.metrics`. Re-bake required.
- **`SlugFontLoader.clearCache` removed** — the static cache is already keyed on URL; no replacement needed.
- **`slugDilate` `strokeHalfWidth` parameter removed** — fill callers are unaffected; stroke expansion is now handled axis-aligned in `SlugStrokeMaterial`'s vertex shader.

This release delivers the full Phase 1–5 text rendering stack: measurement, decorations, multi-font fallback, analytic stroke with runtime-uniform controls, and a build-time quadratic-Bézier stroke offsetter for baked stroke glyphs.

