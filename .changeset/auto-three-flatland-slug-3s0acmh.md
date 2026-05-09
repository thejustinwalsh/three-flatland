---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Core rendering pipeline

- Initial `@three-flatland/slug` package: WebGPU-native analytic text rendering via TSL node materials
- Font parsing via opentype.js, text shaping, GPU curve/band texture packing
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — primary public classes
- Analytic per-fragment winding-number coverage; no MSAA needed

## Baked font format & CLI

- `slug-bake` CLI: pre-computes curve/band data into `.slug.{json,bin}` pairs for zero-runtime-parsing paths
- `--output / -o` for custom output path base
- `--stroke-widths / --stroke-join / --stroke-cap / --miter-limit` flags to embed stroke pseudo-glyphs at bake time
- `BakedJSON.strokeSets` metadata field for baked stroke configurations (absent when not configured; old fixtures load unchanged)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)`: look up a pre-baked stroke `SlugGlyphData`
- Baked format updated; existing `.slug.{json,bin}` files must be re-baked

## Performance

- Curve texture changed to RGBA16F, band texture to RG32F — ~45% smaller baked files, ~halved bandwidth
- `MAX_CURVES_PER_BAND` 64 → 40 (covers Inter corpus p999; reduces shader register pressure)
- `bandCount` 8 → 16 — halves expected curves per band
- Shader skips post-rootCode solve for non-crossing curves (~30% fewer ops in hot path)
- Stroke shader: single Newton seed (down from 3×3) — halves WGSL compile time; also improves per-fragment GPU cost

## Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned fields
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint font resolution matching `SlugStackText` line breaks
- Baked-path measure fixed to use bounds-area gate (previously returned zero ink bounds for every glyph)

## Font fallback stack

- `SlugFontStack(fonts)`: ordered fallback chain; first covering font per codepoint wins
- `SlugFont.hasCharCode(c)`: cheap codepoint coverage check
- `SlugStackText` extends `Group`: one `InstancedMesh` per font in the stack, one draw per contributing font

## Text decorations

- `StyleSpan { start, end, underline?, strike? }` API on `SlugText` and `SlugStackText`
- Underline/strikethrough rendered in the same draw call as glyphs (rect-sentinel instances)
- `SlugFont.emitDecorations()` / `SlugFontStack.emitDecorations()` helpers
- `SlugFontStack` decorations use primary font metrics for visual consistency across mixed-font runs

## Text outline (stroke)

- `SlugStrokeMaterial`: stroke `NodeMaterial` sharing glyph geometry with the fill mesh
- `SlugText.outline`: opt-in child mesh with `SlugStrokeMaterial` (renderOrder -1); `setOutlineWidth()` / `setOutlineColor()` for zero-rebuild runtime updates
- `SlugText.setOpacity(value)` for fill fade (enables outline-only mode)
- `SlugStackText.outline`: parity with `SlugText` — one stroke mesh per font, shared `instanceMatrix`
- `SlugStackText.setOpacity(value)`, `SlugStackText.styles` — full parity with `SlugText`
- `SlugOutlineOptions` exported from package root
- Fixed: stroke outer ring was clipped square at glyph extents — axis-aligned quad expansion now applied before AA dilation
- Fixed: `SlugStackText.dispose()` now tears down outline meshes before fill geometries to avoid double-free

## Stroke offsetter pipeline

- `strokeOffsetter(curves, closed, options)`: full quadratic Bézier stroke offsetter — adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round joins (miter falls back to bevel at `miterLimit`), flat/square/round/triangle caps
- `bakeStrokeForGlyph(source, options)`: converts fill `SlugGlyphData` to stroked `SlugGlyphData` (returns null for advance-only glyphs)
- Shared `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` pipeline (fontParser, strokeOffsetter, and future SVG path producer all share one implementation)

## Stem darkening

- `stemDarkening` and `stemThickening` options on `SlugMaterial` and `SlugText`

## Other

- `SlugText._setFont` deferred visibility: mesh stays hidden until first `_rebuild` writes real glyph data (prevents WebGPU "Binding size is zero" error on R3F pre-render)
- `parseFont` emits advance-only entries for cmap'd no-outline glyphs (space, tab); matches bake CLI behavior
- Runtime shapers pass `{ features: [] }` to opentype.js to prevent `liga`/`rlig` from collapsing whitespace at wrap points
- `slug-bake` kerning extraction now filters to source glyph IDs only (stroke ID ranges are out of opentype's knowledge)
- `SlugFontLoader.clearCache` removed (cache already keyed on url + runtime flag)
- Examples relocated: `examples/vanilla/slug-text` → `examples/three/slug-text`
- React + Three examples maintain 1:1 feature parity throughout

## BREAKING CHANGES

- Baked `.slug.{json,bin}` files from earlier builds must be re-run through `slug-bake`; baked format changed multiple times (texture layout, decoration metrics)
- `SlugFontLoader.clearCache` removed
- `slugDilate` no longer accepts `strokeHalfWidth` (expansion moved to `SlugStrokeMaterial` vertex shader)

`@three-flatland/slug` introduces a complete WebGPU analytic text rendering pipeline with font-stack fallback, decorations, outline, measurement APIs, and a quadratic Bézier stroke offsetter for baked stroke glyphs.

