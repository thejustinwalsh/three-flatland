---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### Initial package

- Full analytic WebGPU text rendering pipeline: font parsing (OpenType via opentype.js), text shaping, GPU curve + band texture packing
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — core rendering classes
- Analytic per-fragment winding-number coverage via TSL shaders (WebGPU only, no GLSL)
- Stem darkening and thickening options on `SlugMaterial` / `SlugText`

### Baked fonts

- `slug-bake` CLI: bakes OpenType fonts to `.slug.{json,bin}` for zero-opentype.js runtime cost
- `SlugFontLoader`: async font loading, dispatches to baked or runtime path transparently
- `slug-bake --output / -o`: custom output base path

### Performance

- `curveTexture` → RGBA16F, `bandTexture` → RG32F: ~45% smaller baked files, ~20% less GPU bandwidth
- `MAX_CURVES_PER_BAND` 64 → 40 based on corpus analysis; bake-time warning when exceeded
- `bandCount` 8 → 16: halves expected curves/band and per-fragment ALU
- Shader: skip post-rootCode work for non-crossing curves (~30% of per-band curves)

### Text layout

- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` (runtime + baked paths)
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` (Canvas2D-aligned field names)
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics`
- Runtime shapers pass `{ features: [] }` to opentype.js to prevent liga/rlig collapsing word-boundary chars

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` API
- `pipeline/decorations.ts`: post-pass over shaped glyphs producing `DecorationRect[]`
- `SlugGeometry.setGlyphs` appends decoration rects as sentinel instances; fragment shader short-circuits to full coverage
- `SlugText` accepts `styles?: StyleSpan[]`

### Font stacks

- `SlugFontStack(fonts)`: per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`
- `SlugFont.hasCharCode(c)`: codepoint coverage check for per-codepoint fallback routing
- `pipeline/textShaperStack.ts`: wrap-aware multi-font shaper preserving kerning within same-font runs
- `SlugStackText`: `Group` renderable with one `InstancedMesh` per contributing font

### SlugStackText parity

- `SlugStackText.styles`: underline/strike spans via `SlugFontStack.emitDecorations()`
- `SlugStackText.outline`: sibling `SlugStrokeMaterial` mesh per font; `setOutlineWidth` / `setOutlineColor`
- `SlugStackText.setOpacity()`: forwards to all per-font fill materials
- `SlugStackText.dispose()`: properly tears down outline meshes before disposing fill `InstancedMesh`es

### Outline / stroke rendering

- `distanceToQuadBezier` TSL shader: Newton refinement from a single seed + endpoints (3 candidates); compile cost ~halved vs 5-candidate variant
- `slugStroke` fragment shader: distance-to-curve per band, bevel-via-min joins
- `SlugStrokeMaterial`: mirrors `SlugMaterial` layout; uniform surface: `color`, `opacity`, `strokeHalfWidth`
- `SlugText.outline`: child `InstancedMesh` sharing fill geometry; `setOutlineWidth` / `setOutlineColor` / `setOpacity()`
- `SlugOutlineOptions.color` accepts `number | string | Color`
- Axis-aligned quad expansion in `SlugStrokeMaterial` vertex shader (fixes stroke clipping at glyph extents)
- `SlugStrokeMaterial` and `SlugOutlineOptions` exported from package root

### Stroke offsetter

- `pipeline/strokeOffsetter.ts`: adaptive quadratic subdivision, per-segment Tiller-Hanson offset, join insertion (miter/round/bevel with miterLimit fallback), cap insertion (flat/square/triangle/round)
- `strokeOffsetter(curves, closed, options)` returns closed contours ready for the fill pipeline
- `bakeStrokeForGlyph(source, options)`: bridges offsetter to `buildGpuGlyphData` for CLI bake and future runtime fallback
- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit`: baked stroke set generation
- `BakedJSON.strokeSets?`: optional metadata for fonts baked with stroke flags; absent for non-stroke bakes (backward compatible)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)`: looks up pre-baked stroke glyph data

### Pipeline refactoring

- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` extracted to `pipeline/buildGpuGlyph.ts`; fontParser and strokeOffsetter both consume the shared factory
- `parseFont` emits advance-only glyph entries (real `advanceWidth`, empty bounds) for cmap'd glyphs with no outline (space, tab, zero-width controls)
- `BAKED_VERSION` compatibility machinery removed from `SlugFontLoader`

### Bug fixes

- `SlugText._setFont`: defer `visible=true` until first `_rebuild` — prevents WebGPU "binding size is zero" rejection on R3F render before first frame
- `SlugText._setFont`: only rebuild outline when already enabled
- Font stack compare overlay uses `stack.wrapText` for line-break parity with `SlugStackText` at any `maxWidth`

### Examples

- React + Three.js slug-text examples maintain 1:1 feature parity throughout
- Canvas2D compare overlay (onion-skin / split / diff modes) with draggable split handle in both examples
- Icon demo: 12-glyph FA-Solid PUA subset baked with `slug-bake`; `@font-face` fallback for Canvas2D comparison
- Compare mode `'off'` hides overlay and skips all Canvas2D work
- Click/hover-to-measure: cyan ink bounds + dashed yellow font-envelope overlays, Tweakpane monitors

`@three-flatland/slug` introduces a complete analytic WebGPU text rendering pipeline — from font parsing and baking through multi-font stacks, text decorations, measurement APIs, and stroke/outline support with a build-time quadratic-Bezier stroke offsetter.
