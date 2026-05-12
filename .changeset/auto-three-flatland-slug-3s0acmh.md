---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`; dispatches to baked or runtime path
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience wrapping `wrapText` + per-line measurement
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output matching the shaped render output for Canvas2D overlays
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check via cmap
- `SlugFontStack(fonts)` — per-codepoint glyph fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations` methods
- `SlugStackText` — multi-font renderable (`Group` subclass) with one `InstancedMesh` per font; supports styles, outline, and opacity parity with `SlugText`
- `SlugText.outline` / `SlugOutlineOptions` — opt-in outline mesh sharing fill geometry; `setOutlineWidth` / `setOutlineColor` update live with no rebuild
- `SlugText.setOpacity(value)` — runtime fill opacity (enables outline-only rendering)
- `SlugText.styles: StyleSpan[]` — underline / strikethrough spans via `{ start, end, underline?, strike? }`
- `SlugOutlineOptions` exported from package root
- `StyleSpan` / `TextMetrics` / `ParagraphMetrics` types exported from package root
- `bakeStrokeForGlyph(source, options)` — bridges stroke offsetter output into the GPU glyph pipeline
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up pre-baked stroke glyph by style parameters
- Quadratic Bezier stroke offsetter (`strokeOffsetter`): adaptive subdivision, per-segment Tiller-Hanson offset, join insertion (miter/bevel/round with miterLimit fallback), cap insertion (flat/square/triangle/round), closed/open contour stitching
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared pipeline factories used by font parser, stroke offsetter, and future SVG shape path

## CLI

- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked output includes `strokeSets` metadata in `BakedJSON`
- `slug-bake` gains `--output` / `-o` flag for custom output base path

## Performance

- curveTexture switched to `RGBA16F`, bandTexture to `RG32F` — ~45% smaller `.slug.bin` files, ~20% lower GPU bandwidth
- `bandCount` increased 8 → 16: expected curves/band roughly halved, less per-fragment ALU in the fill shader
- Shader skips post-rootCode solve and coverage work for non-crossing curves (~30% of band entries)
- Stroke shader: single Newton seed replaces triple-seed spread, cutting WGSL size ~50% and pipeline compile time proportionally; per-fragment GPU cost drops ~⅔
- Stroke quad now expands axis-aligned in the vertex shader before pixel-AA dilation, fixing outer-ring clipping at glyph bbox extents
- Outline rebuild skipped on font swap when outline is not already enabled

## Bug fixes

- Whitespace collapse at wrap points: opentype.js `liga`/`rlig` features now disabled in runtime shapers so token counts match `text.length`
- `SlugText._setFont` no longer sets `visible=true` before the first `_rebuild`; eliminates WebGPU "binding size is zero" errors on R3F's first render pass
- Runtime advance-only glyphs (space, tab) now emit correct `advanceWidth` entries matching the baked path
- Baked `measureText` uses `bounds-area` heuristic (`xMax > xMin`) rather than `curves.length > 0` — fixes zero ink bounds on the baked measurement path
- Kerning extraction filters to source glyph IDs only; prevents `_push is not a function` crash when stroke glyph ID ranges are present
- `SlugStackText.dispose` now tears down outline meshes before fill geometries, then clears fill `InstancedMesh` list — fixes GPU leaks on repeated scene toggles
- DPR re-sync on R3F canvas after monitor swap or fullscreen exit via internal `DprSync` component; compare overlay no longer sub-pixel drifts
- `createPane` z-index applied to `.tp-dfwv` wrapper (the actual stacking context) instead of the inner pane element

## BREAKING CHANGES

- `BAKED_VERSION` bumped 2 → 3 (curveTexture / bandTexture format change) — existing `.slug.bin/.json` files must be re-baked with `slug-bake`
- `BAKED_VERSION` bumped 3 → 4 (decoration metrics: `underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness` added to `BakedJSON.metrics`) — re-bake required
- `SlugFontLoader.clearCache` removed (cache already keyed on `url:runtime?`, deduplication is automatic)
- `slugDilate`'s `strokeHalfWidth` parameter removed; axis-aligned expansion moved into `SlugStrokeMaterial`'s vertex shader
- `MAX_CURVES_PER_BAND` reduced 64 → 40; fonts with extreme glyph density may need re-tuning

`@three-flatland/slug` is a new package reaching its initial minor release. This changeset covers the full WebGPU/TSL text rendering pipeline — analytic fill, styled decorations, multi-font stacks, measurement APIs, runtime and baked stroke outlines — built on Three.js `NodeMaterial` (TSL) with no WebGL or GLSL.

