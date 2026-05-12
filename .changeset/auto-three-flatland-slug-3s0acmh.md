---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Changes

### Core rendering pipeline

- Initial `@three-flatland/slug` package: analytic GPU text rendering via WebGPU + TSL with font parsing, text shaping, band-based curve textures, and instanced draw calls
- Endpoint-sharing texture packing + `slugDilate` vertex shader for AA quad dilation
- Dynamic dilation for quad rendering in `SlugMaterial`

### Performance

- Texture bandwidth cut ~50%: curve texture → RGBA16F, band texture → RG32F; `MAX_CURVES_PER_BAND` 64 → 40; BAKED_VERSION bumped 2 → 3 (re-bake required)
- Band count doubled (8 → 16), halving expected curves per band; shader skips non-crossing curves with early `If(rootCode > 0)` branch

### Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line over `wrapText` with matching `lineHeight` default
- Baked measure fixed: bounds-area gate replaces `curves.length > 0` heuristic (was silently returning zero ink bounds on baked path)

### Text wrapping

- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches to runtime (opentype) or baked path
- `SlugFontStack.wrapText` for per-codepoint stack-aware line breaking, keeping Canvas2D overlays line-for-line with `SlugStackText`

### Font stacking

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `hasCharCode` on `SlugFont`
- `SlugStackText` — `Group` with one `InstancedMesh` per font in stack, each bound to its own curve/band textures
- `SlugFontStack.emitDecorations()` — decoration rects on primary font mesh across mixed-font runs
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity()` — parity with `SlugText` for icon/fallback scenes
- `SlugStackText.dispose()` fixed to clean up outline meshes and per-font fill materials (was leaking GPU resources on scene toggle)

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` API; `pipeline/decorations.ts` post-pass over shaped glyphs
- `SlugGeometry.setGlyphs` accepts optional `decorations`; rect-sentinel instances render as solid fills in the same draw call
- `SlugFont.emitDecorations()` wrapper; BAKED_VERSION 3 → 4 (decoration metrics baked into `BakedJSON.metrics`)
- `PositionedGlyph.srcCharIndex` added for unambiguous glyph→char mapping

### Stroke / outline

- Analytic stroke shader: `distanceToQuadBezier` TSL node (Newton refinement from t=0, 0.5, 1; clamped to [0,1]); `slugStroke` fragment shader; bevel-via-min joins
- `SlugStrokeMaterial` — instance-attribute layout mirrors `SlugMaterial`; decorations short-circuit to zero coverage in stroke pass
- `SlugText.outline` — child `InstancedMesh` sharing fill geometry; `renderOrder: -1`; runtime `setOutlineWidth` / `setOutlineColor` with zero rebuild
- `SlugText.setOpacity(value)` for fill-fade in Outline-only mode
- Fixed stroke quad axis-aligned expansion: expansion now applied per-axis before AA dilation, preventing outer ring clipping at glyph bbox extents
- Halved stroke shader compile cost: single Newton seed (was 3), 3 candidates total; cuts pipeline stall on first outline enable

### Stroke offsetter (Phase 5)

- Shared contour-to-GPU pipeline in `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph`; `fontParser` simplified
- `strokeOffsetter` in six tasks: adaptive subdivision (`subdivideForOffset`), per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, outer+inner contour stitching, full API
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter output to `SlugGlyphData` for CLI bake and async runtime fallback
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed alongside source glyphs at `glyphIdOffset + sourceId`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` for pre-baked stroke lookup
- `BakedJSON.strokeSets?` optional field; old fixtures load unchanged

### CLI

- `slug-bake` gains `--output / -o` for custom output base path
- Bake-time warning when any band exceeds `MAX_CURVES_PER_BAND`
- `packages/slug/scripts/analyze-bands.ts` for future band tuning

### Bug fixes

- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild`; prevents WebGPU pipeline error on R3F pre-mount render
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls), matching bake CLI post-pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` to suppress opentype.js `liga`/`rlig` collapsing that caused whitespace drift at wrap points
- Kerning extraction filters to source glyph IDs only; stroke offset IDs no longer trigger `_push is not a function` error
- `SlugFontLoader`: removed `BAKED_VERSION` machinery (no released version, no migration story)

### Examples

- Moved `examples/vanilla/slug-text` → `examples/three/slug-text`; MFE auto-discovery removes per-example `microfrontends.json` entries
- Canvas2D comparison overlay ported to React (onion / split / diff modes, draggable handle, heatmap diff)
- Compare mode gains `Off` option — hides overlay for clean standalone rendering
- Icon demo: FA-Solid PUA subset baked with `slug-bake`; `@font-face font-weight: normal` so Canvas2D matches slug stack
- Click-to-select line measure overlay (cyan ink + dashed yellow font envelope); paragraph monitors in tweakpane
- Hover-to-measure replaces click-to-measure for cleaner UX separation from style controls
- Stem darkening and thickening controls via `SlugMaterial` / `SlugText`

### DPR / fullscreen fixes

- `useWindowSize` tracks `{ w, h, dpr }` + subscribes to `(resolution: Ndppx)` media query; monitor swaps now re-size canvas correctly
- `document.fullscreenchange` listener + RAF re-measure to catch post-transition layout settle
- `<DprSync>` R3F component calls `gl.setPixelRatio` on DPR change, keeping slug canvas and compare canvas in sync after monitor swap

`@three-flatland/slug` ships a complete analytic WebGPU text rendering stack: baked + runtime font paths, measurement, word wrapping, decorations, multi-font stacking, and a full quadratic-Bezier stroke offsetter pipeline ready for baked stroke rendering in Phase 5.

