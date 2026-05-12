---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` — multi-line paragraph bounds
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — line-break list matching the shaped output
- `SlugFont.hasCharCode(c)` — fast codepoint-coverage check
- `SlugFontStack(fonts)` — ordered font fallback chain with per-codepoint resolution
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — wrap respecting per-codepoint font assignments
- `SlugStackText` — multi-font renderable; one `InstancedMesh` per stack font
- `SlugStackText.styles`, `.outline`, `.setOpacity()` — feature parity with `SlugText`
- `SlugText.outline` — opt-in child stroke mesh; `setOutlineWidth()` / `setOutlineColor()` are uniform-only, zero rebuild
- `SlugText.setOpacity(value)` — fade fill without mutating the mesh tree
- `SlugStrokeMaterial` — NodeMaterial for analytic stroke rendering, exported from package root
- `SlugOutlineOptions` — exported type for outline configuration
- `StyleSpan { start, end, underline?, strike? }` — character-range decoration spans
- `SlugFont.emitDecorations()` / `SlugFontStack.emitDecorations()` — decoration rect post-pass
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline helpers
- `bakeStrokeForGlyph(source, options)` — bake-time stroke contour builder
- `getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up pre-baked stroke glyphs on `SlugFont`
- `strokeOffsetter(curves, closed, options)` — quadratic-Bezier stroke offsetter with miter/bevel/round joins and flat/square/round/triangle caps

## CLI

- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake stroke glyph sets into `.slug.{json,bin}`
- `slug-bake --output / -o` — custom output base path

## Performance

- Band count 8 → 16; halves expected curves-per-band and per-fragment ALU cost
- Shader skips post-rootCode work for non-crossing curves (~30% of curves in a band)
- `curveTexture` → `RGBA16F`; `bandTexture` → `RG32F` — ~45% smaller baked files, ~20% less GPU bandwidth
- `MAX_CURVES_PER_BAND` 64 → 40 (covers 100% of Inter corpus); reduces shader register pressure
- Stroke shader: single Newton seed + 3 iterations instead of 3 × 3 — halves WGSL size and pipeline compile time
- Axis-aligned quad expansion for stroke quads fixes clipping at glyph extents

## Bug Fixes

- `parseFont` emits advance-only entries for space/tab/zero-width glyphs so stack shapers resolve correct advances
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; prevents `liga`/`rlig` collapsing word-boundary whitespace
- `SlugText._setFont` no longer flips `visible=true` before first `_rebuild`; prevents zero-size buffer pipeline errors in R3F
- `SlugStackText.dispose()` now cleans up outline meshes and stroke materials; fixes GPU leaks on scene toggle
- Kerning extraction filters to source IDs only; prevents crashes when stroke glyph IDs are passed to opentype.js
- Stroke outline clipping at glyph extents fixed by axis-aligned quad expansion in vertex shader

## Format Changes

- `BakedJSON` gains optional `strokeSets` field; old fixtures load unchanged
- `BakedJSON.metrics` includes decoration metrics (underline/strikethrough position + thickness)
- `BAKED_VERSION` bumped 2 → 3 (texture format change) and 3 → 4 (decoration metrics); re-bake existing `.slug.{json,bin}` files

## Examples

- Both React and Three.js slug-text examples maintain 1:1 feature parity throughout
- Canvas2D comparison overlay with onion / split / diff / off modes; draggable split handle
- Font-stack icons demo: FA-Solid PUA codepoints baked for a 12-icon subset
- Measure overlay: hover any line for ink (cyan) + font envelope (yellow) bounds; paragraph monitors live-update
- Styles panel: underline / strikethrough applied to preset character ranges
- Outline panel: Fill / Outline / Both radio; live width slider and color picker
- examples/vanilla/slug-text renamed to examples/three/slug-text

---

Phase 1–5 of the Slug roadmap: measurement, decorations, font stacks, analytic stroke, baked stroke sets, and the full quadratic-Bezier offsetter pipeline are all shipped. `@three-flatland/slug` is a production-ready analytic text renderer for WebGPU with outline, decoration, and multi-font fallback support.

