---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

**Text rendering pipeline**
- Full Slug GPU text rendering pipeline: font parsing, text shaping, and curve+band texture packing via `SlugFont`, `SlugGeometry`, `SlugMaterial`, and `SlugText`
- `slug-bake` CLI tool for pre-baking font data into `.slug.{json,bin}` pairs; both paths share the same runtime API via loader injection
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — line-break-consistent wrapping dispatching to baked or runtime path
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` (CanvasRenderingContext2D-compatible fields)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`

**Text decorations**
- `StyleSpan { start, end, underline?, strike? }` API for underline and strikethrough spans
- `SlugFont.emitDecorations` / `pipeline/decorations.ts` pipeline post-pass; decoration rects share the same draw call as glyphs via a sentinel instance

**Font stack / multi-font**
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `SlugFont.hasCharCode`
- `SlugStackText` — multi-font `Group` with one `InstancedMesh` per contributing font
- `SlugFontStack.wrapText` — stack-aware line breaking consistent with `SlugStackText` output; backed by `pipeline/wrapLinesStack.ts`
- `SlugFontStack.emitDecorations()` for underline/strike across mixed-font runs
- `SlugStackText.styles`, `.outline`, `.setOpacity(value)` — full parity with `SlugText`

**Stroke / outline**
- `SlugStrokeMaterial` — stroke-capable `NodeMaterial` sharing glyph geometry with fills; `distanceToQuadBezier` TSL shader for analytic coverage
- `SlugText.outline: SlugOutlineOptions` — opt-in child `InstancedMesh` drawn behind fills; `setOutlineWidth` / `setOutlineColor` runtime-uniform setters with zero rebuild
- `SlugStackText.outline` — per-font stroke meshes for stack text with the same API surface
- `SlugOutlineOptions` exported from package root
- Phase 5 stroke offsetter: `strokeOffsetter` — adaptive quadratic subdivision, per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, full closed + open contour stitching
- `bakeStrokeForGlyph(source, options)` — bridges offsetter output to GPU-ready `SlugGlyphData`
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked format gains optional `BakedJSON.strokeSets`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` for baked stroke lookup

**Shared pipeline**
- `buildGpuGlyph.ts` — shared contour-to-GPU module (`buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`) used by font parser, stroke offsetter, and future SVG path producer

**CLI additions**
- `slug-bake --output / -o` for custom output base paths

## Performance

- Curve texture format changed to `RGBA16F` and band texture to `RG32F`; baked file size reduced ~45% and GPU bandwidth reduced ~20%
- Band count increased 8 → 16; expected curves per band roughly halved
- Shader wraps post-rootCode work in `If(rootCode > 0)` to skip non-crossing curves (~30% of band entries)
- Stroke shader Newton seeds reduced to a single seed + 2 endpoints: ~50% less generated WGSL, directly halving pipeline compile time and improving per-fragment runtime cost
- `slugDilate` stroke expansion moved to axis-aligned vertex shader pre-pass, fixing stroke outer-ring clipping and removing unnecessary work from fill-only paths

## Bug fixes

- Stroke quad outer ring no longer clipped at glyph bbox extents
- Opentype.js `liga`/`rlig` features disabled in runtime shapers to prevent whitespace collapse at word-wrap points
- `SlugText._setFont` defers `visible = true` until after first `_rebuild` to prevent blank WebGPU canvas on R3F's pre-frame render
- Baked `measureText` ink bounds now use `xMax > xMin` area check instead of `curves.length > 0` (curves are discarded at runtime after unpacking)
- Kerning extraction filters to source glyph IDs only; stroke glyph ID ranges no longer cause `_push is not a function` errors
- `SlugStackText.dispose()` now tears down outline meshes and fill materials in correct order (outlines before geometries to avoid double-free)
- Compare mode `Off` option added; hides compare canvas, split handle, and labels without CPU draw cost
- `DprSync` component added to R3F example; `gl.setPixelRatio` updated on monitor swap, OS zoom, and fullscreen transitions
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (no released version to migrate)

## BREAKING CHANGES

- `BAKED_VERSION` bumped from 2 → 3 (texture format changes) and 3 → 4 (decoration metrics in `BakedJSON.metrics`). All existing `.slug.bin` / `.slug.json` files must be re-baked with the current `slug-bake` CLI.
- `slugDilate`'s `strokeHalfWidth` parameter removed; stroke expansion is now handled in `SlugStrokeMaterial`'s vertex shader.

`@three-flatland/slug` introduces a complete analytic GPU text rendering library with font stacks, text decorations, measurement APIs, and a stroke/outline system backed by a quadratic-Bézier offsetter; baked font files must be regenerated due to texture format and metrics schema changes.

