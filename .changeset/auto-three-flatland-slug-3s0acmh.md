---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

**Text measurement**
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox*, fontBoundingBox*)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over wrapText + per-line measureText, respects the same lineHeight default (1.2) as SlugText
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break computation matching Slug's shaper output exactly
- `SlugFont.hasCharCode(c)` — codepoint coverage check for font fallback routing

**Text decoration**
- `StyleSpan { start, end, underline?, strike? }` — character-range decoration spans
- `SlugText.styles: StyleSpan[]` — runtime setter, underline and strikethrough rendered in the same draw call as fill

**Outline / stroke**
- `SlugText.outline: SlugOutlineOptions | null` — opt-in stroke outline sharing the fill mesh's instance data, with runtime `setOutlineWidth(v)` and `setOutlineColor(v)` (zero rebuild)
- `SlugText.setOpacity(value)` — fade fill without rebuilding geometry (enables outline-only mode)
- `SlugStrokeMaterial`, `SlugOutlineOptions` exported from package root

**Font stack (multi-font fallback)**
- `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint(c)` returns the first covering font index
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint font resolution with same wrap policy as `shapeStackText`, enables Canvas2D overlays to match line breaks exactly
- `SlugStackText` (extends `Group`) — multi-font renderable with one `InstancedMesh` per font; supports `.styles`, `.outline`, `.setOpacity()` at parity with `SlugText`

**slug-bake CLI**
- `--output / -o` flag for custom output path base
- `--stroke-widths / --stroke-join / --stroke-cap / --miter-limit` flags: pre-bakes stroke glyph sets into the same curve/band textures as fill glyphs; baked strokes render through the existing fill shader at no extra shader cost
- Bake-time warning emitted when any band exceeds `MAX_CURVES_PER_BAND`

## Performance

- GPU texture bandwidth reduced ~45%: curve texture switched to `RGBA16F`, band texture to `RG32F`; `MAX_CURVES_PER_BAND` lowered 64→40 (covers 100% of Inter's corpus with margin); `.slug.bin` shrinks ~45% on disk
- `bandCount` increased 8→16, halving expected curves per band (~50% less per-fragment ALU in the hot loop)
- Shader skips the full distance solve for curves whose ray root-code is zero (~30% of curves in a typical band)
- Stroke shader: reduced Newton seeds from 3 to 1 (+ 2 endpoint candidates), cutting WGSL size in half and halving pipeline compile time; per-fragment GPU cost drops ~⅔

## Bug Fixes

- Stroke outline clipped square at glyph extents: quad now expands axis-aligned by `strokeHalfWidth` before the AA dilation pass
- WebGPU "Binding size is zero" error on R3F first render: `SlugText` no longer flips `visible=true` until after the first `_rebuild` writes real glyph data
- Word-wrap drift at break points: runtime shapers now pass `{ features: [] }` to `stringToGlyphs`, preventing `liga`/`rlig` from collapsing tokens and misaligning `text[i]===' '` checks
- `SlugStackText.dispose()` now properly tears down outline meshes and stroke materials before disposing shared geometries
- Kerning extraction skips stroke-glyph IDs so the kern extractor no longer errors on pre-baked stroke ranges
- DPR desync on monitor swap or fullscreen transition fixed in examples (media-query + `fullscreenchange` listener, `<DprSync>` component for R3F)

## BREAKING CHANGES

- **BAKED_VERSION 2→3**: `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake` — texture format changed to RGBA16F/RG32F, MAX_CURVES_PER_BAND reduced to 40
- **BAKED_VERSION 3→4**: existing baked files must be re-baked to include font decoration metrics (underlinePosition, underlineThickness, strikethroughPosition, strikethroughThickness)
- `SlugFontLoader.clearCache` removed (the static cache is already keyed on `url:runtime?`)

Comprehensive release covering the full Slug text-rendering stack: measurement, decoration, multi-font fallback, analytic stroke outline with quadratic-Bezier offsetter and pre-bake pipeline, and significant GPU performance improvements (~45% smaller baked files, ~50% less per-fragment ALU).

