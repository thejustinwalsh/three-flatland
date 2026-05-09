---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

### Core rendering pipeline
- Initial GPU text rendering pipeline: font parsing, text shaping, band/texture packing, TSL shaders
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — primary rendering classes
- `slugDilate` shader with dynamic per-instance quad dilation for pixel-accurate AA
- `slug-bake` CLI for pre-baking font data to `.slug.{json,bin}` pairs
- BAKED_VERSION versioning; baked and runtime paths share the same public API

### Measurement API (Phase 1)
- `SlugFont.measureText(text, fontSize) → TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? }) → ParagraphMetrics` — multi-line block metrics
- Baked path uses bounds-area gating so ink bounds are correct when curve data is GPU-only

### Text decorations (Phase 2)
- `StyleSpan { start, end, underline?, strike? }` API for underline and strikethrough spans
- `SlugText.styles` setter; decoration rects share the fill draw call (rect sentinel in `SlugGeometry`)
- Decoration metrics (position, thickness) in baked font format; BAKED_VERSION bumped 3 → 4
- `SlugFont.emitDecorations()` thin wrapper using the font's declared metrics

### Font stack / multi-font rendering (Phase 3)
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint()` walks the chain
- `SlugFont.hasCharCode(c)` — fast codepoint coverage check
- `SlugStackText` — multi-font renderable; one `InstancedMesh` per contributing font per draw
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — stack-aware line wrapping matching `SlugStackText` output
- FA-Solid PUA icon demo using baked subset alongside a Canvas2D `@font-face` fallback

### Outline / stroke rendering (Phase 4)
- `distanceToQuadBezier` — TSL port + CPU reference for closest-point-on-quadratic-Bezier
- `slugStroke` fragment shader using bevel-via-min join approximation
- `SlugStrokeMaterial` — stroke-capable NodeMaterial sharing the fill instance layout
- `SlugText.outline` API: constructor option + runtime `setOutlineWidth()` / `setOutlineColor()` (uniform-only, zero rebuild)
- `SlugText.setOpacity()` — fill opacity control for outline-only mode
- `SlugOutlineOptions` exported from package root; `color` accepts `number | string | Color`
- `stem darkening` and `thickening` options on `SlugMaterial` and `SlugText`

### Stroke offsetter (Phase 5 prep, Tasks 16–17)
- `subdivideForOffset` — adaptive quadratic subdivision with angle criterion
- Per-segment Tiller-Hanson offset; `unitTangentAt` helper reused across steps
- Join insertion: bevel, miter (with `miterLimit` fallback), round
- Cap insertion: flat, square, triangle, round arc
- `strokeOffsetter(curves, closed, options)` — complete closed-contour output
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter to GPU glyph data
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets?` field (absent when no stroke flags used; backward-compatible)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — pre-baked stroke lookup

### SlugStackText parity (Phase 5)
- `SlugStackText.styles` — underline/strikethrough across multi-font stacks via `SlugFontStack.emitDecorations()`
- `SlugStackText.outline` — per-font stroke `InstancedMesh` sharing fill geometry; `setOutlineWidth()` / `setOutlineColor()`
- `SlugStackText.setOpacity()` — forwards to all per-font fill materials
- `SlugStackText.dispose()` — full teardown of outline meshes, fill meshes, geometries, materials

### Other API additions
- `SlugFont.wrapText(text, fontSize, maxWidth?) → string[]` — baked + runtime line-wrap
- `slug-bake --output / -o` flag for custom output base paths
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline module

## Performance

- `curveTexture` switched to `RGBA16F` (HalfFloatType) — halves texture bandwidth
- `bandTexture` switched to `RG32F` — eliminates two wasted float channels per texel
- `bandCount` 8 → 16 — halves expected curves per band, reducing per-fragment ALU
- Non-crossing curve skip in shader (`If(rootCode > 0)`) — ~30% of curves bypass sqrt/divide
- `MAX_CURVES_PER_BAND` 64 → 40 — matches real corpus p999; reduces shader register pressure
- Baked Inter-Regular fixture: 13 MB → 7.1 MB (~45% smaller)
- Stroke shader: single Newton seed (vs three) — roughly halves pipeline compile time and per-fragment cost

## Bug Fixes

- Axis-aligned quad expansion in `SlugStrokeMaterial` — stroke no longer clips square at glyph bbox extents
- `parseFont` emits advance-only entries for whitespace/control glyphs (space, tab) — advances correct on baked + runtime paths
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` from collapsing tokens and drifting word-boundary checks
- `SlugText._setFont` defers `visible = true` until first real rebuild — prevents zero-size GPU buffer error on first R3F render
- Kerning extraction filters to source glyph IDs only — fixes crash when stroke offset IDs are in the kern table range
- `SlugFontLoader.clearCache` removed (static cache already keyed on `url:runtime?`)

## Refactors

- `examples/vanilla/slug-text` renamed to `examples/three/slug-text`; example packages now follow the `{three,react}` convention
- Examples migrated from Web Awesome controls to `@three-flatland/tweakpane`
- Shared canvas-comparison UX (onion/split/diff modes, draggable split handle) ported to React example for 1:1 parity

## BREAKING CHANGES

- `BakedJSON` format version bumped (2 → 3, then 3 → 4); existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`

This release ships the complete `@three-flatland/slug` text rendering library: analytic GPU coverage, baked font pipeline, measurement, decorations, multi-font stacks, and a full quadratic-Bezier stroke system with bake-time stroke-set support.
