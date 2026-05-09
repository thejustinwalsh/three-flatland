---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**Stroke rendering (Phase 4–5)**

- `SlugText.outline` — opt-in child `InstancedMesh` using `SlugStrokeMaterial`; runtime `setOutlineWidth` / `setOutlineColor` update uniforms without geometry rebuild
- `SlugStrokeMaterial` — TSL stroke fragment shader with analytic distance-to-quadratic-Bezier; bevel-via-min joins out of the box
- `SlugOutlineOptions` exported from package root; `outline.color` accepts `number | string | Color`
- `SlugText.setOpacity(value)` — fade fill independently of outline for outline-only mode
- Fixed stroke quad clipping: axis-aligned expansion applied before AA dilation pass so stroke corners no longer clip at glyph bbox extents
- Halved stroke shader pipeline compile time by reducing Newton seeds from 3 to 1 (single seed t=0.5 with 3 iterations + endpoint candidates); ~⅔ reduction in per-fragment GPU cost after compile
- `SlugStackText.outline` — per-font stroke meshes sharing fill `instanceMatrix`, `setOutlineWidth` / `setOutlineColor` uniform setters
- `SlugStackText.setOpacity(value)` — forwards to all per-font fill materials
- Quadratic-Bezier stroke offsetter pipeline: adaptive subdivision, per-segment Tiller-Hanson offset, join geometry (bevel/miter/round), cap geometry (flat/square/triangle/round), contour stitching (annular ring for closed, single closed contour for open)
- `bakeStrokeForGlyph(source, options)` — maps source glyph contours through offsetter into a new `SlugGlyphData` ready for GPU upload
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked stroke pseudo-glyphs pack into curve/band textures at `glyphIdOffset + sourceId`
- `BakedJSON.strokeSets` optional field carries stroke set metadata; `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` looks up pre-baked stroke data at runtime

**Font stack & icon support**

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `hasCharCode` on `SlugFont`
- `SlugStackText extends Group` — one `InstancedMesh` per font, single layout pass via `textShaperStack`
- `SlugStackText` styles, outline, opacity now at feature parity with `SlugText`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — per-codepoint wrap matching `shapeStackText` break policy; enables Canvas2D overlays to stay line-for-line with `SlugStackText`
- `SlugFontStack.emitDecorations()` — builds per-glyph advance lookup via `WeakMap` for correct decoration metrics across mixed-font runs
- `SlugFont.hasCharCode(c)` — cheap cmap coverage check
- `slug-bake` gains `--output / -o` for custom output path base
- Examples: [Lorem | Icons] radio toggle; icons mode renders FA-Solid PUA codepoints via `[Inter, FA-Solid]` stack; compare overlay uses `stack.wrapText` for line-break agreement

**Measurement APIs**

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`; dispatches to baked or runtime impl
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line via `wrapText` + per-line `measureText`; respects same `lineHeight` default (1.2) as `SlugText`
- Runtime measure reads pre-computed `SlugGlyphData.bounds` (constant cost regardless of glyph complexity)
- Baked measure gates ink accumulation on `xMax > xMin` bounds area (fixes silent zero-bounds on all baked glyphs)

**Text decorations**

- `StyleSpan { start, end, underline?, strike? }` — manual-aligned character-range decoration spec
- `SlugText` accepts `styles?: StyleSpan[]` in constructor and as a runtime setter
- `pipeline/decorations.ts` — pure post-shaping pass emitting `DecorationRect[]`, one rect per contiguous styled run per line
- `SlugGeometry.setGlyphs` accepts optional decorations array; rect-sentinel instances (`glyphJac.w = -1`) render in the same draw call with short-circuit coverage=1 in the fragment shader
- Decoration metrics (underline/strikethrough position+thickness, script scale/offset) sourced from OpenType `post`/`os2` tables at parse time and baked into `BakedJSON.metrics`

**Rendering pipeline**

- `buildGpuGlyph.ts` — shared contour-to-GPU factory (`buildGpuGlyphFromCurves`, `buildGpuGlyphData`, `buildAdvanceOnlyGlyph`) used by fontParser, strokeOffsetter, and future SVG shape path
- `parseFont` emits advance-only entries for space/tab/zero-width codepoints; runtime shapers pass `{ features: [] }` to `stringToGlyphs` to suppress `liga`/`rlig` token deletion and fix whitespace-collapse at wrap points
- `SlugText._setFont` defers `visible=true` until after first `_rebuild` to avoid zero-binding GPU rejection on R3F's initial render
- Performance: `curveTexture` → `RGBA16F`, `bandTexture` → `RG32F`; ~45% smaller `.slug.bin` files; `MAX_CURVES_PER_BAND` 64 → 40; `bandCount` 8 → 16 (halves expected curves/band)
- Shader: non-crossing curves skip sqrt/division/saturate work (~30% of band curves in practice)
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — dispatches to baked or runtime wrap implementation
- Stem darkening and thickening options on `SlugMaterial` and `SlugText`

**Examples & tooling**

- `examples/vanilla/slug-text` renamed to `examples/three/slug-text`; React example gains full Canvas2D comparison overlay (onion/split/diff modes) at parity with Three example
- Compare mode gains `Off` option hiding overlay entirely for standalone rendering verification
- DPR re-sync via `<DprSync>` on R3F canvas after monitor swap/fullscreen; `useWindowSize` tracks `{ w, h, dpr }`; listens to `(resolution: Ndppx)` media query + `fullscreenchange`
- `SlugStackText.dispose()` now tears down outline meshes and fill `InstancedMesh`es in correct order before geometry/material disposal
- `antialias: false` on renderer (analytic coverage; MSAA is 4× cost for zero gain)

## BREAKING CHANGES

- **`BAKED_VERSION` 2 → 3**: `curveTexture` switched to `RGBA16F`, `bandTexture` to `RG32F`, `MAX_CURVES_PER_BAND` changed to 40. All `.slug.bin/.json` files must be regenerated with `slug-bake`.
- **`BAKED_VERSION` 3 → 4**: `BakedJSON.metrics` gains decoration fields. All `.slug.bin/.json` files must be regenerated with `slug-bake`.
- **`SlugFontLoader.clearCache`** removed — static cache is already keyed on `url:runtime?`.
- **`BAKED_VERSION` machinery** removed from `SlugFontLoader` — no version-gate validation at load time.

Delivers the full Phase 1–5 feature surface for `@three-flatland/slug`: analytic text rendering with measurement, decorations, font-stack fallback, and GPU stroke rendering backed by a quadratic-Bezier offset pipeline.

