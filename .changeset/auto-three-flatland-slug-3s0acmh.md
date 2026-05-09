---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## What's new in `@three-flatland/slug`

### Stroke rendering (Phase 4–5)

- `SlugText.outline` — opt-in outline renders a child `InstancedMesh` behind the fill mesh sharing the same `SlugGeometry`; width/color update as runtime uniforms with zero rebuild
- `SlugText.setOutlineWidth(v)` / `SlugText.setOutlineColor(v)` — live uniform setters; accept `number | string | Color`
- `SlugText.setOpacity(v)` — fades fill opacity for outline-only mode
- `SlugOutlineOptions` exported from package root; `color` accepts CSS hex strings
- `SlugStrokeMaterial` — TSL NodeMaterial parallel to `SlugMaterial`; same instance-attribute and MVP/viewport lifecycle; fragment uses analytic `distanceToQuadBezier` instead of winding number
- `slugDilate` extended with optional `strokeHalfWidth` for axis-aligned quad expansion past the fill bbox; fill-only callers unaffected
- Stroke shader compile cost halved: single Newton seed at t=0.5 + three iterations + two endpoint candidates; cuts generated WGSL size ~50% and eliminates first-use compile hitches
- `SlugStackText.outline` / `SlugStackText.setOpacity()` — parity with `SlugText`; creates a sibling `SlugStrokeMaterial` mesh per font in the stack
- `SlugStackText.dispose()` fixed to tear down outline meshes and `SlugStrokeMaterial` instances before disposing shared geometry

### Stroke offsetter pipeline (Phase 5, build-time)

- `strokeOffsetter(curves, closed, options)` — complete quadratic-Bezier stroke offset pipeline: adaptive subdivision (Task 16.1), per-segment Tiller-Hanson offset (Task 16.2), join insertion (bevel / miter / round, Task 16.3), cap insertion (flat / square / triangle / round, Task 16.4), contour stitching into closed outer+inner annular ring or single open-contour loop (Tasks 16.5–16.6)
- `bakeStrokeForGlyph(source, options)` — bridges the offsetter output into `SlugGlyphData` via `buildGpuGlyphData`; returns `null` for advance-only glyphs
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; bakes stroke pseudo-glyphs into the same curve+band textures at a fresh glyph-ID offset
- `BakedJSON.strokeSets?` optional field — absent for fonts baked without stroke flags (old fixtures load unchanged)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke `SlugGlyphData` by matching set; returns `null` if no matching set exists

### Text measurement

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`; dispatches to baked or runtime path; O(1) per call using pre-computed `SlugGlyphData.bounds`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText`; respects the same `lineHeight: 1.2` default as `SlugText`
- Baked measure now gates ink accumulation on `bounds-area (xMax > xMin)` rather than `curves.length`; prior heuristic silently returned zero ink bounds for every baked glyph

### Text decoration

- `StyleSpan { start, end, underline?, strike? }` — manual-aligned shape per Slug §2.7/§2.8
- `pipeline/decorations.ts` — `emitDecorations()` post-pass; one rect per (line, kind, contiguous styled run); accepts function-callback advance-lookup variant alongside the existing `Map` signature
- `SlugFont.emitDecorations()` — thin wrapper forwarding the font's own metrics
- `SlugGeometry.setGlyphs` accepts an optional `decorations` array; appends rect-sentinel instances rendered in the same draw call
- `SlugText.styles?: StyleSpan[]` — constructor + runtime setter
- `SlugStackText.styles: StyleSpan[]` — decoration rects attach to the primary font's mesh; `SlugFontStack.emitDecorations()` new method
- BAKED_VERSION bumped 3 → 4; included fixtures re-baked

### Font stack (multi-font fallback)

- `SlugFontStack(fonts: SlugFont[])` — ordered fallback chain; `resolveCodepoint(c)` returns the first covering font index; `resolveText(text)` yields per-character assignments
- `SlugFont.hasCharCode(c)` — codepoint-coverage check via cmap
- `pipeline/textShaperStack.ts` — wrap-aware shaper; per-codepoint font resolution; preserves kerning within same-font runs; drops it across boundaries
- `SlugStackText extends Group` — one `InstancedMesh` per font in the stack; one draw call per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint resolution with same break policy as `shapeStackText`; keeps Canvas2D overlays line-for-line with `SlugStackText`
- `SlugFontStack.resolveCodepoint` uses `hasCharCode` for per-codepoint fallback routing

### Text layout

- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches to baked (`wrapLinesBaked`) or runtime (`wrapLines`) path
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`; fixes whitespace collapse at wrap points caused by `liga`/`rlig` shortening the returned glyph array vs `text.length`
- `parseFont` now emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for space, tab, zero-width cmap'd glyphs; matches bake CLI post-pass

### Performance

- `curveTexture` format changed to `RGBA16F` (HalfFloat) — 8 bytes/texel vs 16; accurate to sub-pixel at all practical rendering sizes
- `bandTexture` format changed to `RG32F` — 8 bytes/texel vs 16; old packing wrote only 2 of 4 channels
- `MAX_CURVES_PER_BAND` 64 → 40 — covers 100% of Inter's 2849-glyph corpus with margin; reduces shader register pressure
- BAKED_VERSION bumped 2 → 3; fixtures re-baked (~45% smaller on disk, 13 MB → 7.1 MB); `slug-bake` emits a warning when any band exceeds the shader bound
- `bandCount` 8 → 16 — halves expected curves per band (mean ~3.2 vs 6.3), reducing fragment ALU linearly in the hot loop
- Shader skips the post-`rootCode` solve + coverage + weight work for curves that don't cross the ray at the current fragment position (~30% of curves in a band)

### GPU pipeline refactor

- `pipeline/buildGpuGlyph.ts` — shared factory used by `fontParser`, `strokeOffsetter`, and future SVG path producers: `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`
- `fontParser` shrinks; opentype-specific glyph iteration stays; inline bounds + has-outline branching moved to the shared factory

### Baked font support

- `slug-bake` CLI — converts a TTF/OTF to `.slug.{json,bin}` with band+curve texture layout baked at build time; `--output / -o` for custom output path bases
- `SlugFontLoader` — loads baked fonts without bundling opentype.js; falls back to runtime parse when the baked path is unavailable
- `BAKED_VERSION` machinery removed from `SlugFontLoader` — package is pre-release; no migration story to maintain

### Stem darkening

- `SlugMaterial` / `SlugText` expose stem-darkening and stem-thickening options; coverage calculations updated accordingly

### Visibility fix

- `SlugText._setFont` no longer flips `visible=true` before the first `_rebuild`; prevents TSL from building a pipeline against an uninitialized instance buffer (WebGPU "Binding size is zero" rejection)

### Bug fixes

- Stroke outline clipping fixed: axis-aligned quad expansion applied before the per-fragment AA dilation pass so all stroke pixels survive culling at glyph extents
- `SlugText._setFont` rebuilds the outline only when already enabled — avoids GPU resource cost for users who never opt in
- Kerning extractor filters to source glyph IDs only; stroke pseudo-glyph IDs no longer trigger `this.font._push is not a function`

Adds analytic GPU text rendering for Three.js via `SlugText` and `SlugStackText`, with baked-font support, text measurement, decorations, multi-font stacks, and a complete quadratic-Bezier stroke pipeline for outlined text.

