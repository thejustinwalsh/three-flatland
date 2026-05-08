---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Changelog

### Core rendering pipeline

- Initial WebGPU/TSL analytic text rendering: font parsing, text shaping, GPU texture packing via instanced quads
- Dynamic dilation for per-fragment anti-aliased quad rendering
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — foundational API

### Baked font support

- `slug-bake` CLI: pre-process TTF/OTF to `.slug.{json,bin}` paired format; auto-loaded by `SlugFontLoader`
- `--output / -o` flag for custom output base paths
- Versioned baked format (`BAKED_VERSION`); stale files rejected at load time with a clear error

### Performance

- `curveTexture` → `RGBA16F`, `bandTexture` → `RG32F`: ~50% reduction in GPU texture bandwidth
- `MAX_CURVES_PER_BAND` reduced 64→40 (covers 100% of Inter corpus with margin); bake-time warning when exceeded
- Band count 8→16: halves expected curves/band, reducing per-fragment ALU in the hot loop
- Shader skips `sqrt`/division/coverage work for curves that don't cross the fragment ray (~30% ALU savings on typical text)

### Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line metrics respecting the same wrap policy as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — wrap helper for Canvas2D overlays and DOM mirrors
- Runtime measure reads pre-computed `SlugGlyphData.bounds` (constant cost); baked measure gates ink via `xMax > xMin`

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` API threaded through `SlugText.styles`
- `SlugFont.emitDecorations()` + `pipeline/decorations.ts` post-pass emits one rect per styled run per line
- Decoration rects rendered as sentinel instances in the same draw call as glyphs (no extra pass)
- Font-declared metrics (`underlinePosition`, `strikethroughPosition`, etc.) exposed on `SlugFont` and baked into `BakedJSON.metrics`; `BAKED_VERSION` 3→4

### Stem darkening

- `darkening` and `thickening` options on `SlugMaterial` and `SlugText`; updates coverage calculations in the fragment shader

### Font stacks

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint()` / `resolveText()`
- `SlugFont.hasCharCode(c)` — cheap cmap coverage check
- `SlugStackText` (extends `Group`) — one `InstancedMesh` per font, one draw call per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — stack-aware line wrapping; Canvas2D compare overlay stays line-for-line with `SlugStackText` output
- `SlugFontStack.emitDecorations()` — decoration emission across mixed-font runs using primary-font metrics

### Outline rendering

- `SlugStrokeMaterial` — TSL `distanceToQuadBezier` shader (Newton refinement, bevel-via-min joins)
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; runtime-uniform width + color (zero rebuild)
- `SlugText.setOpacity()`, `setOutlineWidth()`, `setOutlineColor()` — uniform-only setters
- `SlugStackText` gains `styles`, `outline`, and `setOpacity` parity with `SlugText`
- `SlugOutlineOptions` exported from package root
- Fix: stroke quad expanded axis-aligned by `strokeHalfWidth` before AA dilation pass — eliminates diagonal clipping at glyph extents
- Fix: reduced Newton seeds from 3×3 to single seed + endpoints, halving shader compile time and per-fragment GPU cost

### Stroke pipeline (baked)

- Shared `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` pipeline (refactored out of `fontParser`)
- Quadratic-Bezier stroke offsetter (`pipeline/strokeOffsetter.ts`): adaptive subdivision, Tiller-Hanson per-segment offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, closed/open contour stitching
- `bakeStrokeForGlyph(source, options)` — offline stroke-contour builder used by CLI and future runtime worker
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed alongside fill glyphs in the same textures
- `BakedJSON.strokeSets` optional field; absent for fonts baked without stroke flags (backward-compatible)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — runtime lookup for pre-baked stroke glyphs
- Kerning extraction filters to source IDs only (prevents errors on stroke glyph ID ranges)

### Bug fixes

- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab); aligns runtime and baked advance resolution
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; prevents `liga`/`rlig` from collapsing whitespace tokens and drifting word-boundary checks
- `SlugText._setFont` defers `visible=true` until after first `_rebuild`; avoids zero-size buffer WebGPU validation error on R3F's pre-frame render pass
- `SlugFontStack.wrapText` / `SlugStackText.dispose()` correctly tears down outline meshes and fill materials on scene toggle
- Compare overlay `Off` mode hides canvas, split handle, and labels cleanly; `redrawCompare` short-circuits to avoid CPU work when hidden
- DPR re-sync on R3F canvas after monitor swap / fullscreen via `<DprSync>` component
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (no released format to migrate)

This release delivers the full `@three-flatland/slug` text rendering stack: analytic WebGPU glyph rendering, baked font pipelines, measurement APIs, text decorations, multi-font stacks, runtime outlines, and a complete quadratic-Bezier stroke offset system for baked strokes.

