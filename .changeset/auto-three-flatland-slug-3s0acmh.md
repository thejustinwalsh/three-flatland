---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox*, fontBoundingBox*)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` — multi-line paragraph metrics respecting the same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.hasCharCode(codepoint)` — codepoint coverage check for per-codepoint fallback routing in font stacks
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up a pre-baked stroke glyph from a `strokeSets` entry
- `SlugText.outline` — opt-in outline rendered as a child `InstancedMesh` behind the fill, sharing glyph geometry and instance matrix; accepts `{ width, color }`
- `SlugText.setOpacity(value)` — update fill opacity at runtime without rebuild
- `SlugText.setOutlineWidth(value)` / `SlugText.setOutlineColor(value)` — runtime-uniform setters, zero rebuild
- `SlugStackText.styles` — underline / strikethrough span support, parity with `SlugText`
- `SlugStackText.outline` — per-font stroke `InstancedMesh` via `SlugStrokeMaterial`, parity with `SlugText`
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — line-breaking with the same break-at-last-space + hard-break-fallback policy as `shapeStackText`; enables Canvas2D overlays to match `SlugStackText` line breaks
- `SlugOutlineOptions` exported from package root
- `SlugStrokeMaterial` exported from package root
- Pipeline: `buildGpuGlyphData`, `buildGpuGlyphFromCurves`, `buildAdvanceOnlyGlyph` — shared contour-to-GPU factory used by fontParser, strokeOffsetter, and future SVG path support

## CLI

- `slug-bake` gains `--output` / `-o` for custom output path bases
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` — bake pre-offset stroke contours into the `.slug.{json,bin}` pair at build time; stored in `BakedJSON.strokeSets`

## Stroke Offsetter (Phase 5)

- Complete quadratic-Bezier stroke offsetter pipeline (`strokeOffsetter`): adaptive subdivision, Tiller-Hanson per-segment offset, bevel/miter/round join insertion, flat/square/triangle/round cap insertion, outer + inner contour stitching
- `bakeStrokeForGlyph(source, options)` — converts a source glyph's contours through the offsetter and packs the result into a fresh `SlugGlyphData`; preserves `glyphId`, `advanceWidth`, and `lsb` so shaping produces identical layouts for fill and stroke

## Bug Fixes

- Fixed whitespace collapse at word-wrap points: runtime shapers now pass `{ features: [] }` to `stringToGlyphs`, preventing `liga`/`rlig` substitutions from shrinking the returned array relative to `text.length`
- Fixed blank canvas on first R3F render: `SlugText._setFont` no longer sets `visible = true` before the first `_rebuild`; visibility toggles inside `_rebuild` once glyph data is written
- Fixed stroke outer ring clipped square at glyph extents: stroke-width expansion is now applied axis-aligned in the vertex shader before the pixel-AA dilation pass
- Halved `SlugStrokeMaterial` pipeline compile time by reducing Newton candidates from 5 to 3 in the TSL `distanceToQuadBezier` shader; also improves per-fragment GPU cost
- Fixed `SlugStackText.dispose()` leaving outline child meshes and `SlugStrokeMaterial` instances alive across scene toggles
- Fixed `slug-bake` crash when kerning extractor encountered stroke glyph IDs: kerning extraction now filters to source IDs only
- `parseFont` now emits advance-only glyph entries (space, tab, zero-width controls) matching the bake CLI's post-pass, ensuring correct advance resolution on the runtime path

## Refactors

- Extracted shared contour-to-GPU pipeline into `pipeline/buildGpuGlyph.ts`; `fontParser` delegates to it, eliminating duplicated bounds computation
- `SlugFontLoader`: removed `BAKED_VERSION` machinery (no migration story needed before first release)
- Examples migrated from Web Awesome controls to `@three-flatland/tweakpane` (both React and Three.js, 1:1 parity)

## Examples

- Font-stack icon demo: `[Lorem | Icons]` radio toggle; icons mode loads FA-Solid PUA glyphs baked with `slug-bake`, Canvas2D compare uses `stack.wrapText` for matching line breaks
- `measureText` / `measureParagraph` demo: click any rendered line to show cyan ink bounds + dashed yellow font-envelope overlays and populate width/ascent/descent monitors; paragraph monitors live-update
- Compare overlay gains an `Off` mode hiding the canvas, split handle, and labels
- `antialias: false` in examples (Slug provides analytic per-fragment coverage; MSAA is wasted cost)
- React: `<DprSync>` component inside `<Canvas>` keeps R3F pixel-ratio in sync on monitor swap / OS-zoom / fullscreen transitions

---

Phase 4 delivers runtime-uniform text outlines (`SlugText.outline`) with the analytic `distanceToQuadBezier` stroke shader. Phase 5 adds the full quadratic-Bezier stroke offsetter pipeline, baked stroke-set support in the CLI and loader, `measureText` / `measureParagraph` APIs, and font-stack feature parity with `SlugText`.

