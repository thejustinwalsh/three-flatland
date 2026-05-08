---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement with Canvas2D-aligned field names
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line block measurement respecting `lineHeight` and `maxWidth`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output matching shaped text
- `SlugFont.hasCharCode(c)` — codepoint coverage check
- `StyleSpan` API on `SlugText` — underline and strikethrough decoration spans
- `SlugText.outline` / `setOutlineWidth` / `setOutlineColor` / `setOpacity` — opt-in outline rendering with runtime-uniform width and color
- `SlugFontStack` — ordered per-codepoint fallback font chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugStackText extends Group` — multi-font renderable; one `InstancedMesh` per contributing font
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity` — full parity with `SlugText`
- `SlugStrokeMaterial` and `SlugOutlineOptions` exported from package root
- `buildGpuGlyphData`, `buildGpuGlyphFromCurves`, `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline helpers
- `strokeOffsetter(curves, closed, options)` — complete quadratic-Bezier stroke offsetter: adaptive subdivision, per-segment offset, join insertion (miter/round/bevel), cap insertion (flat/square/round/triangle), contour stitching
- `bakeStrokeForGlyph(source, options)` — stroke glyph builder for CLI and runtime use
- Stem darkening and thickening options on `SlugMaterial` / `SlugText`

### CLI (`slug-bake`)

- `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags — bake stroke pseudo-glyphs alongside fill glyphs; no new shader variant at runtime
- `--output` / `-o` — custom output base path
- Warning emitted when any band exceeds `MAX_CURVES_PER_BAND` shader bound

### Performance

- Curve texture → RGBA16F (half bandwidth); band texture → RG32F (eliminates unused channels)
- `MAX_CURVES_PER_BAND` 64 → 40 (covers Inter corpus p999; reduces register pressure)
- Band count 8 → 16 (halves mean curves per band; ~45% smaller baked assets)
- Shader skips post-rootCode solve for non-crossing curves (~30% ALU reduction)
- Stroke shader reduced to single Newton seed + 3 iterations (halves pipeline compile time; improves GPU runtime)

### Bug fixes

- Outline quad clipping fixed — axis-aligned expansion instead of diagonal normal expansion
- `SlugText._setFont` no longer pre-sets `visible=true` before first `_rebuild` (fixes blank WebGPU canvas under R3F)
- `SlugStackText.dispose()` properly tears down outline child meshes and fill `InstancedMesh` instances
- Runtime shapers pass `{ features: [] }` to opentype.js — fixes whitespace collapse at wrap points caused by ligature substitution
- `parseFont` emits advance-only entries for no-outline cmap'd glyphs (space, tab, zero-width controls)
- `SlugFontLoader.BAKED_VERSION` machinery removed (pre-release; no migration path needed)
- Kerning extraction filters to source glyph IDs only — fixes `_push is not a function` when resolving stroke glyph IDs

### Baked format changes

- `BAKED_VERSION` 2 → 3: RGBA16F curve texture + RG32F band texture — **re-bake required**
- `BAKED_VERSION` 3 → 4: decoration metrics added to `BakedJSON.metrics` — **re-bake required**
- `BakedJSON.strokeSets?` field added (optional; omitted when baked without stroke flags)

Introduces the full `@three-flatland/slug` WebGPU text rendering library: analytic SDF-free glyph rendering via TSL, baked font support (`slug-bake` CLI), measurement APIs, underline/strike decorations, font-stack fallback chains, outline/stroke rendering, and a complete quadratic-Bezier stroke offsetter pipeline for baked strokes. Includes significant GPU performance work (half texture bandwidth, reduced shader ALU) and several robustness bug fixes.
