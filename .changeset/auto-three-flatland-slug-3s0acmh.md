---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

### Outline / stroke rendering
- `SlugText.outline` — opt-in child mesh rendered behind fill, sharing glyph geometry; zero-rebuild width/color setters (`setOutlineWidth`, `setOutlineColor`)
- `SlugStrokeMaterial` — TSL NodeMaterial for stroke coverage; exported alongside `SlugOutlineOptions`
- `SlugStackText.outline` — parity with `SlugText`: one `SlugStrokeMaterial` mesh per font in the stack; `setOpacity` for fill-alpha control
- Analytic stroke coverage via `distanceToQuadBezier` (TSL + CPU reference); bevel-via-min join default
- Stroke quad now expands axis-aligned before the pixel-AA dilation pass — fixes clipping at glyph bbox extents
- Shader compile cost halved (single Newton seed instead of three); reduces first-enable lag by ~50%
- Outline skipped at construction until explicitly enabled — avoids GPU-resource cost for fill-only users

### Stroke offsetter (build-time)
- `subdivideForOffset` — adaptive quadratic subdivision at configurable epsilon; exports `unitTangentAt`
- `offsetSegment` — Tiller-Hanson single-quad offset; degenerate-safe
- `insertJoin` — bevel / miter (with miterLimit fallback) / round join geometry between adjacent offset segments
- `insertCap` — flat / square / triangle / round cap geometry at open-contour endpoints
- `strokeOffsetter(curves, closed, options)` — full closed-contour output ready for the Slug fill pipeline
- `bakeStrokeForGlyph(source, options)` — converts source glyph contours to a stroked `SlugGlyphData`; returns null for advance-only glyphs

### Baked stroke sets
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets` optional field; old fixtures load unchanged
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — pre-baked stroke lookup
- Kerning extraction filters to source IDs only (fixes crash when stroke glyph IDs were passed to opentype.js)

### Font measurement
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience wrapper
- Runtime measure reads pre-computed `SlugGlyphData.bounds` (constant cost); baked measure gates on bounds-area, fixing silent zero-ink returns on the baked path

### Text decorations
- `StyleSpan { start, end, underline?, strike? }` — character-range decoration spec
- `SlugText` accepts `styles?: StyleSpan[]` (constructor + runtime setter)
- `pipeline/decorations.ts` — pure post-shaping pass; one rect per (line, kind, contiguous run)
- `SlugFont.emitDecorations` + `SlugGeometry` decoration-instance support; fragment short-circuits to full coverage for rect sentinels
- Decoration metrics sourced from OpenType post/os2 tables; baked into `BakedJSON.metrics` (BAKED_VERSION 3 → 4)

### Font stack / fallback
- `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint` and `resolveText` for per-character font assignment
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check
- `pipeline/textShaperStack.ts` — wrap-aware shaper preserving kerning within same-font runs
- `SlugStackText` extends `Group` — one `InstancedMesh` per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint font resolution for Canvas2D/DOM mirrors
- `SlugFontStack.emitDecorations()` — primary-font decoration metrics across mixed-font runs
- `SlugStackText.styles`, `SlugStackText.outline`, `SlugStackText.setOpacity` — parity with `SlugText`
- `SlugStackText.dispose()` now tears down outline meshes and fill meshes in the correct order

### Pipeline improvements
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU module used by fontParser, strokeOffsetter, and future SVG path producer
- `parseFont` emits advance-only entries for space/tab/zero-width cmap'd glyphs (no outline), matching bake-CLI behavior
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` collapsing tokens and misaligning word-boundary checks
- `SlugText._setFont` defers `visible=true` until first `_rebuild` — prevents TSL pipeline build against an uninitialized instance buffer

### CLI
- `slug-bake` gains `--output` / `-o` for custom output base path
- `slug-bake` warns when a band exceeds `MAX_CURVES_PER_BAND` (introduced with stroke-set bake)
- `BAKED_VERSION` machinery removed from `SlugFontLoader` — no published migration story yet

### Performance
- `curveTexture` → `RGBA16F` (half-float); `bandTexture` → `RG32F` — ~45% smaller baked files, ~20% less GPU bandwidth (BAKED_VERSION 2 → 3)
- `MAX_CURVES_PER_BAND` 64 → 40; `bandCount` 8 → 16 — halves expected curves/band, reduces fragment ALU
- Shader skips sqrt/division work for curves whose band ray has no crossing (`If(rootCode > 0)`)

### DPR / fullscreen tracking
- `useWindowSize` tracks `{ w, h, dpr }` and subscribes to a `(resolution: Ndppx)` media query — monitor swaps now trigger canvas re-size
- `document.fullscreenchange` listener added alongside resize; re-measures immediately + one RAF later
- Compare overlay reads `windowSize.dpr` instead of `window.devicePixelRatio`
- React: `<DprSync>` component calls `gl.setPixelRatio` whenever tracked DPR changes

### Examples
- React + Three slug-text examples at 1:1 parity throughout; moved from `examples/vanilla/` to `examples/three/`
- Canvas2D comparison overlay with onion / split / diff / off modes; draggable split handle
- Compare mode `Off` hides overlay entirely — no Canvas2D work when hidden
- `[Lorem | Icons]` scene toggle; Icons mode uses FA-Solid PUA codepoints baked with `slug-bake`
- `drawCompareText` accepts `preWrappedLines?` override — line breaks agree with `SlugStackText` at any maxWidth
- Tweakpane Outline folder: `Fill | Outline | Both` radio, width slider, color picker — all runtime-uniform, zero rebuild
- Click-to-select line measure UX: cyan (ink) + dashed yellow (font envelope) overlays; paragraph monitors live-update
- Hover-to-measure replaces click+checkbox interaction pattern

## Bug fixes
- Stroke outer ring no longer clipped square at glyph bbox extents (axis-aligned quad expansion)
- First outline-enable hitch reduced ~50% (shader compile cost halved)
- `SlugText._setFont` no longer rebuilds outline when not enabled
- `SlugFontStack` kerning extractor no longer errors on stroke glyph IDs
- Baked `measureText` no longer returns zero ink-bounds for every glyph

## BREAKING CHANGES
- `BakedJSON` format bumped BAKED_VERSION 2 → 3 (RGBA16F curve texture, RG32F band texture) then 3 → 4 (decoration metrics). Re-run `slug-bake` on all existing `.slug.{json,bin}` assets.
- `slugDilate`'s `strokeHalfWidth` parameter removed; stroke expansion now handled in `SlugStrokeMaterial` vertex shader.

`@three-flatland/slug` gains a full outline/stroke pipeline, text decoration support, multi-font fallback stacks, measurement APIs, and a build-time quadratic-Bezier stroke offsetter — while cutting baked asset size ~45% and GPU bandwidth ~20%.

