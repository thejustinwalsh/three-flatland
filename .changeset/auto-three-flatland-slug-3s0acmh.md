---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New package: `@three-flatland/slug`

Analytic GPU text renderer built on WebGPU + TSL. Renders resolution-independent text via a winding-number fill shader operating over quadratic Bézier curve/band textures.

### Core rendering pipeline

- `SlugFont` / `SlugFontLoader` — runtime opentype.js parsing and baked-font loading; lazy opentype for baked path
- `SlugText` (Three.js `Object3D`) — instanced glyph rendering with per-frame MVP + viewport uniforms
- `SlugGeometry` / `SlugMaterial` — instanced quad layout with analytic coverage via `slugFragment` + `slugVertex` TSL shaders
- `SlugMaterial`: stem darkening (`stemDarken`) and stem thickening (`stemThicken`) options for sub-pixel rendering quality
- Dynamic quad dilation (`slugDilate`) for sub-pixel AA at any scale

### Baked font pipeline (`slug-bake` CLI)

- `slug-bake` CLI: converts any OpenType/TrueType font into `.slug.{json,bin}` asset pairs for zero-runtime-JS text rendering
- `--output` / `-o` flag for custom output paths
- `BAKED_VERSION` tracking with warnings on stale fixtures
- `textShaperBaked` + `wrapLinesBaked` + `textMeasureBaked` back-ends; opentype.js stays unloaded for baked fonts

### Texture / shader performance

- Curve texture: RGBA32F → RGBA16F (half bandwidth); band texture: RGBA32F → RG32F (half bandwidth); combined ~45% smaller baked files
- `bandCount` 8 → 16: halves expected curves per band, proportionally cuts per-fragment ALU
- `MAX_CURVES_PER_BAND` 64 → 40 (covers 100% of Inter's corpus); reduces shader register pressure
- Shader skips sqrt/division work for non-ray-crossing curves (~30% of bands in typical text)
- `BAKED_VERSION` bumped 2 → 3 for the texture format change; 3 → 4 for decoration metrics

### Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — aligned with `CanvasRenderingContext2D.measureText`; constant-time via pre-computed bounds
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line measurement matching `SlugText` line-height default
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output matching the shaped render exactly (fixes Canvas2D comparison drift)
- Baked measurement: gate ink accumulation on bounds-area (`xMax > xMin`) instead of `curves.length` (silent zero-bounds bug fixed)

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` — character-range decoration API
- `pipeline/decorations.ts`: `emitDecorations` post-pass; one rect per (line, kind, contiguous run); decoration rects use the `glyphJac.w = -1` sentinel in `SlugGeometry` for a zero-extra-draw-call path
- `SlugMaterial` short-circuits coverage to 1 for rect sentinels
- `SlugText.styles` setter applies decorations without geometry rebuild
- Decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) baked into `BakedJSON.metrics`

### Font-stack / multi-font fallback

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint` / `resolveText` / `hasCharCode` API
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check (cmap lookup)
- `pipeline/textShaperStack.ts` — wrap-aware multi-font shaper; kerning preserved within same-font runs
- `SlugStackText` (`Group`) — one `InstancedMesh` child per contributing font; single draw per font per frame
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint wrap matching `SlugStackText` output
- `SlugFontStack.emitDecorations()` — decoration pass using primary font metrics across mixed-font runs
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity()` — parity with `SlugText`
- `SlugStackText.dispose()` now fully tears down outline meshes and fill `InstancedMesh` children

### Outline / stroke (Phase 4)

- `SlugStrokeMaterial` — distance-to-curve fragment shader (`slugStroke`); shares instance layout with fill material; decoration rect sentinel short-circuits to zero coverage
- `distanceToQuadBezier` TSL node: cubic critical-point solve + Newton refinement; reduced to single seed + 3 iterations to halve WGSL compile time and cut runtime cost ~⅔
- `SlugText.outline: SlugOutlineOptions` — opt-in child `InstancedMesh` sharing fill geometry; `renderOrder = -1`; runtime `setOutlineWidth` / `setOutlineColor` (zero rebuild)
- `SlugText.setOpacity(value)` — fade fill without rebuilding geometry (enables outline-only mode)
- `SlugOutlineOptions.color` accepts `number | string | Color`
- Axis-aligned quad expansion in `SlugStrokeMaterial` vertex shader: each axis expanded independently by `strokeHalfWidth`; fixes clipping at glyph bbox edges that appeared with diagonal-normal expansion
- `slugDilate` no longer takes `strokeHalfWidth` — fill-only callers unaffected
- `SlugText._setFont` rebuilds outline only when already enabled

### Phase 5: stroke offsetter pipeline

- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU factory used by font parser, stroke offsetter, and future SVG path support
- `strokeOffsetter(curves, closed, options)` — full quadratic-Bézier stroke pipeline:
  - Task 16.1: adaptive subdivision (`subdivideForOffset`); flatness shortcut; `unitTangentAt` export
  - Task 16.2: per-segment Tiller-Hanson offset; degenerate-tangent fallback
  - Task 16.3: join insertion — bevel, miter (with `miterLimit` fallback to bevel), round (≤60°/segment)
  - Task 16.4: cap insertion — flat, square, triangle, round
  - Tasks 16.5-16.6: contour stitching; closed → two annular contours; open → single closed loop with caps
- `bakeStrokeForGlyph(source, options)` — bridges offsetter to the bake pipeline; returns null for advance-only glyphs
- `slug-bake` CLI: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed at `glyphIdOffset + sourceId`
- `BakedJSON.strokeSets?` optional field; backwards-compatible (absent when no stroke flags used)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke glyph data
- Kerning extraction filters to source IDs only (prevents crash on stroke glyph ID ranges)

### Pipeline robustness fixes

- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls); aligns runtime and baked advance resolution
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; disables `liga`/`rlig` that shortened the array vs `text.length`, causing whitespace collapse at wrap points
- `SlugText._setFont` defers `visible = true` until first `_rebuild` with real glyph data; prevents WebGPU "binding size is zero" errors on R3F's first render pass
- `SlugFontLoader`: removed `BAKED_VERSION` machinery (no released version to migrate)

### Examples (React + Three.js, 1:1 parity)

- Canvas2D comparison overlay: onion-skin, split (draggable handle), diff (luminance heatmap) modes; `Off` mode hides overlay entirely
- Compare overlay uses `wrapText` / `stack.wrapText` to match line breaks with the Slug render at any `maxWidth`
- Icon demo: FA-Solid 12-glyph PUA subset baked with `slug-bake`; `@font-face` weight set to `normal` so Canvas2D fallback matches
- Tweakpane controls: Settings + Mode folders, Styles folder (underline/strike), Outline folder (style/width/color), Measure folder (click-to-measure lines, paragraph monitors)
- `DprSync` R3F component keeps `gl.setPixelRatio` in sync with monitor-swap / OS-zoom / fullscreen transitions
- Migrated from Web Awesome to `@three-flatland/tweakpane` for all example UI

---

Phase 1–5 of the Slug text rendering roadmap. Provides a complete analytic GPU text API with measurement, decorations, multi-font fallback, and a full quadratic-Bézier stroke offsetter for baked outline generation.

