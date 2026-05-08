---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**Core rendering**
- Initial `@three-flatland/slug` package: analytic GPU text rendering for WebGPU/TSL
- `SlugFont`, `SlugText`, `SlugGeometry`, `SlugMaterial` core types; instanced rendering via shared curve + band textures
- `slug-bake` CLI tool; `SlugFontLoader` with baked and runtime (opentype.js) paths
- Stem darkening and thickening options on `SlugMaterial` / `SlugText`
- Dynamic per-quad dilation for sub-pixel AA

**Performance**
- `curveTexture` → RGBA16F, `bandTexture` → RG32F: ~45% smaller baked files, ~20% less GPU bandwidth
- `MAX_CURVES_PER_BAND` 64 → 40; `bandCount` 8 → 16: ~halves average curves per band
- Shader skips winding-number solve for non-crossing curves (~30% fewer ALU ops on empty bands)

**Measurement API**
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` (mirrors `CanvasRenderingContext2D.measureText`)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- Runtime path uses pre-computed `SlugGlyphData.bounds` for O(1) per-call cost

**Decorations**
- `StyleSpan { start, end, underline?, strike? }` API for underline / strikethrough
- `pipeline/decorations.ts` post-pass; `SlugFont.emitDecorations()`
- `SlugGeometry.setGlyphs` accepts optional `DecorationRect[]`; rendered in same draw call via rect sentinel
- `SlugText` accepts `styles?: StyleSpan[]`

**Font stack / multi-font**
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `hasCharCode`
- `SlugStackText` extends `Group` — one `InstancedMesh` per font, single draw call per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` for line-sync with Canvas2D overlays
- `SlugFontStack.emitDecorations()` — decoration rendering across mixed-font runs
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity()`
- Fix: `SlugStackText.dispose()` now tears down outline meshes before fill meshes to avoid double-free

**Outline / stroke (Phase 4)**
- `distanceToQuadBezier` — analytic closest-point-on-quadratic (TSL + CPU reference)
- `slugStroke` fragment shader — bevel-via-min joins; hairlines widen to 1 px minimum
- `SlugStrokeMaterial` — stroke `NodeMaterial` with `color`, `opacity`, `strokeHalfWidth` uniforms
- `SlugText.outline: SlugOutlineOptions` — opt-in outline as child `InstancedMesh`; `renderOrder -1`
- `SlugText.setOpacity()`, `SlugText.setOutlineWidth()`, `SlugText.setOutlineColor()` — zero-rebuild uniform setters
- `SlugOutlineOptions` exported from package root
- Fix: axis-aligned quad expansion in vertex shader; stroke outer ring no longer clips at glyph extents
- Fix: shader compile cost halved (single Newton seed + 3 iterations vs 3 × 3)

**Stroke bake pipeline (Phase 5)**
- `buildGpuGlyph.ts` shared pipeline: `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`
- `strokeOffsetter` — adaptive-subdivision quadratic Bezier offsetter with miter/bevel/round joins and flat/square/round/triangle caps
- `bakeStrokeForGlyph(source, options)` — builds stroked `SlugGlyphData` from source contours
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets` optional field; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)`
- Stroke glyphs render through the existing fill shader at 1× cost, packed at `glyphIdOffset + sourceId`

**Pipeline fixes**
- `parseFont` emits advance-only entries (space, tab, zero-width controls) to match baked path
- Runtime shapers pass `{ features: [] }` to opentype.js — prevents ligature features from collapsing wrap-point whitespace
- `SlugText._setFont` defers `visible=true` until first `_rebuild` (prevents zero-size WebGPU bind error)
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check used by fallback routing
- `slug-bake` gained `--output / -o` for custom output base path

**BREAKING CHANGES**
- BAKED_VERSION 2 → 3: `curveTexture` and `bandTexture` format change; existing `.slug.bin/.json` must be re-baked
- BAKED_VERSION 3 → 4: decoration metrics added to `BakedJSON.metrics`; existing `.slug.bin/.json` must be re-baked
- `SlugFontLoader.clearCache()` removed (static cache is keyed on `url:runtime?`; explicit clear was redundant)
- `slugDilate` `strokeHalfWidth` parameter removed; axis-aligned expansion moved to `SlugStrokeMaterial` vertex shader

Phase 5 stroke-set bake is complete. Runtime async stroke fallback (Task 20) and SVG path support (Task 21) are pending.

