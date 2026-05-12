---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

### Text Rendering Pipeline
- Initial WebGPU/TSL rendering pipeline: font parsing, text shaping, GPU texture packing
- Analytic per-fragment coverage — MSAA not needed; `antialias: false` recommended
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`
- Dynamic quad dilation for pixel-accurate AA

### Font Loading & Baking
- `slug-bake` CLI tool for pre-baking fonts to `.slug.{json,bin}`
- `slug-bake --output / -o` flag for custom output path
- Baked format version progression (2→3→4); included fixtures re-baked at each bump
- `SlugFontLoader` loads baked or runtime fonts via the same API

### Text Layout & Measurement
- `SlugFont.wrapText(text, fontSize, maxWidth?) → string[]` — wrap-aware line splitter
- `SlugFont.measureText(text, fontSize) → TextMetrics` — aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, opts) → ParagraphMetrics` — multi-line block metrics
- Fix: baked measure now uses bounds-area gate (was returning zero ink bounds on baked path)

### Font Stacks
- `SlugFontStack(fonts)` — per-codepoint fallback chain; first covering font wins
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check
- `SlugFontStack.wrapText(text, fontSize, maxWidth?) → string[]` — line breaks matching `SlugStackText` output
- `SlugStackText` — multi-font `Group` renderable with one `InstancedMesh` per font

### Text Decorations
- `StyleSpan { start, end, underline?, strike? }` API on `SlugText` and `SlugStackText`
- Decoration metrics sourced from OpenType post/os2 tables and baked into `BakedJSON.metrics`

### Outline / Stroke
- `SlugStrokeMaterial` — TSL NodeMaterial with runtime-uniform `strokeHalfWidth`, `color`, `opacity`
- `SlugText.outline: SlugOutlineOptions` — opt-in child `InstancedMesh` sharing fill geometry; zero rebuild for width/color changes
- `SlugText.setOpacity()`, `setOutlineWidth()`, `setOutlineColor()` — runtime-uniform setters
- `SlugOutlineOptions` exported from package root
- Fix: axis-aligned quad expansion for outlines (diagonal-normal expansion was clipping stroke at glyph extents)
- Stroke shader compile time halved by reducing Newton seeds (3 seeds → 1 + endpoints); per-fragment cost reduced ~⅔
- `SlugStackText.outline`, `styles`, `setOpacity()` — parity with `SlugText`

### Stroke Offsetter (Phase 5 foundation)
- Quadratic-Bezier stroke offsetter: adaptive subdivision → per-segment offset → join geometry (bevel/miter/round) → cap geometry (flat/square/triangle/round) → closed-contour stitching
- `bakeStrokeForGlyph(source, options) → SlugGlyphData | null`
- `slug-bake` stroke flags: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit`
- `BakedJSON.strokeSets` optional field for pre-baked stroke variants
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — lookup pre-baked stroke glyphs

### Pipeline Improvements
- Shared `buildGpuGlyph.ts` — single factory for font parser, SVG shapes, and stroke offsetter output
- `curveTexture` → RGBA16F; `bandTexture` → RG32F; `MAX_CURVES_PER_BAND` 64→40; ~45% smaller `.slug.bin` files
- `bandCount` 8→16 — roughly halves curves per band; fragment ALU cost scales linearly
- Shader skips post-rootCode work for non-crossing curves (~30% of curves in a band)

### Examples
- React slug-text example added (1:1 parity with Three.js example throughout)
- Vanilla example renamed to `examples/three/slug-text`
- Canvas2D comparison overlay with onion / split / diff / off modes
- Measure overlay (hover-to-measure) with `TextMetrics` monitors
- Styles folder demonstrating `StyleSpan` underline/strikethrough
- Outline folder with runtime width + color + Fill/Outline/Both mode
- Icons mode: Font Awesome Solid baked subset rendered via `SlugStackText`

## Bug Fixes
- `SlugText._setFont`: visibility deferred to first `_rebuild` — prevents WebGPU pipeline error on uninitialized buffer
- `SlugStackText.dispose()`: outline meshes and stroke materials now properly torn down
- `parseFont`: advance-only glyph entries emitted for space, tab, and zero-width controls
- Runtime shapers pass `{ features: [] }` to opentype.js — prevents liga/rlig collapsing whitespace at wrap points
- `SlugFontLoader`: removed `BAKED_VERSION` compatibility machinery (pre-release, no migration needed)
- `SlugText._setFont`: outline rebuilt only when already enabled — avoids GPU cost for fill-only users

## Performance
- GPU texture bandwidth reduced ~50% via RGBA16F curve texture and RG32F band texture
- Band count doubled (8→16) — roughly halves curves-per-band in typical text
- Stroke shader compile time halved; per-fragment ALU cost reduced ~⅔

Introduces the complete `@three-flatland/slug` WebGPU/TSL analytic text rendering package: font parsing, baking pipeline, text layout/measurement, underline/strikethrough decorations, runtime outlines, font-stack fallback for mixed-font rendering, and a quadratic-Bezier stroke offsetter as the Phase 5 baked-stroke foundation.

