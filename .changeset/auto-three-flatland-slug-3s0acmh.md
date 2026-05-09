---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## Measurement

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox*, fontBoundingBox*); works on both baked and runtime fonts
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block metrics; respects same lineHeight default (1.2) as SlugText
- Baked measure uses `bounds-area` gate (fixes silent zero-ink bounds on baked path)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — line-break helper; dispatches to baked or runtime path; used by examples to match shaped output exactly
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — stack-aware wrapping with per-codepoint font resolution; line breaks agree with SlugStackText at any maxWidth
- `SlugFont.hasCharCode(c)` — cheap codepoint-coverage check via the font's cmap

## Text Decorations

- `StyleSpan { start, end, underline?, strike? }` API for underline and strikethrough spans
- `pipeline/decorations.ts`: pure post-pass over shaped glyphs; one rect per (line, kind, contiguous-styled-run)
- `SlugGeometry.setGlyphs` accepts optional decorations array; appends rect-sentinel instances to the same draw call
- `SlugMaterial` detects the rect sentinel and short-circuits coverage to 1
- `SlugText` accepts `styles?: StyleSpan[]` (constructor + runtime setter)
- Font-declared decoration metrics (underlinePosition, underlineThickness, strikethroughPosition, strikethroughThickness) baked into `BakedJSON.metrics`; BAKED_VERSION 3 → 4

## Font Stack (Multi-Font Fallback)

- `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint(c)` returns index of first covering font
- `SlugStackText extends Group` — multi-font renderable; one `InstancedMesh` per contributing font per draw
- `SlugStackText.styles: StyleSpan[]` — underline/strike spans on stack text; decoration runs use primary font metrics
- `SlugStackText.outline: SlugOutlineOptions` — parity with `SlugText.outline`; per-font stroke `InstancedMesh` with `SlugStrokeMaterial`
- `SlugStackText.setOpacity(value)` — forwards to every per-font fill material
- `SlugStackText.dispose()` now fully cleans up outline meshes and fill InstancedMeshes (GPU leak fix on scene toggle)
- `SlugFontStack.emitDecorations()` — builds per-glyph advance lookup via WeakMap keyed on positioned-glyph object
- `pipeline/textShaperStack.ts` — wrap-aware shaper with per-char font resolution; preserves kerning within same-font runs

## Outline / Stroke (Phase 4)

- `SlugStrokeMaterial` — stroke-capable NodeMaterial; same instance-attribute layout as `SlugMaterial`; exported from package root
- `SlugText.outline: SlugOutlineOptions | null` — opt-in outline via a child `InstancedMesh` sharing the fill mesh's `instanceMatrix`
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` — runtime-uniform setters, zero rebuild
- `SlugText.setOpacity(value)` — fill opacity control for outline-only mode
- `SlugOutlineOptions` exported from package root
- `slugDilate` performs axis-aligned expansion before the AA dilation pass, fixing stroke clipping at glyph extents
- `distanceToQuadBezier` TSL shader reduced to single Newton seed + 3 iterations, halving pipeline compile time and per-fragment cost

## Stroke Offsetter Pipeline (Phase 5)

- `pipeline/strokeOffsetter.ts` — complete quadratic-Bezier stroke offsetter:
  - Adaptive subdivision (`subdivideForOffset`) with Tiller-Hanson per-segment offset
  - Join insertion: bevel, miter (with miterLimit fallback), round arcs ≤60°/segment
  - Cap insertion: flat, square, triangle, round; closed contours skip caps
  - Contour stitching: closed source → two contours (outer CCW + inner CW); open source → one closed loop
- `bakeStrokeForGlyph(source, options)` — converts a `SlugGlyphData` to its stroked equivalent via the offsetter; returns null for advance-only glyphs
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- `BakedJSON.strokeSets?: Array<{ width, joinStyle, capStyle, miterLimit, glyphIdOffset }>` — optional baked stroke metadata; absent for fonts baked without stroke flags
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke glyph data
- Kerning extraction filters to source IDs only (fixes `_push is not a function` error on stroke glyph IDs)

## Pipeline & Performance

- `pipeline/buildGpuGlyph.ts` — shared contour-to-GPU module: `buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`; fontParser and strokeOffsetter both use this path
- `curveTexture` → RGBA16F (8 bytes/texel vs 16); `bandTexture` → RG32F (8 bytes/texel vs 16); BAKED_VERSION 2 → 3
- `bandCount` 8 → 16 (halves expected curves/band); `MAX_CURVES_PER_BAND` 64 → 40 (covers Inter p999 with margin)
- Shader skips post-rootCode work for non-crossing curves (~30% of curves per fragment)
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab, zero-width controls)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs`, fixing liga/rlig whitespace collapse at wrap points
- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild`, preventing zero-buffer WebGPU pipeline rejection on R3F's first render

## CLI

- `slug-bake` gains `--output / -o` flag for custom output base paths
- Bake-time warning when any band exceeds `MAX_CURVES_PER_BAND`

## Examples

- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`; package renamed `example-three-slug-text`
- React and Three examples achieve 1:1 feature parity throughout: compare overlay (off/onion/diff/split), measurement (click-to-select with cyan ink + yellow envelope overlays), decorations, outline controls (style/width/color), font stack icons mode
- Icons mode: FA-Solid PUA codepoints baked with `slug-bake`; Canvas2D compare switches font stack to match; `@font-face` declared with `font-weight: normal` to prevent weight-mismatch fallthrough
- Compare overlay `drawCompareText` accepts `preWrappedLines?: string[]` override; stack mode uses `stack.wrapText` for line-break agreement
- `renderer.antialias` set to `false` — analytic per-fragment coverage makes MSAA zero-gain at 4× sample cost

## Breaking Changes

- **BAKED_VERSION 2 → 3**: `curveTexture` changed to RGBA16F, `bandTexture` to RG32F. Re-run `slug-bake` on all `.slug.bin`/`.slug.json` fixtures.
- **BAKED_VERSION 3 → 4**: decoration metrics (`underlinePosition`, `underlineThickness`, etc.) added to `BakedJSON.metrics`. Re-run `slug-bake` to include decoration data.
- `SlugFontLoader.clearCache` removed (cache already keyed on `url:runtime?`; no migration needed).
- `BAKED_VERSION` machinery removed from `SlugFontLoader` — package was unreleased, no migration story existed.
- `slugDilate`'s `strokeHalfWidth` parameter removed; expansion is now handled axis-aligned in `SlugStrokeMaterial`'s vertex shader.

This release ships the full Phase 1–5 feature set: measurement APIs, text decorations, multi-font stacks, analytic outline rendering, and a complete quadratic-Bezier stroke offsetter with bake-time CLI integration.
