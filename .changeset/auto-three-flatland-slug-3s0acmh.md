---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Core rendering pipeline

- Initial `@three-flatland/slug` package: full WebGPU/TSL text rendering pipeline — font parsing, text shaping, GPU texture packing, analytic coverage shaders
- `SlugText` Three.js object; `SlugGeometry`, `SlugMaterial` internals
- Dynamic quad dilation via `slugDilate` TSL shader for sub-pixel AA
- Endpoint sharing in texture packing; `slugFragment` winding-number coverage shader

## Baked font support

- `slug-bake` CLI for offline font pre-processing into `.slug.{json,bin}` pairs
- `SlugFontLoader` with lazy opentype.js — baked path never loads the runtime parser
- `slug-bake --output / -o` flag for custom output paths

## Performance

- `curveTexture` → RGBA16F, `bandTexture` → RG32F: ~50% GPU bandwidth reduction; baked file size drops ~45%
- `bandCount` 8 → 16: halves expected curves per band, reducing per-fragment ALU cost
- Fragment shader skips sqrt/divisions for non-crossing curves (~30% of band entries)
- `MAX_CURVES_PER_BAND` 64 → 40 based on full Inter corpus analysis; reduces shader register pressure
- Renderer `antialias: false` in examples — analytic coverage makes MSAA redundant

## Text measurement API

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned fields; baked and runtime backed
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line with `maxWidth` and `lineHeight`
- Runtime measure reads pre-computed `SlugGlyphData.bounds` (constant cost); baked measure uses bounds-area heuristic (fixes zero-ink regression on baked path)

## Text wrapping

- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — baked and runtime paths; used by examples to match Canvas2D line breaks with Slug output
- `SlugFontStack.wrapText(...)` — per-codepoint font resolution with the same wrap policy as `shapeStackText`; backed by `pipeline/wrapLinesStack.ts`
- Runtime shapers pass `{ features: [] }` to opentype.js to suppress ligature substitution that drifted word-boundary detection

## Text decorations

- `StyleSpan { start, end, underline?, strike? }` API; `SlugText` accepts `styles?: StyleSpan[]`
- `pipeline/decorations.ts` — pure post-pass over shaped glyphs; one rect per (line, kind, contiguous run)
- `SlugGeometry.setGlyphs` appends decoration rects as sentinel instances rendered in the same draw call
- `SlugMaterial` fragment shader short-circuits to full coverage for decoration sentinel instances
- Font-declared metrics (underline/strikethrough position + thickness, script scale/offset) extracted from OpenType post + os2 tables and baked into `BakedJSON.metrics`
- `BakedJSON` BAKED_VERSION 3 → 4; included fixtures re-baked

## Font stack / multi-font fallback

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint()`, `resolveText()`
- `SlugFont.hasCharCode(c)` — cheap cmap-backed coverage check
- `pipeline/textShaperStack.ts` — wrap-aware shaper that groups positioned glyphs by font index
- `SlugStackText extends Group` — one `InstancedMesh` per contributing font; each binds its own curve + band textures
- `SlugStackText.styles` — underline/strike spans via `SlugFontStack.emitDecorations()`; decoration line anchored to primary font metrics
- `SlugStackText.outline` — one `SlugStrokeMaterial` sibling mesh per font, sharing the fill mesh's `instanceMatrix`
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugStackText.dispose()` — tears down outline meshes before fill geometries to avoid double-free

## Outline / stroke rendering

- `distanceToQuadBezier` TSL shader — closest-point-on-quadratic-Bezier via Newton refinement (3 candidates: t=0, 0.5, 1 + single Newton seed); halved WGSL size vs initial 3-seed version
- `slugStroke` fragment shader — same band iteration as fill but distance-to-curve; bevel-via-min joins without explicit geometry
- `SlugStrokeMaterial` — parallel to `SlugMaterial`; decoration sentinel short-circuits to zero coverage
- `SlugText.outline: SlugOutlineOptions | null` — opt-in child `InstancedMesh` sharing the fill's `SlugGeometry`; `renderOrder = -1`
- `SlugText.setOutlineWidth()`, `setOutlineColor()` — runtime uniform setters, zero rebuild
- `SlugText.setOpacity(value)` — fade fill for outline-only mode
- `SlugOutlineOptions.color` accepts `number | string | Color`
- Outline quad expansion fixed: axis-aligned per-axis expansion applied in vertex shader before AA dilation pass (fixes stroke clipping at glyph extents)
- `SlugText._setFont` rebuilds outline only when already enabled, avoiding upfront GPU cost for fill-only users
- `SlugText._setFont` no longer flips `visible = true` before first `_rebuild` — prevents zero-size WebGPU binding error on first R3F render

## Stroke offsetter pipeline (Phase 5 bake)

- `pipeline/strokeOffsetter.ts` — quadratic-Bezier stroke offsetter in six steps:
  - Adaptive subdivision (`subdivideForOffset`) — angle-based criterion, flatness shortcut, depth cap
  - Per-segment Tiller-Hanson offset with degenerate fallbacks
  - Join insertion: miter (with `miterLimit` fallback to bevel), bevel, round (≤60°/segment quadratics)
  - Cap insertion: flat, square, triangle, round
  - Contour stitching: closed source → two contours (outer CCW + inner CW); open source → single closed contour
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter to `buildGpuGlyphData`; returns `null` for advance-only glyphs
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets?: Array<{ width, joinStyle, capStyle, miterLimit, glyphIdOffset }>` — optional, absent for fonts baked without stroke flags
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up matching pre-baked stroke `SlugGlyphData`
- Kerning extraction filters to source IDs only to avoid resolving stroke pseudo-glyph IDs through opentype.js

## Pipeline refactoring

- `pipeline/buildGpuGlyph.ts` — shared contour-to-`SlugGlyphData` pipeline; `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`
- `fontParser` emits advance-only glyph entries (empty curves, real `advanceWidth`) for space/tab/zero-width controls
- `SlugFontLoader`: `BAKED_VERSION` machinery removed (no migration story pre-release)

## Stem darkening / thickening

- `SlugMaterial` and `SlugText` accept stem darkening and thickening options
- `calcCoverage` shader updated for new options

## Examples

- Matched React (R3F/WebGPU) and Three.js examples with 1:1 feature parity
- Canvas2D compare overlay: onion-skin / split (draggable handle) / diff (luminance heatmap) modes, plus new `Off` option
- Tweakpane Settings + Mode panels: word-count slider, compare-mode radio, outline width/color, style radio (Fill / Outline / Both), decoration scope, paragraph monitors
- Click/hover-to-measure: cyan ink bounds + dashed yellow font envelope overlays; live width/ascent/descent monitors
- Icon fallback demo: `SlugFontStack([Inter, FA-Solid])` with 12-icon FA-Solid PUA subset; Canvas2D compare switches to matching `@font-face` stack
- `DprSync` R3F component — re-syncs `gl.setPixelRatio()` on monitor swap / OS-zoom / fullscreen transition

## Bug fixes

- DPR desync on monitor swap: `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query
- Fullscreen-return stale dimensions: additional `fullscreenchange` listener + RAF re-measure
- `SlugStackText.dispose()` cleans up outline meshes before disposing shared geometries

This release ships the complete `@three-flatland/slug` package: analytic WebGPU text rendering with baked font support, measurement APIs, font-stack fallback, text decorations, outline rendering, and a full quadratic-Bezier stroke offsetter pipeline for baked stroke sets.

