---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New APIs

- `SlugText` — WebGPU instanced-mesh text renderer backed by analytic curve coverage; supports font, fontSize, color, alignment, maxWidth, lineHeight
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line ink and font-envelope metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block dimensions respecting the same lineHeight default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-breaking using the same baked/runtime dispatch as `shapeText`
- `SlugFontStack(fonts)` — per-codepoint font fallback chain; `resolveCodepoint` walks the chain; `resolveText` yields per-character font assignments
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — stack-aware wrap matching `SlugStackText` line breaks for Canvas2D overlays
- `SlugStackText` — multi-font `Group` with one `InstancedMesh` per stack entry; one draw call per contributing font
- `SlugStackText.styles` — `StyleSpan[]` underline/strike on multi-font text; decoration line anchored to primary font metrics
- `SlugStackText.outline` — `SlugOutlineOptions` parity with `SlugText.outline`; one stroke mesh per font, shared `instanceMatrix`
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugText.outline` / `setOutlineWidth` / `setOutlineColor` — opt-in stroke via child `InstancedMesh` sharing fill geometry; runtime-uniform updates (no rebuild)
- `SlugText.setOpacity(value)` — fill opacity setter for Outline-only mode
- `SlugStrokeMaterial` — TSL `NodeMaterial` using `distanceToQuadBezier` coverage; exported from package root alongside `SlugOutlineOptions`
- `StyleSpan { start, end, underline?, strike? }` — text decoration API; one rect per (line, kind, contiguous run) via `emitDecorations` pipeline
- `SlugFont.hasCharCode(c)` — codepoint coverage check for fallback routing
- `SlugFont.emitDecorations(text, positioned, styles, fontSize)` — decoration rect emission from a single font
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`
- `slug-bake` CLI tool with `--output / -o` flag; produces `.slug.json` + `.slug.bin` baked font assets

## Performance

- Band count 8 → 16: halves expected curves per band (~6.3 → ~3.2 mean), reducing per-fragment ALU in the hot loop
- Shader skips post-root solve for curves that don't cross the ray (~30% of curves in typical bands)
- `curveTexture` switched to RGBA16F (half-float, 8 bytes/texel vs 16); `bandTexture` to RG32F
- `MAX_CURVES_PER_BAND` 64 → 40 (covers 100% of Inter's 2849-glyph corpus); reduces shader register pressure
- Runtime measurement reads pre-computed `SlugGlyphData.bounds` instead of iterating path commands per call

## Bug Fixes

- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — disables `liga`/`rlig` substitution that collapsed token arrays and caused whitespace drift at wrap points
- `SlugText._setFont` defers `visible=true` until after `_rebuild` writes real glyph data, preventing a WebGPU "Binding size is zero" rejection on R3F's first render pass
- Outline quad expansion hoisted out of `slugDilate` and applied axis-aligned in vertex shader — fixes stroke clipped/squared off at glyph extents when using diagonal normal expansion
- Newton solver reduced to single seed (t=0.5) + 3 iterations + 2 endpoints, cutting WGSL size ~50% and eliminating multi-hundred-millisecond pipeline compile stall on first outline enable
- `SlugText._setFont` only rebuilds the outline mesh when outline was already enabled — avoids GPU resource cost for users who never use outlines
- `parseFont` emits advance-only glyph entries for space, tab, and zero-width controls so `shapeStackText` resolves correct advances for whitespace regardless of runtime vs baked path
- Baked measure gates ink accumulation on bounds area (`xMax > xMin`) instead of `curves.length > 0` — fixes zero ink bounds on the baked path

## Refactors

- Shared `buildGpuGlyph.ts` pipeline module: `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph` — uniform GPU record shape across font parser, SVG shape, and stroke offsetter producers
- `SlugFontStack.emitDecorations()` uses a `WeakMap` keyed on positioned-glyph objects to disambiguate same-glyph-id glyphs across fonts with different advances
- `emitDecorations` pipeline gains a function-callback variant for the advance lookup; legacy `Map` signature unchanged
- Removed `BAKED_VERSION` machinery from `SlugFontLoader` (pre-release, no migration story)
- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`

## Examples

- Both React and Three.js examples maintain 1:1 feature parity throughout
- Canvas2D comparison overlay with onion skin, split handle, and diff (luminance heatmap) modes
- Hover-to-measure overlay with cyan ink bounds and dashed yellow font envelope; Tweakpane monitors for width/ascent/descent/paragraph dimensions
- [Lorem | Icons] radio toggle: `'lorem'` renders `SlugText`; `'icons'` renders `SlugStackText` with [Inter, FA-Solid] stack and matching `@font-face` fallback in Canvas2D
- Styles folder: underline/strike `StyleSpan` presets (first word / sentence / line)
- Outline folder: Fill / Outline / Both radio + live width slider + color picker
- FA-Solid icon subset baked with `slug-bake` (~71KB bin); TTF served only for Canvas2D `@font-face`
- Migrated from Web Awesome controls to `@three-flatland/tweakpane` (Settings + Mode folders, stats monitor)
- `antialias: false` on renderer — Slug's analytic per-fragment coverage makes MSAA a pure cost with no visual benefit

Adds the full `@three-flatland/slug` text rendering library: analytic WebGPU/TSL glyph rendering, baked font pipeline, measurement, decorations, multi-font stacks, and runtime outlines.

