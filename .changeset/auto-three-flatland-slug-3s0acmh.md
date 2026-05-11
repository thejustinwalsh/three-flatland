---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line ink/font-envelope metrics, CanvasRenderingContext2D-aligned field names
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions respecting same lineHeight default as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break array matching `SlugText` shaped output exactly
- `SlugFont.hasCharCode(c)` — codepoint coverage check (cmap-backed, works on baked and runtime fonts)
- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; first font covering a codepoint wins
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — stack-aware wrap, line-for-line consistent with `SlugStackText` output
- `SlugFontStack.emitDecorations()` — builds decoration rects using primary font metrics, even when individual chars render from fallback fonts
- `SlugStackText` (extends `Group`) — multi-font renderable; one `InstancedMesh` per contributing font
- `SlugStackText.styles: StyleSpan[]` — underline/strike span support, parity with `SlugText`
- `SlugStackText.outline: SlugOutlineOptions` — per-font stroke meshes sharing fill `instanceMatrix`; `setOutlineWidth` / `setOutlineColor` are uniform-only, zero rebuild
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugStackText.dispose()` — full GPU cleanup: outlines, fill meshes, geometries, materials
- `SlugText.setOpacity(value)` — fade fill without rebuilding geometry
- `SlugText.outline` setter accepts `SlugOutlineOptions | null`; `setOutlineWidth` / `setOutlineColor` are runtime-uniform
- `SlugOutlineOptions.color` accepts `number | string | Color`
- `StyleSpan { start, end, underline?, strike? }` — text decoration API; underline/strike rendered in same draw call as glyphs via rect-sentinel instances
- `SlugStrokeMaterial` exported from package root
- `buildGpuGlyphFromCurves` / `buildGpuGlyphData` / `buildAdvanceOnlyGlyph` — shared pipeline builders for all glyph producers (fontParser, stroke offsetter, future SVG paths)
- `bakeStrokeForGlyph(source, options)` — converts a filled glyph's contours to a stroked glyph via the stroke offsetter; returns `null` for advance-only glyphs
- `getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` on `SlugFont` — looks up a pre-baked stroke glyph from `strokeSets` metadata

## CLI (`slug-bake`)

- `--output` / `-o` — custom output path base
- `--stroke-widths` / `--stroke-join` / `--stroke-cap` / `--miter-limit` — bake stroke pseudo-glyphs into the same curve/band textures at ID offset `glyphIdOffset + sourceId`; stored in `BakedJSON.strokeSets`

## Performance

- `curveTexture` format: `RGBA32F` → `RGBA16F` (half bandwidth; em-space coords within half-float precision for all real text sizes)
- `bandTexture` format: `RGBA32F` → `RG32F` (eliminates two wasted channels)
- `MAX_CURVES_PER_BAND` 64 → 40 (covers 100% of Inter corpus; reduces shader register pressure)
- `bandCount` 8 → 16 (halves expected curves per band; linear ALU cost reduction in fragment hot loop)
- Shader: skip post-rootCode solve for non-crossing curves (~30% of curves per band)
- Stroke shader: single Newton seed (t=0.5) + endpoints — halves WGSL size, cuts pipeline compile time and per-fragment cost ~⅔ vs the prior 3-seed implementation

## Bug Fixes

- Stroke outline clipped square at glyph extents: axis-aligned quad expansion now applies before AA dilation, growing each axis by full `strokeHalfWidth`
- Stroke shader compile hitch on first outline-enable: reduced TSL op count from ~19K to ~9K per fragment
- `SlugText._setFont` no longer flips `visible=true` before first `_rebuild`; prevents WebGPU "binding size is zero" rejection on R3F's first render pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; suppresses opentype.js `liga`/`rlig` that shortened arrays and caused whitespace collapse at wrap points
- Kerning extractor now filters to source glyph IDs only; stroke IDs in offset ranges no longer trigger `_push is not a function`
- Baked `measureText` uses bounds-area gate (`xMax > xMin`) instead of `curves.length > 0`; fixes zero ink bounds on the baked path
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls)

## Breaking Changes

- `BAKED_VERSION` bumped 2→3 (texture format changes) then 3→4 (decoration metrics); existing `.slug.bin`/`.slug.json` must be re-baked with `slug-bake`
- `SlugFontLoader.clearCache` removed (cache is already keyed on `url:runtime?`; no migration needed)
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (package is pre-release; no migration story)
- `slugDilate`'s `strokeHalfWidth` parameter removed from fill-only callers; fill path is byte-for-byte identical to pre-Phase-4 behavior

## Examples

- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`; renamed package to `example-three-slug-text`
- Both Three and React examples migrated from Web Awesome to `@three-flatland/tweakpane`
- Icon demo: `[Lorem | Icons]` radio toggle; Icons mode loads FA-Solid (baked 12-icon PUA subset) via `SlugStackText`
- Canvas2D compare overlay: Onion / Diff / Split / Off modes; line breaks use `font.wrapText` / `stack.wrapText` for exact parity with Slug output
- Measurement overlay: hover any line for cyan ink + dashed yellow font-envelope overlays; paragraph monitors live-update
- Outline controls: Fill / Outline / Both radio + width slider + color picker; all zero-rebuild runtime uniforms
- Renderer `antialias: false`; Slug analytic coverage makes MSAA 4× sample cost for zero visual gain

