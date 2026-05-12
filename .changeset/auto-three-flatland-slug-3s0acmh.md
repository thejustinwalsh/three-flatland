---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

- Initial `@three-flatland/slug` package: analytic GPU text rendering pipeline with font parsing, text shaping, and WebGPU texture packing via TSL node materials
- `SlugFont`, `SlugText`, `SlugGeometry`, `SlugMaterial` — core rendering objects; `SlugText` accepts `text`, `font`, `fontSize`, `align`, `maxWidth`, `lineHeight`
- `slug-bake` CLI: pre-bakes TTF/OTF fonts into `.slug.{json,bin}` pairs for zero-opentype-runtime loading; flags for `--output`, `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — word-wrap matching the shaper's break policy for Canvas2D/DOM mirrors
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` (CanvasRenderingContext2D-aligned fields); `measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` for multi-line blocks
- `StyleSpan` API with `underline` and `strike` — decoration rects appended to the same draw call via a sentinel instance; `SlugText` accepts `styles?: StyleSpan[]`
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugStackText` — multi-font `Group` with one `InstancedMesh` per contributing font; supports `styles`, `outline`, `setOpacity`, `dispose`
- `SlugFont.hasCharCode(c)` — cheap codepoint-coverage check via cmap
- `SlugText.outline` / `setOutlineWidth` / `setOutlineColor` / `setOpacity` — opt-in stroke rendered as a child `InstancedMesh` sharing the fill geometry; runtime-uniform updates with zero rebuild
- `SlugStrokeMaterial` — TSL stroke material using analytic distance-to-quadratic-Bezier; exported from package root with `SlugOutlineOptions`
- Stroke offsetter pipeline: adaptive subdivision (`subdivideForOffset`), per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/round/triangle cap insertion, contour stitching — produces closed contours consumable by the fill pipeline
- `bakeStrokeForGlyph(source, options)` — bridges the offsetter to the bake CLI and future runtime async fallback
- Stroke-set bake: `BakedJSON.strokeSets` field; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` returns pre-baked stroke `SlugGlyphData`
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`
- Performance: curve texture → RGBA16F (half bandwidth), band texture → RG32F, `bandCount` 8 → 16 (halves curves per band), `MAX_CURVES_PER_BAND` 64 → 40; shader skips non-crossing curves; stroke fragment shader Newton seeds reduced to halve WGSL compile time
- Stroke quad expansion fixed to axis-aligned per-axis growth; stroke outlines no longer clip at glyph bbox corners
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` shared pipeline module (used by fontParser, strokeOffsetter, and future SVG path producer)
- `parseFont` emits advance-only entries for space/tab/zero-width codepoints; runtime shapers pass `{ features: [] }` to suppress `liga`/`rlig` token deletion
- `SlugText._setFont` defers `visible=true` until first `_rebuild` to prevent zero-binding WebGPU pipeline errors in R3F
- `SlugFontStack.wrapText` — per-codepoint wrap matching `shapeStackText` for external renderers
- `SlugFontLoader` BAKED_VERSION machinery removed (pre-release cleanup)
- Compare mode gains `'off'` option hiding overlay entirely; `DprSync` component keeps R3F canvas DPR in sync across monitor-swap and fullscreen transitions; `SlugStackText.dispose` now cleans up outline meshes and fill instances

BREAKING CHANGES

- `BAKED_VERSION` bumped 2 → 3 (RGBA16F/RG32F texture formats) and 3 → 4 (decoration metrics in `BakedJSON.metrics`): existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`
- `slugDilate`'s `strokeHalfWidth` parameter removed; stroke-quad expansion now handled axis-aligned in `SlugStrokeMaterial` vertex shader
- `SlugFontLoader.clearCache` removed

This release ships the full slug text rendering package — analytic GPU fill coverage, baked font pipeline, font measurement, text decorations, multi-font stacks, and a complete quadratic-Bezier stroke offsetter with bake-time stroke-set support.

