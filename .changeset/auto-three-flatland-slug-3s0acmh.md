---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

### Stroke rendering (Phase 4 + Phase 5)

- `SlugText.outline` — opt-in text outline backed by a child `InstancedMesh` sharing the fill geometry; `setOutlineWidth` / `setOutlineColor` update uniforms at zero rebuild cost
- `SlugStrokeMaterial` — TSL NodeMaterial for stroke rendering; analytic `distanceToQuadBezier` fragment shader with bevel-via-min joins; sub-pixel strokes widen to a 1px minimum
- Stroke quad expansion fixed to axis-aligned growth `(W + 2·hw) × (H + 2·hw)` — previous diagonal expansion clipped the outer ring at glyph extents
- Shader compile cost halved by reducing Newton seeds (3 → 1 at t=0.5 + two endpoints); ~⅔ drop in per-fragment GPU cost
- `SlugOutlineOptions.color` accepts `number | string | Color`
- `SlugText.setOpacity(value)` — fade fill independently for outline-only mode
- `SlugStackText.outline` — per-font stroke meshes (one `SlugStrokeMaterial` per font in the stack); `setOutlineWidth` / `setOutlineColor` work uniformly
- `SlugStackText.styles` — underline / strikethrough spans on multi-font stack text; decorations attach to the primary font mesh
- `SlugStackText.setOpacity(value)` — forwards to every per-font fill material
- `SlugStackText.dispose()` — now correctly tears down outline meshes before shared geometry disposal, preventing GPU leaks on scene toggling
- Stroke-set bake: `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroked glyphs packed at `glyphIdOffset + sourceId` in the same curve + band textures as fills
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — runtime lookup for pre-baked stroke glyphs
- `BakedJSON.strokeSets` optional field; absent for fonts baked without stroke flags (backward compatible)

### Quadratic-Bezier stroke offsetter (Phase 5 pipeline, `pipeline/strokeOffsetter.ts`)

- Adaptive subdivision — angle-based criterion `α_max = √(8·ε/halfWidth)`; flatness shortcut for linear segments; recursion cap at depth 8
- Per-segment offset via Tiller-Hanson construction; right-hand normal convention matches CCW font outlines
- Join geometry: bevel (1 quad), miter (2 quads, falls back to bevel when `miterLength > miterLimit · hw`), round (≤60°/segment arcs)
- Cap geometry for open contours: flat, square, triangle, round
- `strokeOffsetter(curves, closed, options)` — full orchestrator; closed source → two contours (outer CCW + inner CW annular ring); open source → single closed contour
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter to `buildGpuGlyphData`; returns `null` for advance-only glyphs

### Text measurement

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned fields; constant per-call cost via pre-computed bounds
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience wrapper
- Baked path: bounds-area gate `(xMax > xMin)` replaces broken `curves.length > 0` heuristic that returned zero ink bounds for all baked glyphs

### Font stack / multi-font support

- `SlugFontStack(fonts)` — ordered font chain; `resolveCodepoint` / `resolveText` for per-codepoint font assignment
- `SlugFont.hasCharCode(c)` — codepoint coverage check (cmap lookup)
- `pipeline/textShaperStack.ts` — wrap-aware multi-font shaper; preserves kerning within same-font runs
- `SlugStackText` — `Group` subclass with one `InstancedMesh` per font; single draw call per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break-consistent with `SlugStackText` output for Canvas2D overlays / DOM mirrors
- `SlugFontStack.emitDecorations()` — per-glyph advance lookup via `WeakMap` keyed on positioned-glyph object

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` public API
- `pipeline/decorations.ts` — `emitDecorations` post-pass; one rect per (line, kind, contiguous run); rect sentinel `glyphJac.w = -1` short-circuits coverage in fragment shader
- `SlugFont.emitDecorations` thin wrapper using font-declared metrics
- `SlugGeometry.setGlyphs` accepts optional `decorations` array rendered in the same draw call
- `SlugText.styles` — constructor + runtime setter

### Other library additions

- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` (baked + runtime paths); used by Canvas2D comparisons to match Slug line breaks
- `slug-bake --output / -o` — custom output base path
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared pipeline module (`pipeline/buildGpuGlyph.ts`) used by fontParser, stroke offsetter, and future SVG path support
- `parseFont` emits advance-only entries for cmap'd no-outline glyphs (space, tab, zero-width controls)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` collapsing whitespace tokens and misaligning word-boundary checks
- `SlugText._setFont` defers `visible=true` until after first `_rebuild`, preventing zero-size binding errors on R3F's pre-frame render
- `SlugFontLoader`: removed `BAKED_VERSION` version-gate machinery (no migration story pre-release)

## Performance

- `curveTexture` format: `RGBA32F` → `RGBA16F` — 8 bytes/texel vs 16; half-float precision sufficient for em-space coordinates
- `bandTexture` format: `RGBA32F` → `RG32F` — removes two wasted float channels
- `MAX_CURVES_PER_BAND`: 64 → 40 — covers 100% of Inter's glyph corpus (p999 = 25, max = 38); reduces register pressure
- `bandCount`: 8 → 16 — halves expected curves/band (~6.3 → ~3.2 mean); fragment ALU scales linearly
- Shader: wraps `rootCode > 0` guard around per-curve solve + coverage work; ~30% of curves skip the hot path
- `BAKED_VERSION` bumped 2 → 3 (texture format change); included fixtures re-baked (~45% smaller on disk)

## Bug fixes

- Stroke quad corners no longer clip square at glyph extents (axis-aligned expansion)
- Shader pipeline compile hitch on first outline-enable resolved (~50% smaller WGSL)
- `SlugText._setFont` no longer rebuilds outline when outline is not enabled
- Kerning extraction filters to source glyph IDs only — prevents `this.font._push is not a function` when stroke IDs fall outside opentype's known range

## Examples

- `examples/three/` and `examples/react/` slug-text examples at 1:1 feature parity throughout
- Canvas2D compare overlay with onion / split / diff / off modes and draggable split handle
- Measure overlay: click a rendered line to show cyan ink bounds + dashed yellow font-envelope; paragraph monitors (block w / h / lines)
- Icons mode: Font Awesome Solid PUA codepoints baked with `slug-bake`; Canvas2D compare uses `stack.wrapText` for matching line breaks
- Styles folder: underline / strikethrough presets (first word / sentence / line)
- Outline folder: Fill / Outline / Both radio + width slider + color picker; live updates at zero rebuild cost
- `DprSync` component (React): syncs `gl.setPixelRatio` on monitor swap / OS zoom / fullscreen
- Fullscreen + monitor-swap DPR resync via `(resolution: Ndppx)` media query + `fullscreenchange` event
- Compare `Off` mode hides overlay entirely for clean screenshots
- Tweakpane-based controls replacing Web Awesome in both examples
- `antialias: false` on renderer — analytic coverage makes MSAA redundant
- Relocated `examples/vanilla/slug-text` → `examples/three/slug-text`

Adds a complete analytic GPU text rendering library (`@three-flatland/slug`) with baked + runtime font paths, multi-font stacking, text measurement, decorations, and stroke/outline rendering backed by a quadratic-Bezier offsetter pipeline.

