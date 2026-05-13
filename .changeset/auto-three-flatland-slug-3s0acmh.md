---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block metrics
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break list matching shaped output
- `SlugFont.hasCharCode(codepoint)` — codepoint coverage check for fallback routing
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` → `SlugGlyphData | null` — look up pre-baked stroke glyphs
- `SlugFontStack(fonts)` — ordered per-codepoint font fallback chain
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — stack-aware wrapping for Canvas2D/DOM mirrors
- `SlugFontStack.resolveCodepoint(c)` / `resolveText(text)` — per-character font assignment
- `SlugStackText` — multi-font `Group` renderable; one `InstancedMesh` per font in the stack
- `SlugStackText.styles` — `StyleSpan[]` underline/strikethrough for stacked text
- `SlugStackText.outline` — outline parity with `SlugText.outline`; one stroke mesh per font
- `SlugStackText.setOpacity(value)` — forward opacity to all per-font fill materials
- `SlugText.outline` — opt-in stroke child `InstancedMesh` sharing fill geometry; `renderOrder = -1`
- `SlugText.setOpacity(value)`, `setOutlineWidth()`, `setOutlineColor()` — runtime-uniform setters, zero rebuild
- `SlugText.styles` — `StyleSpan[]` underline/strikethrough
- `SlugOutlineOptions` — exported outline config type
- `SlugStrokeMaterial` — analytic stroke `NodeMaterial` backed by `distanceToQuadBezier` TSL shader
- `StyleSpan { start, end, underline?, strike?, scriptLevel? }` — text decoration span type
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline helpers (used by font parser, stroke offsetter, and SVG path support)

## CLI (`slug-bake`)

- Initial `slug-bake` CLI for converting TTF/OTF to `.slug.{json,bin}` baked format
- `--output / -o` — custom output base path
- `--stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake stroke geometry into slug files at specified widths/styles

## Stroke pipeline (Phase 4 + 5)

- Quadratic-Bezier stroke offsetter: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round joins, flat/square/round/triangle caps, closed and open contour stitching
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter to GPU glyph data; returns stroke `SlugGlyphData` or `null` for advance-only glyphs
- `BakedJSON.strokeSets?` — optional baked stroke metadata; absent for fonts baked without stroke flags; old fixtures load unchanged
- Stroke quad expansion now axis-aligned (was diagonal unit-normal), fixing clipped stroke corners at glyph extents
- `distanceToQuadBezier` TSL: reduced to single Newton seed (was 3); halves WGSL compile time and per-fragment GPU cost

## Performance

- Curve texture format: RGBA16F, 8 bytes/texel (was RGBA32F, 16 bytes)
- Band texture format: RG32F, 8 bytes/texel (was RGBA32F, 16 bytes)
- `MAX_CURVES_PER_BAND` reduced 64→40 (covers 100% of Inter's full glyph corpus with margin)
- `bandCount` 8→16 — halves expected curves per band, reducing per-fragment ALU
- Shader skips `sqrt`/divisions/saturates for curves whose bounding interval doesn't cross the ray (~30% of curves)
- Baked fixture size reduced ~45% (13 MB → 7.1 MB for Inter-Regular)

## Bug fixes

- Fixed whitespace collapse at wrap points: disabled opentype.js `liga`/`rlig` features so `stringToGlyphs` output length matches `text.length`
- Fixed blank canvas on R3F first render: `SlugText` visibility deferred to `_rebuild` after glyph data is written
- Fixed baked `measureText` returning zero ink bounds for all glyphs (used bounds-area gate instead of `curves.length > 0`)
- Fixed stroke outline clipped/squared at glyph extents (axis-aligned quad expansion)
- Fixed first-outline-enable hitch: halved `distanceToQuadBezier` shader size, cutting WebGPU pipeline compile time
- `SlugStackText.dispose()` now cleans up outline meshes before disposing shared geometries (fixes GPU leak on scene toggle)
- Kerning extraction filters to source glyph IDs only (fixes `this.font._push is not a function` crash when stroke glyph IDs were included)
- `SlugText._setFont` rebuilds outline only when already enabled (avoids paying GPU cost for users who never use outlines)

## Baked format

- `BAKED_VERSION` 2→3: RGBA16F curve texture + RG32F band texture — **re-bake required**
- `BAKED_VERSION` 3→4: decoration metrics (`underlinePosition`, `underlineThickness`, etc.) added — **re-bake required**
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (package unreleased, no migration needed)

## Examples

- `examples/vanilla/slug-text` renamed to `examples/three/slug-text`; package renamed to `example-three-slug-text`
- Canvas2D comparison overlay (onion skin / split / diff modes) ported to React for 1:1 parity with Three example
- Icons mode: `SlugStackText` with `[Inter, FA-Solid]` stack; Font Awesome 12-icon subset baked with `slug-bake` (~71 KB bin)
- Measure UI: hover-to-select lines; cyan ink bounds + dashed yellow font envelope overlays; live paragraph monitors
- Styles folder: underline/strikethrough `StyleSpan` demo (first word / first sentence / first line presets)
- Outline controls: Fill / Outline / Both radio, width slider, color picker — all runtime-uniform, zero rebuild
- Compare overlay uses `stack.wrapText` in icons mode so line breaks agree with `SlugStackText` at any `maxWidth`
- React example: DPR re-sync on monitor swap and fullscreen via `<DprSync>` component; `fullscreenchange` + RAF double-measurement for reliable layout after transitions

This release adds measurement, text decorations, multi-font stacking with fallback, and a complete analytic stroke pipeline (bevel joins, all cap styles) backed by a new `slug-bake` CLI with stroke-set baking support.
