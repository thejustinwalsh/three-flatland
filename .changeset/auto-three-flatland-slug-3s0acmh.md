---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText` (width, actual/font bounding boxes)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line over `wrapText`; line height matches `SlugText` default (1.2)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line wrapping using Slug's break-at-last-space + hard-break-fallback policy
- `SlugFont.hasCharCode(c)` — codepoint coverage check via cmap
- `SlugFontStack(fonts)` — ordered per-codepoint font fallback chain; `resolveCodepoint` returns first covering font index
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — wrap with per-codepoint font resolution, matching `SlugStackText` line breaks
- `SlugStackText` — multi-font renderable; one `InstancedMesh` per font, single draw call per contributing font
- `SlugStackText.styles` — `StyleSpan[]` underline/strike parity with `SlugText`
- `SlugStackText.outline` — `SlugOutlineOptions` parity; one stroke mesh per font sharing fill geometry
- `SlugStackText.setOpacity(v)` — forwards to all per-font fill materials
- `SlugText.outline` — opt-in child `InstancedMesh` behind fill, sharing `instanceMatrix`; no geometry copy
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(c)` — runtime uniform update, zero rebuild
- `SlugText.setOpacity(v)` — for fill-only / outline-only compositing
- `SlugOutlineOptions` exported from package root
- `StyleSpan { start, end, underline?, strike? }` — text decoration spans (Slug §2.7/§2.8)
- `SlugStrokeMaterial` — stroke NodeMaterial with `distanceToQuadBezier` fragment coverage; exported from package root
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — lookup pre-baked stroke glyph from loaded `strokeSets`

## Stroke Offsetter Pipeline (Phase 5, Tasks 16–17)

- Quadratic-Bezier stroke offsetter built in six steps:
  - Adaptive subdivision — angle-based flatness criterion (`α_max = sqrt(8·ε/halfWidth)`), max depth 8
  - Per-segment offset via Tiller-Hanson (right-hand normal; parallel tangent falls back to midpoint)
  - Join insertion — bevel (1 quad), miter (2 quads, falls back to bevel when length exceeds `miterLimit`), round (≤60°/segment arcs)
  - Cap insertion — flat, square, triangle, round; closed contours skip caps
  - Contour stitching — closed source: outer CCW + inner CW (annular ring); open source: single closed loop
- `bakeStrokeForGlyph(source, options)` — runs offsetter on each source contour, packs result via `buildGpuGlyphData`; returns `null` for advance-only glyphs
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- Baked format: optional `BakedJSON.strokeSets` array; absent when no stroke flags used — old fixtures load unchanged
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU factory extracted from fontParser; used by fontParser, bake CLI, and stroke offsetter
- `unitTangentAt(curve, t)` — exported helper for offsetter, joins, and caps
- `distanceToQuadBezier` — pure-JS and TSL reference; Newton from seeds {0, 0.5, 1} × 3 iterations; 5-candidate min (seeds + endpoints)

## Performance

- Band count 8 → 16 — halves mean curves/band (~6.3 → ~3.2); per-fragment ALU roughly halved
- Fragment shader non-crossing early-exit: `If(rootCode > 0)` skips sqrt/divide/saturate for ~30% of curves in a band
- `curveTexture` → RGBA16F (half-float): 8 bytes/texel vs 16; em-space coords within half-float precision at all rendering sizes
- `bandTexture` → RG32F: 8 bytes/texel vs 16 (old format wasted 2 of 4 channels)
- `MAX_CURVES_PER_BAND` 64 → 40 — matches Inter corpus p999 (38), reduces shader register pressure
- Baked `.slug.bin` size reduced ~45% (Inter-Regular: 13 MB → 7.1 MB)
- Stroke shader Newton seeds reduced to 1 (from 3) + 3 iterations; roughly halves WGSL compile time and per-fragment GPU cost on first outline-enable

## Rendering / Pipeline

- `fontParser` emits advance-only glyph entries (empty curves, real `advanceWidth`) for no-outline cmap'd glyphs (space, tab, zero-width controls)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents ligature substitution from drifting word-boundary checks at wrap points
- `SlugText._setFont` defers `visible = true` until first `_rebuild` — prevents WebGPU "binding size is zero" error on R3F first render before geometry is initialized
- `SlugMaterial` / `SlugGeometry`: decoration rect sentinel (`glyphJac.w < 0`) appends underline/strike instances in the same draw call
- `SlugStackText.dispose()` tears down outline meshes before fill instances, then disposes geometries, then clears internal arrays
- `SlugFontLoader`: removed `BAKED_VERSION` migration machinery
- Stem darkening and thickening hinting options added to `SlugMaterial` / `SlugText`
- Dynamic dilation in `SlugMaterial` for accurate quad coverage at all scales

## CLI

- `slug-bake` gains `--output` / `-o` for custom output path base
- Bake-time warning when any band exceeds `MAX_CURVES_PER_BAND`
- Kerning extraction now filters to source glyph IDs only (stroke offset IDs are out of opentype.js's range)

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: `curveTexture` changed to RGBA16F, `bandTexture` to RG32F — existing `.slug.bin` / `.slug.json` files must be re-baked
- **BAKED_VERSION 3 → 4**: `BakedJSON.metrics` now includes decoration metrics (underline/strikethrough positions and thicknesses) — re-bake required

## Examples (React + Three, 1:1 parity)

- Canvas2D compare overlay: onion-skin / diff / split modes, draggable split handle, `Off` mode hides overlay entirely
- Styles folder: underline / strikethrough via `StyleSpan` API (first word / sentence / line presets)
- Measure folder: hover-to-select line, cyan ink bounds + dashed yellow font envelope, paragraph monitors
- Outline folder: fill / outline / both radio; live width + color sliders via Tweakpane
- Lorem / Icons radio: Icons mode renders `SlugStackText` with Inter + FA-Solid PUA stack; compare overlay uses matching `@font-face` stack
- FA-Solid baked 12-icon PUA subset (`fa-solid.slug.{json,bin}`, ~71 KB bin); `fa-solid-900.ttf` served for Canvas2D `@font-face` fallback only
- Compare overlay uses `stack.wrapText` in icons mode for line-break parity at any `maxWidth`
- DPR sync: `useWindowSize` tracks `{ w, h, dpr }` + `(resolution: Ndppx)` media query + `fullscreenchange`; R3F `<DprSync>` component calls `gl.setPixelRatio` on changes
- Tweakpane replaces all Web Awesome (`@awesome.me/webawesome`) controls; `wa-*` selectors and `useWrappingGroup` helpers removed
- Renderer switched to `antialias: false` — Slug analytic coverage makes MSAA a 4× cost for zero visual gain

## Fixes

- Stroke quad expansion changed from diagonal to axis-aligned — was clipping stroke outer ring square at glyph extents
- `SlugText._setFont` rebuilds outline only when already enabled — avoids GPU resource cost for users not using outlines
- `SlugFont.measureText` baked-path: ink-bounds gate changed from `curves.length > 0` to area check (`xMax > xMin`) — was returning zero bounds for every baked glyph
- Peer dependency for three uses workspace catalog entry

`@three-flatland/slug` ships its initial major feature set: a WebGPU-native analytic text renderer with baked font support, measurement APIs, text decorations, font stacks with per-codepoint fallback, runtime outlines, and a complete quadratic-Bezier stroke pipeline with bake integration.
