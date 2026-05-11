---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## What's New

### Rendering pipeline

- Initial `@three-flatland/slug` package — analytic quadratic-Bezier text rendering on WebGPU via TSL node materials
- `SlugFont` / `SlugText` / `SlugGeometry` / `SlugMaterial` — core rendering objects
- Instanced mesh layout: one draw call per font, glyph quads positioned via instance matrices
- `slugDilate` vertex shader: dynamic AA quad dilation; `slugFragment`: winding-number fill coverage
- Stem darkening and thickening options on `SlugMaterial` / `SlugText` for improved sub-pixel legibility

### Baked font pipeline

- `slug-bake` CLI — pre-bakes opentype fonts to `.slug.{json,bin}` texture pairs for zero-runtime-parse loading
- `--output / -o` flag for custom output base paths
- `--stroke-widths / --stroke-join / --stroke-cap / --miter-limit` flags bake stroke pseudo-glyphs alongside fills; stroke glyphs render through the existing fill shader at no extra shader variant cost
- `BakedJSON.strokeSets` optional field carries per-bake stroke metadata; absent for fonts baked without stroke flags (old fixtures load unchanged)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` looks up a pre-baked stroke `SlugGlyphData`

### Measurement API

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned single-line metrics; works on both baked and runtime fonts without loading opentype.js for baked paths
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block metrics aligned with `SlugText` line-height defaults
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output matching the shaper's wrap policy

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` — underline and strikethrough rendering in the same draw call as glyph fills
- `SlugText.styles` setter (constructor + runtime); `SlugFont.emitDecorations()` pipeline helper
- Decoration rects encoded as sentinel instances (`glyphJac.w = -1`), short-circuiting the fill fragment to coverage = 1 — zero extra draw calls

### Multi-font stack

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint()` / `resolveText()` / `hasCharCode()` for coverage queries
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — wrap output aligned with `SlugStackText` across mixed-font runs
- `SlugFontStack.emitDecorations()` — decoration spans using primary-font metrics across mixed-font runs
- `SlugStackText` (`extends Group`) — one `InstancedMesh` per font, single rebuild per text change; styles, outline, and opacity parity with `SlugText`

### Outline / stroke rendering (Phase 4 + 5)

- `SlugStrokeMaterial` — distance-to-quadratic-Bezier fragment shader; shares glyph geometry with fill mesh
- `SlugText.outline: SlugOutlineOptions` — opt-in child stroke mesh with runtime-uniform `setOutlineWidth()` / `setOutlineColor()`; `setOpacity()` on fill for outline-only mode
- `SlugOutlineOptions` and `SlugStrokeMaterial` exported from package root
- `SlugStackText.outline` and `SlugStackText.setOpacity()` — parity with `SlugText`
- Stroke offsetter pipeline: adaptive quadratic subdivision, per-segment Tiller-Hanson offset, bevel / miter / round join geometry, flat / square / triangle / round cap geometry, contour stitching
- `bakeStrokeForGlyph(source, options)` — converts source glyph contours to stroke pseudo-glyph via offsetter + `buildGpuGlyphData`
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared pipeline/buildGpuGlyph.ts module consumed by fontParser, CLI bake, and future SVG path support

### Performance

- `curveTexture` format `RGBA16F` (8 bytes/texel, was 16); `bandTexture` format `RG32F` (8 bytes/texel, was 16) — ~45% smaller baked files, ~20% less GPU bandwidth
- `bandCount` 8 → 16, halving expected curves per fragment; `MAX_CURVES_PER_BAND` 64 → 40
- Shader: non-crossing curves skip the Newton-solve / coverage / weight work — ~30% ALU reduction on empty-space fragments
- Newton-seed count 3×3 → 1×3 (single seed at t=0.5, two endpoint hard candidates) in the stroke shader — ~½ WGSL size, ~½ first-draw pipeline-compile stall

### Bug fixes

- Stroke quad axis-aligned expansion: `slugDilate` now expands by `strokeHalfWidth` per axis independently before AA dilation, eliminating corner clipping at glyph bbox extents
- Runtime shapers pass `{ features: [] }` to opentype's `stringToGlyphs` — prevents `liga`/`rlig` substitutions from compressing the glyph array and causing word-boundary drift in wrapped text
- `SlugText._setFont` no longer flips visible before the first `_rebuild` — avoids "Binding size is zero" WebGPU error on R3F's first render pass
- `SlugStackText.dispose()` correctly tears down outline meshes and fill `InstancedMesh` children in dependency order
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab, zero-width controls) — consistent advance resolution between baked and runtime paths
- Kerning extraction filters to source glyph IDs only — stroke offset IDs in ranges unknown to opentype.js no longer cause `_push is not a function` errors

### Examples

- React slug-text example ported to R3F idioms with Canvas2D onion / split / diff compare overlay
- Icons mode: `SlugStackText` with [Inter, FA-Solid] stack; Canvas2D compare mirrors Slug stack via `@font-face` + `stack.wrapText`
- Measure overlay: hover-to-select rendered line; cyan ink bounds + dashed yellow font envelope; paragraph block monitors
- Styles folder: underline / strike over preset character ranges
- Outline controls: Fill / Outline / Both radio, width slider, color picker; `antialias: false` (Slug computes analytic coverage)
- Renderer sets `trackTimestamp: true` for GPU-time stats

## BREAKING CHANGES

- Baked `.slug.bin` / `.slug.json` files produced before this release are not compatible with the new texture format (`RGBA16F` curves, `RG32F` bands). Re-bake all assets with the current `slug-bake` CLI.
- `SlugFontLoader.clearCache` removed — the static cache is keyed on URL and no explicit clear is needed.

Comprehensive analytic text rendering package covering measurement, decorations, multi-font stacks, runtime outlines, and a baked-stroke pipeline. All rendering is WebGPU-only via TSL node materials; no GLSL, no WebGL fallback.

