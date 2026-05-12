---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New APIs

- `SlugText` — instanced GPU text renderer using TSL/WebGPU analytic coverage; analytic per-fragment AA eliminates MSAA overhead
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — aligned with `CanvasRenderingContext2D.measureText`; constant cost via pre-computed glyph bounds
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line measurement respecting the same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line wrapping consistent with `SlugText` shaped output
- `SlugFont.hasCharCode(codepoint)` — cheap codepoint coverage check via cmap
- `StyleSpan` API + `SlugText.styles` — underline and strikethrough decoration spans rendered in the same draw call as glyphs
- `SlugFontStack` — ordered per-codepoint font fallback chain; `resolveCodepoint` walks the chain, first covering font wins
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — stack-aware line wrapping for external renderers (Canvas2D, DOM) matching `SlugStackText` output
- `SlugStackText` (extends `Group`) — multi-font renderable with one `InstancedMesh` per font; one draw per contributing font
- `SlugStackText.styles`, `.outline`, `.setOpacity()` — feature parity with `SlugText`
- `SlugText.outline` / `setOutlineWidth()` / `setOutlineColor()` — analytic stroke outline; runtime-uniform width and color, zero rebuild
- `SlugText.setOpacity(value)` — fill opacity control for outline-only rendering mode
- `SlugStrokeMaterial` and its options type exported from package root
- `SlugOutlineOptions` exported from package root
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared pipeline helpers used by font parser, stroke offsetter, and future SVG path producer
- `bakeStrokeForGlyph(source, options)` — pre-bake a stroked pseudo-glyph from a source outline
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up a pre-baked stroke glyph from a loaded font

### CLI (`slug-bake`)

- `--output` / `-o` — custom output base path
- `--stroke-widths` / `--stroke-join` / `--stroke-cap` / `--miter-limit` — bake stroke sets into the output font; each `(width, join, cap, miterLimit)` tuple produces stroke pseudo-glyphs packed alongside fill glyphs

### Baked format

- `BakedJSON.strokeSets` — optional stroke metadata array; absent for fonts baked without stroke flags
- `BakedJSON.metrics` — font decoration metrics (underline/strikethrough position and thickness from OpenType `post`/`os2` tables)
- Baked format version at release: v4 (progression within this release: v1 → v2 → v3 RGBA16F/RG32F textures → v4 decoration metrics)

### Performance

- Curve texture changed to RGBA16F (8 bytes/texel vs 16); band texture to RG32F; `.slug.bin` ~45% smaller on disk
- `MAX_CURVES_PER_BAND` 64 → 40; `bandCount` 8 → 16, halving mean curves per band and per-fragment ALU
- Shader wraps the ray-solve and coverage work in an early-exit branch; ~30% of band curves skip sqrt/divisions
- Stroke shader compile time halved: single Newton seed (t=0.5) plus endpoints instead of three seeds; also reduces per-fragment GPU cost

### Bug fixes

- Stroke quad clipping: expansion now axis-aligned per vertex instead of along the diagonal unit normal; outer stroke ring no longer squared off at glyph extents
- Runtime shapers pass `{features:[]}` to `stringToGlyphs`; prevents `liga`/`rlig` from collapsing whitespace tokens and drifting word-boundary detection
- `SlugText._setFont` defers `visible=true` until first `_rebuild`; eliminates blank-canvas WebGPU pipeline error on the first R3F render pass
- Advance-only glyphs (space, tab, zero-width controls) now emit real advance width in both runtime and baked paths
- `SlugStackText.dispose()` tears down outline meshes and stroke materials before disposing shared geometries; prevents GPU leaks on repeated scene toggles
- Kerning extraction now filters to source glyph IDs; prevents `this.font._push is not a function` crash when stroke glyph IDs fall outside opentype's known range
- `SlugFontLoader.clearCache` removed (cache already keyed on `url:runtime?`)

Initial release of `@three-flatland/slug` — a WebGPU/TSL analytic text renderer covering font parsing, baked offline preprocessing, measurement, multi-font stacking, decorations, and analytic stroke outlines.

