---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New APIs

- **`SlugFont.measureText(text, fontSize)`** — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox*, fontBoundingBox*); constant cost per call
- **`SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })`** — multi-line paragraph metrics; respects the same `lineHeight` default (1.2) as `SlugText`
- **`SlugFont.wrapText(text, fontSize, maxWidth?)`** — word-wrap producing the same line breaks as shaped output; dispatches on baked vs. runtime path
- **`SlugFont.hasCharCode(c)`** — cheap codepoint-coverage check via font cmap
- **`SlugFontStack(fonts)`** — per-codepoint font fallback chain; `resolveCodepoint` walks the chain, `resolveText` yields per-character font assignments
- **`SlugFontStack.wrapText(text, fontSize, maxWidth?)`** — wrap with per-codepoint font resolution; enables Canvas2D overlays to stay line-for-line with `SlugStackText`
- **`SlugStackText`** — multi-font `Group` renderable; one `InstancedMesh` per contributing font, shared shaping pipeline with `SlugText`
- **`SlugStackText.styles`** — underline/strikethrough `StyleSpan[]` parity with `SlugText`
- **`SlugStackText.outline`** — per-font stroke `InstancedMesh` sharing the fill mesh's `instanceMatrix`; parity with `SlugText.outline`
- **`SlugStackText.setOpacity(value)`** — forwards to all per-font fill materials
- **`SlugText.outline`** (`SlugOutlineOptions`) — opt-in child stroke mesh; runtime-uniform `setOutlineWidth` / `setOutlineColor` with zero rebuild cost
- **`SlugText.setOpacity(value)`** — fades fill without rebuilding geometry
- **`SlugText.styles`** (`StyleSpan[]`) — underline and strikethrough decoration spans
- **`SlugStrokeMaterial`** — TSL `NodeMaterial` for analytic stroke rendering via `distanceToQuadBezier`; exported from package root with `SlugStrokeOptions`
- **`SlugOutlineOptions`** — exported from package root; `color` accepts `number | string | Color`
- **`StyleSpan`** — `{ start, end, underline?, strike? }`; exported from package root

### CLI (`slug-bake`)

- **`--stroke-widths` / `--stroke-join` / `--stroke-cap` / `--miter-limit`** — bake pre-offset stroke contours into the `.slug` binary alongside fill glyphs; stroke glyphs render through the existing fill shader at no extra shader cost
- **`--output` / `-o`** — custom output path base
- Warns when any band exceeds `MAX_CURVES_PER_BAND` (40)

### Baked Format Changes

- **`BakedJSON.strokeSets`** (optional) — array of `{ width, joinStyle, capStyle, miterLimit, glyphIdOffset }` written when stroke flags are used; absent for plain bakes (old fixtures load unchanged)
- **`SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)`** — looks up a pre-baked stroke glyph by matching set; returns `null` if no matching set exists

### Performance

- **Texture bandwidth** — curve texture changed to `RGBA16F` (8 bytes/texel vs. 16); band texture to `RG32F` (8 bytes/texel vs. 16); baked fixtures ~45% smaller
- **Band count** — `bandCount` 8 → 16, halving mean curves per band (~6.3 → ~3.2); fragment ALU scales linearly with curves/band
- **Shader loop** — `MAX_CURVES_PER_BAND` 64 → 40 (p999 of Inter's full corpus = 25, max = 38); reduced register pressure
- **Non-crossing curves** — post-`rootCode` solve wrapped in `If(rootCode > 0)`, skipping ~30% of curves that don't cross the ray
- **Stroke shader compile** — Newton seeds reduced from 3 to 1 (t=0.5 + both endpoints), cutting WGSL size roughly in half and reducing first-draw hitch; per-fragment runtime cost also drops ~2/3
- **Outline quad expansion** — stroke-width expansion moved axis-aligned into the vertex shader before AA dilation; fixes visible clipping at glyph x/y extents that occurred when expansion ran along the diagonal unit normal

### Bug Fixes

- Fixed whitespace collapse at wrap points: runtime shapers now pass `{ features: [] }` to `stringToGlyphs`, suppressing opentype.js's `liga`/`rlig` feature application that was deleting tokens and drifting word-boundary checks
- `SlugText._setFont` no longer flips `visible=true` before the first `_rebuild`; prevents WebGPU "Binding size is zero" errors on the R3F pre-paint pass
- `SlugStackText.dispose()` now correctly tears down outline child meshes and `SlugStrokeMaterial`s before disposing shared geometries; fixes GPU leak on repeated scene toggles
- `SlugText._setFont` only rebuilds the outline when already enabled; avoids paying GPU-resource cost for users who never opt into outlines
- Baked measure now gates ink accumulation on `xMax > xMin` (bounds area) rather than `curves.length > 0`, which was silently returning zero ink bounds for all baked glyphs
- Kerning extraction filters to source glyph IDs only, preventing `this.font._push is not a function` when stroke glyph IDs (outside opentype.js's range) were passed to the kern extractor

### Internals / Refactors

- **Shared contour-to-GPU pipeline** (`buildGpuGlyphData`, `buildGpuGlyphFromCurves`, `buildAdvanceOnlyGlyph`) — common factory used by fontParser, stroke offsetter, and future SVG path support
- **Quadratic-Bezier stroke offsetter** — full pipeline: adaptive subdivision, per-segment Tiller-Hanson offset, bevel/miter/round join insertion, flat/square/round/triangle cap insertion, contour stitching into closed annular or open-capped contours
- **`bakeStrokeForGlyph(source, options)`** — bridge between the offsetter and downstream consumers (CLI bake, future async worker)
- `parseFont` emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for cmap'd glyphs with no outline (space, tab, zero-width controls)
- `SlugFontLoader`: `BAKED_VERSION` version-gate machinery removed (package not yet released; no migration story to maintain)
- Example relocated from `examples/vanilla/slug-text` to `examples/three/slug-text`; React example brought to full feature parity

### Examples

- Both Three.js and React examples maintain 1:1 feature parity throughout
- Compare overlay: `Off | Onion | Diff | Split` modes; `Off` hides overlay entirely for clean screenshotting
- Icon demo: `[Lorem | Icons]` scene toggle; icons rendered via `SlugStackText` with [Inter, FA-Solid] stack; baked FA-Solid subset (~71 KB binary)
- Measure overlay: hover any rendered line for cyan (ink) + dashed yellow (font envelope) bounds; paragraph metrics update live
- Styles folder: underline/strikethrough applied to preset scopes via `StyleSpan` API
- Outline folder: `Fill | Outline | Both` style radio + runtime width slider + color picker

`@three-flatland/slug` is a WebGPU-native analytic text renderer using TSL shaders; this release adds font stacks, text decorations, analytic stroke outlines, a baked-stroke CLI pipeline, and a full quadratic-Bezier stroke offsetter — all with no GLSL or WebGL dependencies.
