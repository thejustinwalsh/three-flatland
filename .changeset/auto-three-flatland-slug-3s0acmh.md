---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Outline / Stroke system (Phase 4 + Phase 5)

- `SlugText.outline` — opt-in outline renders a child `InstancedMesh` behind the fill, sharing glyph geometry and `instanceMatrix`; zero rebuild on width/color change
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` — runtime-uniform setters; `color` accepts `number | string | Color`
- `SlugText.setOpacity(v)` — fades fill without mutating the mesh tree; enables fill-hidden outline-only mode
- `SlugOutlineOptions` exported from package root
- `SlugStrokeMaterial` — TSL NodeMaterial with same instance-attribute layout as `SlugMaterial`; fragment path uses analytic distance-to-curve (`slugStroke`) instead of winding-number
- `slugStroke` fragment shader — bevel-via-min exterior joins; crispness gate widens sub-pixel strokes to a 1 px minimum so hairlines stay visible below `fwidth`
- Stroke quad expansion is now axis-aligned (one axis per vertex quadrant) instead of along the unit diagonal, preventing outer-ring clipping at glyph extents
- Reduced `distanceToQuadBezier` Newton seeds from 3 × 3 iterations to 1 × 3 + 2 endpoints, cutting WGSL size ~50% and eliminating first-draw pipeline-compile hitches
- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake pre-offset stroke contours into `.slug.{json,bin}` at a fresh glyph-ID offset; runtime reads `BakedJSON.strokeSets` metadata; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` returns the matching pre-baked `SlugGlyphData`
- Quadratic-Bézier stroke offsetter (`strokeOffsetter`) — full build-time pipeline: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, contour stitching into closed annular rings
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter output to `SlugGlyphData`; returns `null` for advance-only glyphs

## Font stack & measurement

- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint font resolution with the same break-at-last-space + hard-break-fallback policy as `shapeStackText`; keeps Canvas2D overlays line-for-line with `SlugStackText`
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics matching `CanvasRenderingContext2D.measureText` field names
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText + measureText`; respects the same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.hasCharCode(cp)` — codepoint coverage check for per-codepoint fallback routing in `SlugFontStack`
- `SlugFontStack.emitDecorations()` — builds per-glyph advance lookups via `WeakMap`; uses primary-font decoration metrics so underline/strike lines stay visually consistent across mixed-font runs
- `SlugStackText.styles` — underline / strikethrough spans on font-stack text
- `SlugStackText.outline` — per-font stroke `InstancedMesh` sharing fill geometry; `setOutlineWidth` / `setOutlineColor` runtime setters
- `SlugStackText.setOpacity(v)` — forwards to every per-font fill material
- `SlugStackText.dispose()` — now tears down outline child meshes and `SlugStrokeMaterial`s before disposing shared geometries

## Pipeline & CLI

- Shared `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` pipeline helpers — `fontParser`, stroke offsetter, and future SVG path producer all emit identical `SlugGlyphData` shape
- `parseFont` emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for cmap'd no-outline glyphs (space, tab, zero-width controls)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` token deletion from drifting word-boundary indices
- `slug-bake --output / -o` — custom output base path
- `SlugFontLoader`: removed `BAKED_VERSION` machinery (package not yet released)

## Bug fixes

- `SlugText._setFont` no longer flips `visible=true` before the first `_rebuild`; prevents WebGPU "Binding size is zero" rejection on R3F's first render pass
- Kerning extraction now filters to source glyph IDs only, preventing `this.font._push is not a function` when stroke glyph IDs are present
- Compare overlay uses `stack.wrapText` in icons mode so Canvas2D line breaks agree with `SlugStackText` at any `maxWidth`
- Compare mode gains an `Off` option — hides the entire overlay; `redrawCompare` short-circuits to skip Canvas2D work
- R3F `<DprSync>` component calls `gl.setPixelRatio` whenever tracked DPR changes, keeping the Slug canvas in sync after monitor swaps and fullscreen transitions

Adds a complete analytic text-stroke system (Phase 4) and the full build-time quadratic-Bézier stroke-offsetter pipeline (Phase 5 Tasks 15–17), alongside font-stack measurement APIs and `SlugStackText` feature parity with `SlugText` for styles, outline, and opacity.

