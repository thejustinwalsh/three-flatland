---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## Core rendering pipeline

- New `@three-flatland/slug` package — analytic GPU text rendering via WebGPU + TSL
- `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` — foundational rendering classes
- TSL fragment shader with winding-number coverage and dynamic quad dilation
- `slug-bake` CLI pre-processes fonts into `.slug.bin` + `.slug.json` baked format
- `SlugFontLoader` for loading baked or runtime fonts
- Baked text shaper (`textShaperBaked`) — runtime rendering with no opentype.js dependency

## Performance

- RGBA16F curve texture (8 bytes/texel vs 16) + RG32F band texture — ~20% GPU time reduction
- `MAX_CURVES_PER_BAND` 64 → 40 based on Inter corpus analysis (p999 = 25, max = 38)
- `bandCount` 8 → 16, halving expected curves per band; band texture ~1.5× larger on disk
- Skip non-crossing curves in shader (`If(rootCode > 0)`) — ~30% of curves bypass expensive sqrt/divisions
- `packages/slug/scripts/analyze-bands.ts` added for future tuning

## Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break output matching shaped rendering
- Baked path bounds fix: was returning zero ink bounds for every glyph (gates on `xMax > xMin` now)
- Runtime measure reads pre-computed `SlugGlyphData.bounds` — constant cost regardless of glyph complexity

## Stem darkening

- `SlugMaterial` + `SlugText` gain `stemDarkening` and `thickening` options
- Coverage calculation updated to support thickening pass

## Text decorations

- `StyleSpan` type with `underline`, `strike`, `scriptLevel` (reserved) fields
- `pipeline/decorations.ts` — post-pass over shaped glyphs, emits one `DecorationRect` per contiguous styled run per line
- `SlugGeometry.setGlyphs` accepts optional `decorations` array; appended as rect-sentinel instances
- `SlugMaterial` detects rect sentinel (`glyphJac.w = -1`) and short-circuits coverage to 1
- `SlugText` accepts `styles?: StyleSpan[]` in constructor and as a runtime setter
- Font decoration metrics sourced from OpenType `post` + `os2` tables; included in `BakedJSON.metrics`

## Font fallback stack

- `SlugFontStack(fonts: SlugFont[])` — per-codepoint fallback chain; first covering font wins
- `SlugFont.hasCharCode(c)` — codepoint coverage check (cmap-backed for both baked and runtime fonts)
- `SlugStackText extends Group` — multi-font renderable with one `InstancedMesh` per font in the stack
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint font resolution with same wrap policy as `shapeStackText`
- `parseFont` now emits advance-only glyph entries for whitespace/control codepoints (space, tab, zero-width)
- Runtime shapers pass `{ features: [] }` to opentype's `stringToGlyphs` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` shrinking the returned array
- `SlugText._setFont` defers `visible = true` until first `_rebuild` — prevents zero-binding WebGPU errors in R3F
- `slug-bake` gains `--output / -o` flag for custom output path

## Outline / stroke rendering (Phase 4)

- `distanceToQuadBezier` — TSL + CPU reference for closest-point-on-quadratic-Bezier with Newton refinement
- `slugStroke` fragment shader — analytic stroke coverage using bevel-via-min exterior joins
- `SlugStrokeMaterial` — `NodeMaterial` parallel to `SlugMaterial`; shares instance-attribute layout and MVP/viewport uniforms
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; runtime-uniform `width` and `color`
- `SlugText.setOpacity(value)`, `setOutlineWidth(v)`, `setOutlineColor(v)` — zero-rebuild runtime setters
- `SlugOutlineOptions` exported from package root
- Fix: stroke quad now expands axis-aligned by `strokeHalfWidth` before AA dilation — was clipping stroke outer ring at glyph bbox extents
- Halved stroke shader compile cost: single Newton seed (was 3) cuts WGSL size ~50% and pipeline stall on first draw

## SlugStackText parity (Phase 4)

- `SlugStackText.styles` — underline/strikethrough spans; decoration rects use primary font metrics
- `SlugFontStack.emitDecorations()` — per-glyph advance lookup via `WeakMap` to disambiguate same glyphId across fonts
- `SlugStackText.outline` — per-font `SlugStrokeMaterial` child meshes; `setOutlineWidth` / `setOutlineColor` setters
- `SlugStackText.setOpacity(value)` — forwards to every per-font fill material
- `SlugStackText.dispose()` — fixed to tear down outline meshes before disposing shared geometries

## Pipeline refactor

- `pipeline/buildGpuGlyph.ts` — centralized curves→GPU record builder shared by fontParser, SlugShape, and strokeOffsetter
- Exports: `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`

## Example improvements

- React + Three examples always kept at 1:1 parity
- Canvas2D comparison overlay ported to React: onion / split / diff modes, draggable split handle, luminance-weighted diff heatmap
- Compare mode gains `Off` option — hides overlay for clean screenshots
- `<DprSync>` R3F component re-syncs DPR after monitor swap / fullscreen transitions
- `relayout()` helper in Three example routes resize + DPR media query + fullscreenchange through one path
- FA-Solid icon demo: 12-icon PUA subset baked with `slug-bake`; Canvas2D `@font-face` fallback for overlay parity
- `useWindowSize` now tracks `{ w, h, dpr }` and subscribes to `(resolution: Ndppx)` media query
- `fullscreenchange` listener added alongside `resize`; re-measures immediately + one RAF later
- Renderer `antialias: false` — Slug provides analytic per-fragment coverage; MSAA is pure overhead
- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3** (half-float + RG32F textures): existing `.slug.bin`/`.slug.json` files must be re-baked
- **BAKED_VERSION 3 → 4** (decoration metrics in `BakedJSON.metrics`): re-bake required
- `SlugFontLoader.clearCache` removed — cache is keyed on `url:runtime?` and does not need manual clearing

This release adds the complete `@three-flatland/slug` package: GPU-analytic text rendering with baked and runtime font paths, measurement and decoration APIs, per-codepoint font fallback stacks, and a TSL analytic stroke renderer with runtime-uniform width and color.
