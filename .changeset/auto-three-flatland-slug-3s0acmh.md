---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`; dispatches to baked or runtime path
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line measurement respecting `SlugText` line-height defaults
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break for external renderers, dispatches to baked or runtime path
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check via font cmap
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — multi-font-aware line breaking matching `SlugStackText` output exactly
- `SlugStackText` — `Group` subclass rendering stacked fonts with one `InstancedMesh` per contributing font
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity()` — full parity with `SlugText`
- `SlugText.outline` / `setOutlineWidth()` / `setOutlineColor()` / `setOpacity()` — runtime opt-in outline; fill-only, stroke-only, or both modes
- `StyleSpan { start, end, underline?, strike? }` — underline / strikethrough decoration ranges; exposed via `SlugText.styles`
- `SlugOutlineOptions`, `SlugStrokeMaterial` exported from package root

## CLI

- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake stroke pseudo-glyphs into `.slug.{json,bin}`; strokes render through the existing fill shader at no extra runtime shader cost
- `slug-bake --output / -o` — custom output base path
- Bake-time warning when band fill exceeds `MAX_CURVES_PER_BAND`

## Performance

- Curve texture changed to RGBA16F, band texture to RG32F — ~45% smaller `.slug.bin` files and ~20% lower GPU bandwidth
- `MAX_CURVES_PER_BAND` 64 → 40; `bandCount` 8 → 16 — halves expected curves per band fragment
- Shader skips post-solve coverage work for curves that don't cross the fragment ray (~30% fewer ALU ops in empty-space regions)
- Stroke shader compile cost halved — single Newton seed + endpoints instead of three seeds, cutting WGSL size and per-fragment cost
- Stroke quad expansion fixed: axis-aligned dilation replaces diagonal-normal expansion, eliminating clipped outer corners

## Bug Fixes

- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild` — prevents blank WebGPU frame on initial R3F render
- Runtime shapers pass `{ features: [] }` to opentype.js — prevents `liga`/`rlig` collapsing whitespace at wrap points
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab) — aligns runtime path with baked path
- `SlugStackText.dispose()` now cleans up outline child meshes and `SlugStrokeMaterial` refs — eliminates GPU leaks on scene toggles
- Kerning extraction filtered to source glyph IDs — stroke glyph ID ranges no longer cause `_push is not a function`

## BREAKING CHANGES

- `BAKED_VERSION` bumped 2 → 3 (texture format change) and 3 → 4 (decoration metrics added); existing `.slug.bin/.json` files must be re-baked with `slug-bake`
- `SlugFontLoader.clearCache` removed — the static cache is keyed per URL; no migration needed

## Internal

- Quadratic Bezier stroke offsetter: adaptive subdivision (Task 16.1), per-segment Tiller-Hanson offset (16.2), bevel/miter/round join insertion (16.3), flat/square/triangle/round cap insertion (16.4), full closed/open contour stitching (16.5–16.6)
- `bakeStrokeForGlyph(source, options)` — bridges offsetter output to CLI bake pass and future runtime async fallback
- Shared `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` extracted from `fontParser` for reuse by stroke and SVG producers
- `wrapLinesStack.ts` — multi-font aware line wrapper; `wrapLinesBaked.ts` — baked-path line wrapper

Adds analytic outlined text, multi-font stacking with per-codepoint fallback, underline/strikethrough decorations, and text measurement APIs. Baked font format updated — re-bake required for existing `.slug.bin/.json` files.

