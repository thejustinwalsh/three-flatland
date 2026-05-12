---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

**Measurement API**
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox*, fontBoundingBox*)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions; respects the same `lineHeight` default (1.2) as `SlugText`
- Both runtime and baked paths return correct ink bounds; fixes baked path silently returning zero bounds

**Text decorations**
- `StyleSpan { start, end, underline?, strike? }` API for underline and strikethrough spans
- `SlugText` accepts `styles?: StyleSpan[]` in constructor and as a runtime setter
- Decoration rects share the same draw call as glyphs; no extra GPU cost
- BAKED_VERSION bumped 3 → 4; re-bake required

**Stem darkening / thickening**
- `SlugMaterial` and `SlugText` accept stem darkening and thickening options for improved legibility at small sizes

**Text outline (Phase 4)**
- `SlugText.outline: SlugOutlineOptions` — opt-in stroke rendered as a sibling `InstancedMesh` sharing fill geometry
- `SlugText.setOutlineWidth(w)` and `setOutlineColor(c)` — runtime-uniform setters, zero rebuild
- `SlugText.setOpacity(v)` — fade fill independently for outline-only mode
- `SlugStrokeMaterial` exported from package root with TSL analytic distance-to-quadratic-Bezier stroke
- Fixed stroke quad expansion to axis-aligned (was clipping corners at glyph bbox edges)
- Reduced outline shader compile cost ~50% by reducing Newton seed count

**Font stack / fallback chain**
- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; first covering font wins
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check
- `SlugStackText` — `THREE.Group` with one `InstancedMesh` per font; one draw call per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint-resolved line breaks matching `SlugStackText` output
- `SlugStackText.styles`, `.outline`, `.setOpacity()` — full parity with `SlugText`
- `SlugFontStack.emitDecorations()` — builds decoration rects using primary font metrics across mixed-font runs

**Stroke bake pipeline (Phase 5)**
- `strokeOffsetter(curves, closed, options)` — complete quadratic-Bezier stroke offsetter: adaptive subdivision (Tiller-Hanson), miter/bevel/round join insertion, flat/square/round/triangle cap insertion, outer+inner contour stitching
- `bakeStrokeForGlyph(source, options)` — produces a stroke `SlugGlyphData` from any source glyph
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed at `glyphIdOffset + sourceId`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke glyph
- `BakedJSON.strokeSets` optional field; backwards-compatible (absent for legacy fixtures)

**Shared GPU pipeline**
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` module centralizes glyph-to-GPU conversion for font parser, stroke offsetter, and future SVG path support
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches to baked or runtime wrap path
- `slug-bake` gains `--output / -o` flag for custom output base paths

**Baked font format**
- `slug-bake` CLI tool to pre-bake font data for runtime use (no opentype.js at runtime)

## Performance

- Curve texture format `RGBA32F` → `RGBA16F`: ~45% smaller `.slug.bin` on disk (BAKED_VERSION 2 → 3)
- Band texture format `RGBA32F` → `RG32F`: 50% fewer bytes/texel
- `MAX_CURVES_PER_BAND` 64 → 40 (p999 of Inter's full glyph corpus is 25; max is 38)
- `bandCount` 8 → 16: halves mean curves-per-band, reduces per-fragment ALU
- Shader skips post-rootCode work for non-crossing curves (~30% of band curves)

## Bug Fixes

- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; fixes whitespace collapse at wrap points caused by `liga`/`rlig` ligature token deletion
- `parseFont` emits advance-only glyph entries for space/tab/zero-width codepoints; fixes advance-width drift in `shapeStackText`
- `SlugText._setFont` defers `visible = true` until first `_rebuild` with real glyph data; prevents empty-buffer WebGPU pipeline errors on first R3F render
- `SlugStackText.dispose()` now correctly tears down outline meshes before fill `InstancedMesh` children (prevents double-free and GPU leaks)
- `useWindowSize` tracks `{ w, h, dpr }` + subscribes to `(resolution: Ndppx)` media query; fixes compare overlay desync after monitor swap
- `fullscreenchange` event added alongside `resize` to catch post-transition layout settle
- Kerning extraction filters to source glyph IDs only; fixes `this.font._push is not a function` when stroke glyph IDs are present in baked font

## Breaking Changes

- BAKED_VERSION 2 → 3 (texture format change: RGBA16F curves, RG32F bands) — re-bake all `.slug.{json,bin}` files
- BAKED_VERSION 3 → 4 (decoration metrics added to `BakedJSON.metrics`) — re-bake all `.slug.{json,bin}` files
- `slugDilate` no longer accepts `strokeHalfWidth` parameter; moved to `SlugStrokeMaterial` vertex shader
- `SlugFontLoader.clearCache` removed (cache already keyed on `url:runtime?`)

Adds a complete analytic GPU text rendering pipeline with measurement, decorations, multi-font fallback stacks, runtime and baked stroke outlines, and a quadratic-Bezier stroke offsetter for bake-time stroke geometry.
