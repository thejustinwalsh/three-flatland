---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## What's New

### Stroke rendering pipeline (Phase 4–5)
- `SlugText.outline` — opt-in stroke child mesh sharing fill geometry; runtime-uniform `setOutlineWidth` / `setOutlineColor` with zero rebuild cost
- `SlugStrokeMaterial` — TSL NodeMaterial with analytic distance-to-quadratic-Bezier fragment shader; bevel-at-corner-minimum as default join style
- Stroke quad expansion fixed to axis-aligned per-axis growth (was diagonal, clipped corners); shader compile cost halved by reducing Newton seeds 3→1 + endpoints
- `SlugStackText.outline` / `SlugStackText.setOpacity` — outline and fill-opacity parity with `SlugText` for multi-font stacks

### Stroke offsetter (Phase 5, build-time)
- Full quadratic-Bezier stroke offsetter: adaptive subdivision → per-segment Tiller-Hanson offset → join insertion (miter / bevel / round) → cap insertion (flat / square / triangle / round) → contour stitching into closed annular rings or open loops
- `bakeStrokeForGlyph(source, options)` — bridges offsetter output to `SlugGlyphData` via `buildGpuGlyphData`
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed alongside source glyphs with a `glyphIdOffset`; `BakedJSON.strokeSets` metadata forwarded to `SlugFont.getStrokeGlyph()`

### Font stack & icon support (Phase 3)
- `SlugFontStack` — ordered per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `emitDecorations`
- `SlugFont.hasCharCode` — cheap cmap coverage check
- `SlugStackText` extends `Group`; one `InstancedMesh` per contributing font per draw call
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-breaks match `SlugStackText` output for Canvas2D overlays and DOM mirrors
- Font-Awesome Solid icon subset support in examples via baked `.slug.{json,bin}`

### Text measurement (Phase 1)
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line, CanvasRenderingContext2D-aligned fields
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- Baked measure fixed: bounds-area gate replaces `curves.length > 0` heuristic (previously returned zero ink bounds for every baked glyph)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches to runtime or baked path

### Text decorations (Phase 2)
- `StyleSpan { start, end, underline?, strike? }` API; `SlugText.styles` setter
- `pipeline/decorations.ts` — pure post-pass emitting `DecorationRect[]` from shaped glyph positions
- `SlugGeometry` appends decoration rects as rect-sentinel instances (same draw call); `SlugMaterial` short-circuits coverage to 1 for sentinels
- `SlugStackText.styles` — decorations use primary font's metrics across mixed-font runs

### Pipeline & baked format
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` extracted to shared `pipeline/buildGpuGlyph.ts`; used by font parser, stroke offsetter, and future SVG path producer
- `parseFont` emits advance-only glyph entries for space/tab/zero-width codepoints matching bake CLI behavior
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` token deletion drifting word-boundary checks
- `SlugText._setFont` defers `visible=true` until first `_rebuild` — prevents WebGPU "binding size is zero" rejection on R3F's first render pass
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (no public release yet, no migration story)

### Performance
- `curveTexture` → RGBA16F; `bandTexture` → RG32F — ~50% texture bandwidth reduction (13 MB → 7.1 MB fixture)
- `bandCount` 8 → 16; `MAX_CURVES_PER_BAND` 64 → 40 — halves mean curves/band, reduces register pressure
- Shader: non-crossing curves skip `sqrt` / coverage / weight work (≈30% of curves per band)
- `slugDilate` `strokeHalfWidth` parameter removed; fill-only path unchanged

### Examples (React + Three, 1:1 parity)
- Canvas2D comparison overlay: onion / split / diff modes, draggable split handle
- Interactive outline controls: style radio (Fill / Outline / Both), width slider, color picker
- Measure overlay: hover line → cyan ink bounds + dashed yellow font envelope; paragraph monitors
- Styles folder: underline / strike presets
- [Lorem | Icons] scene toggle; icons mode uses FA-Solid stack; compare uses `stack.wrapText` for line-break parity
- Compare mode gains `Off` option hiding the full overlay

### Fixes
- Kerning extraction filters to source glyph IDs only — stroke ID ranges caused `_push is not a function` in kern extractor
- `SlugStackText.dispose` now tears down outline meshes before fill geometries to avoid double-free
- R3F `DprSync` component calls `gl.setPixelRatio` on monitor-swap / fullscreen transitions

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: texture format changes (RGBA16F curves, RG32F bands, MAX_CURVES_PER_BAND 40). Existing `.slug.bin/.json` files must be re-baked with `slug-bake`.
- **BAKED_VERSION 3 → 4**: decoration metrics (`underlinePosition`, `underlineThickness`, etc.) added to `BakedJSON.metrics`. Existing baked files must be re-baked.

Initial `@three-flatland/slug` package shipping the full analytic GPU text rendering pipeline: font parsing, baked format with CLI, text shaping, word-wrap, measurement, decorations, font-stack fallback, and stroke rendering — all on WebGPU + TSL with zero WebGL or GLSL.

