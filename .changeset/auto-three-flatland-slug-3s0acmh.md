---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New package: `@three-flatland/slug`

WebGPU/TSL analytic text renderer using ray-band intersection for per-fragment coverage — no SDF atlas, no MSAA needed.

### Core rendering
- New `SlugFont`, `SlugGeometry`, `SlugMaterial`, `SlugText` classes for Three.js
- Font parsing pipeline: glyph extraction, bezier curve decomposition, band-based spatial acceleration structure
- TSL shader computes analytic coverage per fragment via quadratic ray-curve intersection
- React subpath (`three-flatland/react`) with R3F-compatible class registrations
- Dynamic dilation on `SlugMaterial` quads for sub-pixel correctness at small sizes
- Endpoint sharing in texture packing reduces curve texture footprint
- `slugDilate` shader node for dilated quad geometry

### Baked fonts (pre-processing pipeline)
- `slug-bake` CLI tool converts `.ttf` fonts to `.slug.bin` + `.slug.json` assets
- `SlugFontLoader` supports both runtime (opentype.js, lazy-loaded) and pre-baked loading paths
- `textShaperBaked` dispatches layout from baked glyph data without opentype.js at runtime

### Text layout API
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches on baked vs runtime path; uses opentype-derived advances for accurate line breaks at all sizes

### Text measurement API
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-compatible fields (`width`, `actualBoundingBox*`, `fontBoundingBox*`); O(1) per call using pre-computed glyph bounds
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line measurement matching `SlugText` default `lineHeight: 1.2`

### Rendering quality
- Stem darkening and thickening options on `SlugMaterial` and `SlugText` for improved legibility at small sizes
- Updated coverage calculations for stem weight modulation
- Fixed `LINE_EPSILON` in font parser for correct curve classification at glyph boundaries

### Performance
- `curveTexture` → `RGBA16F`: halves texture bandwidth (8 bytes/texel vs 16); half-float mantissa is subpixel-accurate across all realistic display sizes
- `bandTexture` → `RG32F`: eliminates two wasted float channels per texel
- `MAX_CURVES_PER_BAND` reduced 64 → 40 based on full Inter corpus analysis (p999 = 25, max = 38); reduces shader register pressure; bake-time warning if any band exceeds bound
- `bandCount` increased 8 → 16: roughly halves expected curves per band (mean ~3.2 vs 6.3), reducing per-fragment ALU proportionally
- Shader skips sqrt + divisions for ~30% of curves per band via `If(rootCode > 0)` guard

### Examples
- Three.js + React slug-text examples with Canvas2D comparison overlay (onion skin, split, and diff modes)
- Draggable split handle; diff mode renders luminance-weighted heatmap against WebGPU canvas
- Measure example: click lines to select; cyan ink bounds + dashed yellow font-envelope overlays; paragraph monitors update live
- Both examples use Tweakpane for settings/mode controls with GPU stats

### Bug fixes & housekeeping
- Fixed baked measure returning zero ink bounds (incorrect `curves.length > 0` heuristic replaced with `xMax > xMin` bounds-area check)
- Fixed `three` peer dependency to use workspace catalog version
- Added `analyze-bands.ts` and `inspect-bounds.ts` scripts for corpus analysis

### BREAKING CHANGES
- `BAKED_VERSION` bumped 2 → 3; existing `.slug.bin`/`.slug.json` files must be re-processed with `slug-bake` (baked assets are ~45% smaller on disk: 13 MB → 7.1 MB for Inter Regular)

Initial release of `@three-flatland/slug` — a fully analytic WebGPU text renderer with runtime and pre-baked font paths, text layout/measurement APIs, stem darkening, and substantial GPU bandwidth and ALU optimizations.
