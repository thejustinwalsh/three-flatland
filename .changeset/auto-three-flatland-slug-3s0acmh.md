---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox, fontBoundingBox fields)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience respecting the same lineHeight default (1.2) as `SlugText`
- Runtime measure reads pre-computed `SlugGlyphData.bounds` (constant cost per call); baked measure gates ink accumulation on bounds-area, fixing silent zero-bounds on the baked path

### Text Wrapping

- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — word-wrap with baked/runtime dispatch; line breaks match shaped output for Canvas2D mirrors
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint wrap matching `SlugStackText` output across mixed-font runs

### Font Stack & Fallback

- `SlugFontStack(fonts)` — ordered font chain; first covering font wins per codepoint, notdef for unmatched
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check via cmap
- `SlugStackText` extends `Group` — multi-font renderable with one `InstancedMesh` per contributing font
- `SlugStackText.styles` — underline/strike spans; decorations attach to primary font mesh only
- `SlugStackText.outline` — stroke `InstancedMesh` per font sharing fill mesh's `instanceMatrix`; `setOutlineWidth` / `setOutlineColor` runtime-uniform setters
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials (enables outline-only mode)
- `SlugFontStack.emitDecorations()` — builds per-glyph advance lookup via `WeakMap` to disambiguate same glyphId across fonts

### Text Decorations

- `StyleSpan { start, end, underline?, strike? }` — text decoration API per Slug §2.7/§2.8
- `SlugText.styles` — accepts `StyleSpan[]` at constructor and as runtime setter
- `SlugFont.emitDecorations(text, positioned, styles, fontSize)` — pure post-pass; one rect per contiguous styled run per line
- `SlugGeometry.setGlyphs` accepts optional `decorations`; appends rect-sentinel instances rendered in the same draw call with no fill-shader cost

### Outline (Stroke) Rendering

- `SlugText.outline` — opt-in child `InstancedMesh` sharing glyph geometry and `instanceMatrix` with the fill mesh
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` — zero-rebuild runtime uniform setters
- `SlugText.setOpacity(v)` — fade fill for outline-only mode; `SlugOutlineOptions.color` accepts `number | string | Color`
- `SlugStrokeMaterial` — analytic stroke `NodeMaterial` (TSL); exported from package root alongside `SlugOutlineOptions`
- Stroke quad expands axis-aligned by `strokeHalfWidth` per axis — fixes diagonal clipping at glyph bbox extents
- Shader compile cost halved (single Newton seed, 3 candidates vs 5); per-fragment runtime cost drops ~⅔

### Stroke Bake Pipeline

- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — pre-bake stroke glyph sets into `.slug.{json,bin}`
- `BakedJSON.strokeSets?` — optional field; absent for files baked without stroke flags (backward compatible load)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up pre-baked stroke glyph by set parameters
- `bakeStrokeForGlyph(source, options)` — shared helper: offsets source contours, builds GPU glyph data, preserves advance/lsb
- `slug-bake --output / -o` — custom output base path
- Bake emits a warning when any band exceeds `MAX_CURVES_PER_BAND`

### Quadratic Stroke Offsetter

- `subdivideForOffset` — adaptive subdivision capping per-curve turn to ~16° for accurate offset approximation
- `offsetSegment` — Tiller-Hanson per-quad offset with degenerate/parallel fallbacks
- `insertJoin` — bevel / miter (with `miterLimit` fallback) / round join geometry between adjacent offset segments
- `insertCap` — flat / square / triangle / round end caps for open contours
- `strokeOffsetter(curves, closed, options)` — closed source → two contours (outer CCW + inner CW); open source → single closed contour

### Performance

- `curveTexture` → `RGBA16F` (8 bytes/texel vs 16); `bandTexture` → `RG32F` (8 bytes/texel vs 16); baked files ~45% smaller on disk
- `bandCount` 8 → 16 halves expected curves/band; `MAX_CURVES_PER_BAND` lowered 64 → 40
- Shader skips post-rootCode work for non-crossing curves (~30% of curves in a band)

### Pipeline Refactors

- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour→GPU pipeline extracted from `fontParser` into `pipeline/buildGpuGlyph.ts`
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` from collapsing whitespace at wrap points
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls)
- `SlugText._setFont` defers `visible=true` until first `_rebuild` with real glyph data (prevents zero-binding WebGPU errors on R3F first render)
- `SlugFontLoader`: removed `BAKED_VERSION` version-gate machinery; `clearCache` removed from public API

### Bug Fixes

- Stroke outer ring no longer clipped square at glyph bbox; axis-aligned quad expansion applied before AA dilation pass
- `SlugStackText.dispose()` tears down outline meshes and `SlugStrokeMaterial` instances before disposing shared geometries
- DPR stays in sync after monitor swap / OS zoom / fullscreen via `(resolution: Ndppx)` media query subscription in `useWindowSize`

### Examples (React + Three, 1:1 parity)

- Compare overlay: Off / Onion Skin / Diff / Split modes; Off hides overlay entirely with no Canvas2D CPU cost
- Measure overlay: hover any rendered line for ink (cyan) and font-envelope (dashed yellow) bounds; paragraph block monitors live-update
- Styles folder: underline/strike demo via `StyleSpan` API on preset scopes (word / sentence / line)
- Icons mode: `SlugStackText` with [Inter, FA-Solid] stack; baked FA-Solid 12-icon subset (~71 KB bin); Canvas2D compare font mirrors the stack
- Outline folder: Fill / Outline / Both style radio; live width slider and color picker
- Tweakpane replaces Web Awesome controls in both examples

## BREAKING CHANGES

- **`BAKED_VERSION` 2 → 3**: `curveTexture` changed to `RGBA16F`, `bandTexture` to `RG32F`. All existing `.slug.bin` / `.slug.json` files must be re-baked via `slug-bake`.
- **`BAKED_VERSION` 3 → 4**: decoration metrics (underlinePosition/Thickness, strikethroughPosition/Thickness) added to `BakedJSON.metrics`. All `.slug.bin` / `.slug.json` files must be re-baked.
- **`SlugFontLoader.clearCache`** removed from the public API.

Adds full-stack text features to `@three-flatland/slug`: measurement APIs, text decorations (underline/strike), analytic stroke rendering with baked stroke-set support, per-codepoint font fallback via `SlugFontStack`/`SlugStackText`, and significant GPU performance improvements. Requires re-baking all `.slug.bin` / `.slug.json` assets.

