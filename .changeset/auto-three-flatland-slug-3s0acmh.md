---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

### Stroke rendering

- `SlugText.outline` — opt-in per-text outline rendered as a child `InstancedMesh` sharing fill geometry; zero-rebuild `setOutlineWidth` / `setOutlineColor` runtime setters
- `SlugOutlineOptions` exported from package root; accepts `color` as `number | string | Color`
- `setOpacity(value)` on `SlugText` / `SlugStackText` — fades fill independently of outline for outline-only mode
- `SlugStrokeMaterial` — TSL stroke `NodeMaterial` using analytic `distanceToQuadBezier`; bevel-via-min joins; crispness gate widens sub-pixel strokes to 1px
- Stroke quad expansion fixed: axis-aligned `strokeHalfWidth` expansion applied before AA dilation pass; shader compile cost halved (~2× improvement in first-outline toggle latency)
- Full quadratic-Bezier stroke offsetter pipeline: adaptive subdivision → per-segment offset → join insertion (bevel/miter/round) → cap insertion (flat/square/triangle/round) → contour stitching; returns closed fill-compatible contours
- `bakeStrokeForGlyph(source, options)` — bridges offsetter to GPU pipeline; returns `SlugGlyphData` or `null` for advance-only glyphs
- `slug-bake` CLI gains `--stroke-widths` / `--stroke-join` / `--stroke-cap` / `--miter-limit` flags; baked `strokeSets` metadata stored in `BakedJSON`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke glyph from loaded font

### Font stacking & fallback

- `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint` / `resolveText` for per-codepoint font assignment
- `SlugFont.hasCharCode(c)` — codepoint coverage check
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint wrap matching `shapeStackText` line-break policy; enables Canvas2D overlays to stay line-for-line with `SlugStackText`
- `SlugFontStack.emitDecorations()` — builds underline/strike rects using primary font's metrics across mixed-font runs
- `SlugStackText` — `Group` subclass with one `InstancedMesh` per font; supports `styles`, `outline`, `setOpacity`, and `dispose` (GPU leak fix on scene toggle)

### Measurement APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line, aligned with `CanvasRenderingContext2D.measureText`; constant cost via pre-computed bounds
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line wrapper over `wrapText + measureText`
- Baked measure uses bounds-area heuristic (fixes zero ink bounds regression on baked path)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — baked + runtime dispatch for line-break–consistent Canvas2D comparison overlays

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` — underline and strikethrough rendering via `SlugGeometry.setGlyphs`
- `SlugFont.emitDecorations` / `pipeline/decorations.ts` — pure post-pass over shaped glyphs; one rect per contiguous styled run per line
- `SlugText` accepts `styles?: StyleSpan[]` (constructor + runtime setter)
- Decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition/Thickness`) sourced from OpenType `post` / `os2` tables and baked into `BakedJSON.metrics`

### Rendering

- Stem darkening and thickening options added to `SlugMaterial` and `SlugText`
- `antialias: false` default in examples — Slug's analytic coverage makes MSAA a pure cost

### Pipeline & internals

- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` extracted to shared `pipeline/buildGpuGlyph.ts` — used by font parser, stroke offsetter, and future SVG path producer
- `parseFont` emits advance-only glyph entries for space/tab/zero-width controls (matches bake CLI post-pass)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` shortening the glyph array
- `SlugText._setFont` defers `visible = true` until after first `_rebuild` — prevents WebGPU "binding size is zero" error on first R3F render pass
- `distanceToQuadBezier` TSL port for fragment shader; CPU reference retained for tests

### CLI

- `slug-bake --output / -o` — custom output base path
- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — baked stroke set generation

### Performance

- `bandCount` 8 → 16: halves expected curves per band (~6.3 → ~3.2 mean)
- Fragment shader skips post-solve work for curves that don't cross the ray (~30% of curves in typical bands)
- `curveTexture` → `RGBA16F`: 8 bytes/texel vs 16; `bandTexture` → `RG32F`: 8 bytes/texel vs 16
- `MAX_CURVES_PER_BAND` 64 → 40: matches real corpus p999; reduces shader register pressure
- Slug files ~45% smaller on disk (13 MB → 7.1 MB for Inter Regular)

### Examples (React + Three, 1:1 parity)

- Canvas2D comparison overlay (onion / split / diff modes) ported to React
- `[Lorem | Icons]` radio toggle: Lorem renders `SlugText`; Icons renders `SlugStackText` against `[Inter, FA-Solid]` stack
- Icon demo: 12-glyph FA-Solid subset baked to `fa-solid.slug.{json,bin}` (~71 KB)
- Measure overlay: click any line for cyan (ink) + dashed yellow (font envelope) overlays; paragraph monitors
- Styles folder: underline / strike preset scopes (first word / sentence / line)
- Outline folder: Fill / Outline / Both radio, live width slider, color picker
- Compare mode gains `Off` option to hide overlay and show Slug rendering standalone
- `DprSync` component syncs R3F canvas pixel ratio on monitor swap / fullscreen transition
- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`

## Bug Fixes

- Outline clipped square at glyph extents — axis-aligned expansion now applied before AA dilation
- First outline-enable hitch — stroke fragment shader compile cost halved (single Newton seed)
- `SlugStackText.dispose()` now cleans up outline meshes and stroke materials (GPU leak)
- Kerning extraction filters to source glyph IDs only — prevents `_push is not a function` for stroke glyph ID ranges

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: `curveTexture` format changed to `RGBA16F`; `bandTexture` to `RG32F`; `MAX_CURVES_PER_BAND` lowered to 40. All `.slug.bin` / `.slug.json` files must be re-baked with the updated CLI.
- **BAKED_VERSION 3 → 4**: decoration metrics added to `BakedJSON.metrics`. Re-bake required for underline/strikethrough support.

Adds stroke rendering, font-stack fallback, text measurement, underline/strikethrough, and a full quadratic-Bezier stroke offsetter pipeline. GPU texture bandwidth reduced ~50% and baked file sizes ~45% smaller with the `RGBA16F` curve texture format.
