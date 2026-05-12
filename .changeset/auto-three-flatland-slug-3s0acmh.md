---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### Package foundation

- Initial Slug GPU text rendering pipeline: font parsing, text shaping, WebGPU texture packing
- Analytic per-fragment coverage shader via TSL (WebGPU-only; no GLSL, no WebGL)
- `SlugText`, `SlugFont`, `SlugGeometry`, `SlugMaterial` core classes
- Dynamic quad dilation for sub-pixel anti-aliasing
- `SlugFontLoader` with baked font support and `slug-bake` CLI (`--output/-o`)
- React subpath (`three-flatland/react`) with R3F-compatible types

### Performance

- `curveTexture` → `RGBA16F`, `bandTexture` → `RG32F` — ~45% smaller `.slug.bin` on disk, halved GPU memory bandwidth (BAKED_VERSION 2→3; re-bake required)
- `bandCount` 8→16 — halved expected curves/band; `MAX_CURVES_PER_BAND` 64→40
- Fragment shader skips sqrt/division/saturate for non-crossing curves (~30% ALU reduction in empty regions)

### Measurement API

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned single-line metrics (width, actualBoundingBox, fontBoundingBox)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions respecting the same line-height default as `SlugText`
- Baked path now gates ink bounds on area (`xMax > xMin`) instead of `curves.length > 0` — fixes zero-width measurements on baked fonts

### Stem darkening and thickening

- `SlugMaterial` + `SlugText` gain `stemDarkening` and `thickening` options with updated coverage calculations

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` — manual-aligned per Slug §2.7/§2.8
- `pipeline/decorations.ts`: `emitDecorations` post-pass producing `DecorationRect[]` (one rect per line per contiguous styled run)
- `SlugText.styles` — constructor + runtime setter
- `SlugGeometry.setGlyphs` accepts optional `decorations`; fragment shader short-circuits coverage for rect sentinels
- BAKED_VERSION 3→4 for decoration metrics (re-bake required); included fixtures updated

### Outline / stroke — Phase 4

- `distanceToQuadBezier` — analytic closest-point primitive (TSL + pure-JS CPU reference)
- `slugStroke` fragment shader — distance-based stroke coverage with crispness gate (sub-pixel strokes widen to 1px minimum)
- `SlugStrokeMaterial` — parallels `SlugMaterial`; runtime-uniform `strokeHalfWidth`, `color`, `opacity`
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; `setOutlineWidth()` / `setOutlineColor()` / `setOpacity()` are zero-rebuild uniform setters
- `SlugOutlineOptions.color` accepts `number | string | Color`
- Fixed outline clipping at glyph extents: quad expansion now axis-aligned in vertex shader instead of along diagonal normal
- Halved stroke shader WGSL size (single Newton seed) — eliminates first-enable compile stall of hundreds of milliseconds

### Stroke offsetter — Phase 5

- Quadratic-Bézier stroke offsetter pipeline in `packages/slug/src/pipeline/strokeOffsetter.ts`:
  - Adaptive subdivision (`subdivideForOffset`) — angle-based criterion, max-depth 8
  - Per-segment Tiller-Hanson offset
  - Join insertion — bevel, miter (with `miterLimit` fallback), round (≤60°/segment arcs)
  - Cap insertion — flat, square, triangle, round
  - Contour stitching: closed → outer + inner annular ring; open → single closed loop
- `bakeStrokeForGlyph(source, options)` — bridges offsetter to GPU pipeline
- `slug-bake` CLI: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets` optional field; `SlugFont.getStrokeGlyph(sourceId, ...)` for lookup
- `buildGpuGlyph.ts` — shared contour-to-`SlugGlyphData` pipeline extracted from `fontParser` (used by offsetter, SVG paths, and runtime loading)

### Font stack / fallback

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint()`, `resolveText()`
- `SlugFont.hasCharCode(c)` — cheap cmap coverage check
- `pipeline/textShaperStack.ts` — wrap-aware multi-font shaper preserving kerning within same-font runs
- `SlugStackText extends Group` — one `InstancedMesh` per font in the stack; identical `SlugText` API surface
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity()` — parity with `SlugText`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break results matching `shapeStackText` for external renderers (Canvas2D overlays, DOM mirrors)
- `SlugFontStack.emitDecorations()` — per-glyph advance lookup keyed by object identity to disambiguate same glyphId across fonts
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — dispatches to baked/runtime path

### Pipeline fixes

- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` token deletion
- `parseFont` emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for space, tab, zero-width controls — matches bake-CLI post-pass
- `SlugText._setFont` no longer sets `visible = true` before first `_rebuild` — prevents WebGPU "Binding size is zero" rejection on R3F's pre-initialization render pass
- `SlugStackText.dispose()` tears down outline meshes before fill geometries to prevent double-free GPU leaks
- `SlugFontLoader.clearCache` removed (cache already keyed on `url:runtime?`)
- `BAKED_VERSION` machinery removed from loader (no released migration story)

### Examples (Three.js + React, 1:1 parity)

- Full Canvas2D comparison overlay — onion-skin, split (draggable handle), diff (luminance heatmap), and off modes
- Measure folder: click any rendered line for cyan (ink) + dashed yellow (font envelope) overlays; paragraph block monitors update live
- Icons demo: FA-Solid PUA codepoints baked via `slug-bake`; `@font-face` weight-normal for Canvas2D match
- `[Lorem | Icons]` radio toggle; compare overlay uses `stack.wrapText` in icons mode for line-break parity
- Tweakpane controls replacing Web Awesome throughout

---

Initial package release of `@three-flatland/slug` — a WebGPU-native analytic text renderer. Covers the full Phase 1–5 feature set: measurement, decorations, font stacks, Phase 4 runtime stroke, and Phase 5 stroke-offsetter bake pipeline.

