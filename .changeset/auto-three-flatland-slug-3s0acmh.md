---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Package

Initial release of `@three-flatland/slug` — a WebGPU/TSL analytic text renderer for Three.js and React Three Fiber.

## Core API

- `SlugFont` / `SlugFontLoader` — runtime (opentype.js) and baked font loading with a shared lazy-injection pattern
- `SlugText` — shaped, wrapped, instanced text renderable; constructor options + runtime setters for `text`, `font`, `fontSize`, `align`, `maxWidth`, `lineHeight`, `styles`, `outline`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — line-break array matching the shaped output exactly
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line ink + font-envelope metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- `SlugFont.hasCharCode(codepoint)` — codepoint coverage check
- `SlugText.setOpacity(value)`, `setOutlineWidth`, `setOutlineColor` — runtime-uniform setters (zero rebuild)

## Styling and Decorations

- `StyleSpan { start, end, underline?, strike? }` — character-range underline / strikethrough via `SlugText.styles`
- `SlugText.outline` / `SlugOutlineOptions` — opt-in outline rendered as a child `InstancedMesh` with `SlugStrokeMaterial`; runtime-uniform width and color
- Stem darkening and thickening options on `SlugMaterial` / `SlugText`
- `SlugStrokeMaterial` exported from package root

## Multi-Font Stacks

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`, `emitDecorations`
- `SlugStackText` — `Group` with one `InstancedMesh` per font; `styles`, `outline`, `setOpacity`, `dispose`

## Pipeline / Build-Time

- `slug-bake` CLI — pre-bakes `.slug.{json,bin}` from a TTF/OTF source
  - `--output / -o` for custom output path prefix
  - `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` to embed pre-baked stroke contours (`BakedJSON.strokeSets`)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke `SlugGlyphData`
- Internal pipeline exports: `buildGpuGlyphData`, `buildGpuGlyphFromCurves`, `buildAdvanceOnlyGlyph`
- Stroke offsetter: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round joins, flat/square/round/triangle caps, contour stitching
- `bakeStrokeForGlyph(source, options)` — produces stroke `SlugGlyphData` from any fill glyph

## Performance

- Curve texture switched to `RGBA16F` (half bandwidth vs `RGBA32F`)
- Band texture switched to `RG32F` (eliminates 2 wasted channels)
- `bandCount` 8 → 16; `MAX_CURVES_PER_BAND` 64 → 40 (Inter corpus p999 = 25 curves)
- Fragment shader: non-crossing curves skip the sqrt/division/saturate path
- Stroke shader compile cost halved: single Newton seed at t=0.5 replaces three-seed spread

## Bug Fixes

- Stroke quad now expands axis-aligned by `strokeHalfWidth` per axis before AA dilation — prevents stroke being clipped square at the glyph bounding box corners
- `SlugText._setFont` defers visibility until the first real glyph data is written, preventing a blank-canvas WebGPU "binding size is zero" error on the initial R3F render pass
- `SlugStackText.dispose` now correctly tears down outline child meshes and `SlugStrokeMaterial` instances before disposing shared geometry
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` to suppress ligature substitution that was collapsing word-boundary checks and causing whitespace to disappear at wrap points
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls), aligning runtime and baked advance resolution

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: curve texture format changed to `RGBA16F`, band texture to `RG32F`, `MAX_CURVES_PER_BAND` reduced to 40. All existing `.slug.bin`/`.json` files must be re-baked with the updated `slug-bake` CLI.
- **BAKED_VERSION 3 → 4**: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`, script scale/offset) added to `BakedJSON.metrics`. Existing baked files must be re-baked.

Introduces `@three-flatland/slug`: a full WebGPU/TSL analytic text renderer covering font loading, baking, measurement, decorations, multi-font stacks, and stroke outlines across Phases 1–5.
