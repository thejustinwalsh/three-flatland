---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### Text measurement

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics with the same field names as `CanvasRenderingContext2D.measureText`; dispatches to baked or runtime impl with no opentype.js cost on the baked path
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience wrapper; respects the same `lineHeight` default (1.2) as `SlugText` so measured height matches rendered height
- Fixed: baked `measureText` was returning zero ink bounds due to `curves.length` heuristic — now gates on bounds-area (`xMax > xMin`)

### Text decorations

- `StyleSpan { start, end, underline?, strike? }` — new API on `SlugText` (constructor + runtime setter) and `SlugFont`
- `pipeline/decorations.ts` post-pass emits one rect per styled run; appended as sentinel instances in `SlugGeometry.setGlyphs` and rendered in the same draw call
- `SlugMaterial` fragment shader detects the decoration sentinel and short-circuits to full coverage
- `BAKED_VERSION` bumped 3 → 4 for decoration metrics; included fixtures re-baked

### Font stack and fallback (Phase 3)

- `SlugFontStack(fonts)` — ordered fallback chain for per-codepoint glyph resolution; `resolveCodepoint`, `resolveText`, `hasCharCode`
- `SlugFont.hasCharCode(c)` — fast codepoint coverage check via cmap
- `SlugStackText` (`extends Group`) — multi-font renderable with one `InstancedMesh` per contributing font
- `pipeline/textShaperStack.ts` — wrap-aware multi-font shaper preserving kerning within same-font runs
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint line-breaking matching `SlugStackText` output; backed by `pipeline/wrapLinesStack.ts`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches to baked or runtime path
- Icon-fallback demo: FA-Solid PUA codepoints baked with `slug-bake`, 12-icon subset

### Outline and stroke system (Phase 4)

- `SlugStrokeMaterial` — TSL stroke NodeMaterial with runtime-uniform `strokeHalfWidth`, `color`, `opacity`; exported from package root
- `SlugText.outline: SlugOutlineOptions` — opt-in child `InstancedMesh` sharing fill geometry, `renderOrder = -1`
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` / `setOpacity(v)` — zero-rebuild runtime setters
- `SlugOutlineOptions` exported from package root
- Analytic stroke shader (`slugStroke`) using distance-to-quadratic-Bezier; bevel-via-min joins at exterior corners
- Fixed: quad expansion was diagonal (causing stroke to clip at glyph extents) — now axis-aligned before AA dilation pass
- Fixed: single Newton seed at t=0.5 halves shader WGSL size, eliminating first-draw pipeline-compile hitch (hundreds of ms)
- `SlugText._setFont` defers `visible=true` until first `_rebuild` — prevents zero-binding WebGPU pipeline errors in R3F

### Stroke offsetter pipeline (Phase 5)

- `subdivideForOffset` — adaptive quadratic subdivision; `unitTangentAt` helper reused by offset, join, and cap steps
- Per-segment Tiller-Hanson offset: offsets p0/p2 along normals, intersects tangent lines for p1
- Join insertion: bevel, miter (SVG `miterLimit` fallback to bevel), round (≤60°-per-segment arcs)
- Cap insertion: flat, square, triangle, round; closed contours never invoke caps
- Contour stitching (`reverseContour`, `offsetOneSide`): produces closed annular (closed source) or single-loop (open source) shapes
- `bakeStrokeForGlyph(source, options)` — full stroke-contour builder from glyph data; returns `null` for advance-only glyphs
- `slug-bake` CLI: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; `--output / -o` for custom output base
- Stroke pseudo-glyphs packed into existing curve+band textures; no new shader variant; 1× fill cost at runtime
- `BakedJSON.strokeSets?` optional array; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` lookup
- Kerning extraction now filters to source IDs only (prevents crash when stroke IDs are in unknown ranges)

### SlugStackText feature parity

- `SlugStackText.styles` — underline/strikethrough via new `SlugFontStack.emitDecorations()`; decorations use primary font's metrics for visual consistency
- `SlugStackText.outline` — per-font stroke `InstancedMesh` children; `setOutlineWidth` / `setOutlineColor` runtime setters
- `SlugStackText.setOpacity(v)` — forwards to all per-font fill materials for outline-only mode
- `SlugStackText.dispose()` fixed: now tears down outline meshes before disposing shared geometries, preventing GPU leaks on scene toggle

### Performance

- Band count 8 → 16: halves expected curves per band (~6.3 → ~3.2 mean); bake-time warning when any band exceeds `MAX_CURVES_PER_BAND`
- Shader: non-crossing curves skip the sqrt/solve/coverage work entirely (~30% of curves in a band)
- `curveTexture` → RGBA16F (8 bytes/texel, down from 16); `bandTexture` → RG32F (8 bytes/texel)
- `MAX_CURVES_PER_BAND` 64 → 40; p999 of Inter's full glyph corpus is 25 curves; fixtures re-baked (~45% smaller on disk)
- `BAKED_VERSION` bumped 2 → 3 for texture format change; old `.slug.bin`/`.json` files must be re-baked

### Pipeline refactors

- `buildGpuGlyph.ts` — shared contour-to-GPU factory (`buildGpuGlyphData`, `buildGpuGlyphFromCurves`, `buildAdvanceOnlyGlyph`) used by fontParser, stroke offsetter, and future SVG import
- `parseFont` now emits advance-only entries for whitespace/control codepoints (space, tab, zero-width) matching the bake CLI behavior
- Runtime shapers pass `{ features: [] }` to opentype.js to suppress `liga`/`rlig` collapsing that caused whitespace drops at wrap points in mixed text
- `BAKED_VERSION` version-check machinery removed from `SlugFontLoader` (pre-release, no migration needed)
- Stem darkening and thickening options added to `SlugMaterial` and `SlugText`

### Examples

- Canvas2D comparison overlay with onion/split/diff modes, draggable split handle, luminance-weighted diff heatmap
- React example ported from HtmlOverlay to full R3F idioms (`CanvasGrabber`, `CompareCanvas`, `DprSync`)
- `DprSync` component re-syncs R3F canvas DPR after monitor swaps and fullscreen transitions
- Compare overlay uses `stack.wrapText` in icons mode so line breaks agree with `SlugStackText` at any `maxWidth`
- `examples/vanilla/slug-text` relocated to `examples/three/slug-text`; slug-text example auto-discovered by MFE config

Delivers Phase 2–5 of the Slug roadmap: text measurement, decorations, font stacks with fallback, runtime and baked stroke outlines, a full quadratic stroke offsetter, and the `slug-bake` stroke CLI — with performance improvements reducing GPU texture bandwidth ~50% and per-fragment ALU ~30%.
