---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New package: `@three-flatland/slug`

Analytic GPU text rendering for WebGPU + TSL (Three Shader Language). No GLSL, no rasterised glyph atlases — coverage is computed per-fragment from quadratic Bézier curves packed into GPU textures.

### Core rendering

- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText`: primary rendering classes
- Font parsing via opentype.js; curve + band texture packing for GPU upload
- `SlugText` accepts `text`, `font`, `fontSize`, `align`, `lineHeight`, `maxWidth`, `styles`, `outline` constructor options plus runtime setters for all fields
- Dynamic instance-matrix dilation for sub-pixel AA at the vertex stage; analytic coverage in the fragment stage — no MSAA needed (`antialias: false` recommended)
- Stem darkening and thickening controls on `SlugMaterial` and `SlugText`

### Baked font format + CLI

- `slug-bake` CLI: offline font preprocessing to `.slug.json` + `.slug.bin` for zero-runtime-opentype deployments
- Baked path dispatches `shapeText`, `wrapText`, and `measureText` through the same API as the runtime path
- CLI flags: `--output/-o` for custom output base path
- Stroke-set bake: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags write pre-baked stroke glyphs into the same texture pair; `BakedJSON.strokeSets` field carries the metadata
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` looks up a pre-baked stroke glyph by matching set

### Measurement API

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line, CanvasRenderingContext2D-aligned field names
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience
- Runtime measure uses pre-computed `SlugGlyphData.bounds`; baked measure gates ink accumulation on bounds-area rather than discarded curve list

### Font stacks

- `SlugFontStack(fonts)`: per-codepoint fallback chain; `resolveCodepoint` / `resolveText` / `wrapText`
- `SlugFont.hasCharCode(c)`: cheap codepoint-coverage check
- `SlugStackText extends Group`: one `InstancedMesh` per font; shares the same shaping + layout options as `SlugText`
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity()`: full parity with `SlugText`

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` API on `SlugText` and `SlugStackText`
- `pipeline/decorations.ts`: post-shaping pass emitting `DecorationRect[]`; one draw call alongside glyph instances
- `SlugFontStack.emitDecorations()`: decoration lines anchored to primary font metrics across mixed-font runs

### Outline / stroke

- `SlugText.outline: SlugOutlineOptions` — opt-in child `InstancedMesh` sharing fill geometry; `renderOrder -1`
- `SlugStrokeMaterial`: TSL distance-to-quadratic-Bézier fragment shader with runtime-uniform `strokeHalfWidth`, `color`, `opacity`
- `setOutlineWidth` / `setOutlineColor` runtime setters — zero rebuild, live scrub
- Axis-aligned quad expansion in vertex shader fixes stroke clipping at glyph extents
- `SlugOutlineOptions` exported from package root

### Stroke offsetter (build-time pipeline)

- `strokeOffsetter(curves, closed, options)` — full quadratic-Bézier stroke pipeline:
  - Adaptive subdivision to per-segment flatness tolerance
  - Per-segment Tiller-Hanson offset with right-hand normal convention
  - Join insertion: miter (with `miterLimit` fallback to bevel), bevel, round
  - Cap insertion: flat, square, triangle, round (arc split at ≤60° per segment)
  - Closed-contour output: two annular contours (outer CCW + inner CW)
  - Open-contour output: single closed loop (outer + end-cap + inner reversed + start-cap)
- `bakeStrokeForGlyph(source, options)`: bridge from offsetter to `SlugGlyphData`; returns `null` for advance-only glyphs
- `buildGpuGlyph.ts`: shared contour→GPU pipeline used by fontParser, strokeOffsetter, and future SVG path support

### Performance

- `curveTexture` RGBA16F (8 B/texel vs 16); `bandTexture` RG32F — ~45% smaller baked files, ~20% GPU time reduction
- Band count 8→16: halves average curves per band (~6.3→~3.2); shader wraps post-rootCode work in `If(rootCode > 0)`, skipping ~30% of curves
- `MAX_CURVES_PER_BAND` reduced 64→40 based on full Inter corpus analysis (p999 = 25, max = 38)
- Stroke shader Newton seed count reduced from 3 seeds×3 iterations to 1 seed×3 iterations — halves WGSL size and first-compile stall

### Bug fixes

- `SlugText` defers `visible=true` until first `_rebuild` to avoid zero-size WebGPU buffer errors on R3F's pre-useFrame render pass
- Runtime shapers pass `{ features: [] }` to opentype.js to prevent `liga`/`rlig` ligature substitution from collapsing whitespace at wrap points
- `parseFont` emits advance-only glyph entries (empty curves, real `advanceWidth`) for cmap'd glyphs without outlines (space, tab, zero-width controls)
- `SlugStackText.dispose()` now tears down outline child meshes and `SlugStrokeMaterial`s before disposing shared geometry
- Kerning extraction filters to source IDs only, preventing crash when stroke-offset glyph IDs are resolved via opentype.js

### Examples

- `examples/three/slug-text` and `examples/react/slug-text` maintained in 1:1 parity
- Canvas2D comparison overlay with onion-skin, split, and diff modes
- Measure overlay: hover any rendered line to see ink + font-envelope bounds; paragraph monitors (block w/h/lines)
- Outline controls: style (Fill / Outline / Both), width slider, color picker — all runtime-uniform, zero rebuild
- Font stack demo: Lorem text (single font) and Icons scene (Inter + Font Awesome Solid stack) with per-codepoint fallback
- Compare overlay uses `stack.wrapText` in icons mode for line-break agreement with `SlugStackText`
- Migrated from Web Awesome controls to `@three-flatland/tweakpane` in both examples

### BREAKING CHANGES

- **`BAKED_VERSION` 2→3**: `curveTexture` format changed to RGBA16F and `bandTexture` to RG32F. Existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`.
- **`BAKED_VERSION` 3→4**: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) added to `BakedJSON.metrics`. Existing baked files must be re-baked.
- **`SlugFontLoader.clearCache` removed**: the static cache is already keyed on `url:runtime?`; the method is gone with no replacement.

`@three-flatland/slug` provides a complete analytic GPU text rendering stack — from offline font baking through runtime shaping, measurement, decorations, and outline/stroke — targeting WebGPU exclusively via TSL node materials.

