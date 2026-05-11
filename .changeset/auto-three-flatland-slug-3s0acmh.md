---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Measurement

- `SlugFont.measureText(text, fontSize)` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actual/font bounding box ascent/descent)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience wrapper; respects the same 1.2× lineHeight default as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — line-break helper dispatching to baked or runtime path; used by examples so Canvas2D compare stays line-for-line with Slug output
- Baked measure uses bounds-area gate (`xMax > xMin`) to correctly report ink bounds (prior `curves.length > 0` heuristic returned zero bounds on the baked path)

## Text Decorations

- `StyleSpan { start, end, underline?, strike? }` — character-range decoration spans
- `SlugText` accepts `styles?: StyleSpan[]` at construction and as a runtime setter
- `emitDecorations` pipeline produces one decoration rect per (line, kind, contiguous run); rendered in the same draw call via a rect-sentinel in `SlugGeometry`
- `SlugFont.emitDecorations()` thin wrapper using the font's own metrics
- Font-declared metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) exposed on `SlugFont` and serialized into baked JSON

## Font Stacking

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; first covering font wins, falls back to primary notdef for unresolvable codepoints
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check (cmap lookup)
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — wraps mixed-font content line-for-line with `SlugStackText` output
- `SlugStackText extends Group` — multi-font renderable; one `InstancedMesh` per font in the stack; one draw call per contributing font
- `SlugStackText.styles` — underline/strikethrough parity with `SlugText`
- `SlugStackText.outline` — per-font stroke meshes sharing fill mesh instance matrices; `setOutlineWidth()` / `setOutlineColor()` runtime-uniform setters
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugStackText.dispose()` — full cleanup including outline meshes and `SlugStrokeMaterials`

## Outline / Stroke Rendering

- `SlugStrokeMaterial` — analytic stroke via `distanceToQuadBezier` TSL shader; same instance-attribute layout as `SlugMaterial`; exported from package root alongside `SlugStrokeMaterialOptions`
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry, rendered at `renderOrder = -1`; `setOutlineWidth()` / `setOutlineColor()` zero-rebuild runtime setters
- `SlugText.setOpacity(value)` — fade fill independently of outline
- `SlugOutlineOptions` type exported from package root
- Fixed stroke quad axis-aligned expansion: outline no longer clips square at glyph extents (was expanding along diagonal normal instead of per-axis)
- Halved WGSL shader size: single Newton seed at t=0.5 + endpoints — ~50% reduction in pipeline compile time, eliminates first-toggle hitch

## Stroke Geometry (Phase 5 foundation)

- `strokeOffsetter(curves, closed, options)` — quadratic-Bezier stroke offsetter: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, full outer+inner contour stitching
- `bakeStrokeForGlyph(source, options)` — converts a source `SlugGlyphData` to a stroked pseudo-glyph via `strokeOffsetter` + `buildGpuGlyphData`; returns `null` for advance-only glyphs
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroked glyphs are packed alongside source glyphs with `glyphIdOffset`-shifted IDs
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke `SlugGlyphData` from the `strokeSets` metadata
- `BakedJSON.strokeSets?` optional field (absent for fonts baked without stroke flags; backwards-compatible with old fixtures)
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline factored out of `fontParser` for reuse by offsetter and future SVG path support

## CLI

- `slug-bake --output / -o` — custom output path base
- `slug-bake` emits a warning when any band fill exceeds `MAX_CURVES_PER_BAND`

## Performance

- `bandCount` 8 → 16: ~50% fewer curves per band, proportional reduction in fragment ALU
- `curveTexture` → `RGBA16F` (8 bytes/texel vs 16); `bandTexture` → `RG32F` (8 bytes/texel vs 16) — ~50% GPU bandwidth reduction
- `MAX_CURVES_PER_BAND` 64 → 40: covers 100% of Inter's glyph corpus with a safety margin; reduces shader register pressure
- Shader skips sqrt/divisions for curves with no ray crossing — ~30% fragment work saved on empty-space bands

## Bug Fixes

- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild`; prevents blank WebGPU canvas on R3F initial render when prop-set precedes first `useFrame`
- Runtime shapers pass `{ features: [] }` to `opentype.js` `stringToGlyphs` — prevents `liga`/`rlig` from shortening the glyph array and causing whitespace collapse at wrap points
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab, zero-width controls) — matches bake CLI behavior; fixes advance resolution for those glyphs on the runtime path
- Kerning extraction filters to source glyph IDs only — prevents `this.font._push is not a function` when stroke glyph IDs (outside opentype's range) were passed to the kern extractor

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: `curveTexture` format changed to `RGBA16F`, `bandTexture` to `RG32F`, `MAX_CURVES_PER_BAND` lowered to 40. All `.slug.bin`/`.slug.json` files must be re-generated with `slug-bake`.
- **BAKED_VERSION 3 → 4**: Font decoration metrics added to `BakedJSON.metrics`. All `.slug.bin`/`.slug.json` files must be re-generated.
- **`SlugFontLoader.clearCache` removed** — the static cache is already keyed on `url:runtime?`; explicit clearing is not needed.
- **`BAKED_VERSION` version-gate machinery removed** from `SlugFontLoader` — no migration story exists for a pre-release package; re-bake using the current CLI.

This release ships the complete `@three-flatland/slug` text rendering package: analytic GPU-accelerated font rendering over WebGPU/TSL with measurement, decorations, multi-font stacking, runtime outlines, and a quadratic-Bezier stroke-offsetting pipeline for baked stroke geometry.

