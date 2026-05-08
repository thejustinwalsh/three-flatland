---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**Stroke rendering (runtime)**

- `SlugText.outline` — analytic stroke rendered in a single draw call; uniform `width` (em units) and `color` updated without rebaking
- `SlugStrokeMaterial` — standalone stroke material with stroke-aware quad dilation for custom use cases
- TSL analytic stroke shader built on a new `distanceToQuadBezier` primitive; composites via bevel-via-min for correct join coverage
- Fixed axis-aligned quad expansion for stroke; halved shader compile cost by removing unused branches

**Baked stroke (build-time)**

- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags
- Stroke pseudo-glyphs packed into the same curve + band textures as fill glyphs at `glyphIdOffset + sourceId`; renders through the existing fill shader with no extra pass
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up pre-baked stroke glyph data
- `BakedJSON.strokeSets` optional field carries baked stroke metadata; absent for fonts baked without stroke flags so old fixtures load unchanged
- Full quadratic-Bezier stroke offsetter: adaptive subdivision, per-segment offset, join insertion (bevel / miter / round), cap insertion (flat / square / triangle / round), and contour stitching into closed annular rings

**Font fallback chain**

- `SlugFontStack` — per-codepoint glyph resolution across an ordered font stack; `hasCharCode` consulted for each codepoint
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — line wrapping with the same break-at-last-space + hard-break-fallback policy as `shapeStackText`, keeping Canvas2D overlays line-for-line with `SlugStackText` output
- `SlugStackText` — full parity with `SlugText`: styles, outline, opacity
- `BAKED_VERSION` machinery removed from `SlugFontLoader` (no migration story yet)

**Measurement APIs**

- `SlugFont.measureText(text, fontSize)` — CanvasRenderingContext2D-aligned single-line metrics (`width`, `actualBoundingBox*`, `fontBoundingBox*`)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` — multi-line paragraph metrics; `lineHeight` defaults to 1.2 matching `SlugText` rendering
- Baked measure path uses `xMax > xMin` bounds gate instead of `curves.length > 0` (which silently returned zero ink bounds on the baked path)

**Text decorations**

- Underline and strikethrough decorations on `SlugText` and `SlugStackText`; metrics sourced from font tables and forwarded through baked format

**Pipeline improvements**

- `fontParser` emits advance-only glyph entries (empty curves/bounds, real advanceWidth) for cmap'd glyphs with no outline (space, tab, zero-width controls); aligns runtime and baked shaper advance resolution
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` to suppress liga/rlig ligature substitution that shortened the returned array and caused word-boundary drift at wrap points
- `SlugText._setFont` defers `visible = true` until after the first `_rebuild`; prevents WebGPU "Binding size is zero" rejection on early R3F render passes
- Contour-to-GPU path extracted as shared `buildGpuGlyphData` helper, used by both `fontParser` and `bakeStrokeForGlyph`
- Band builder: halved max curves/band; shader skips non-crossing bands (perf)
- `SlugMaterial` + `SlugText` gain stem darkening and thickening options

**Examples**

- Plain Three.js and React examples achieve 1:1 parity; vanilla example relocated to `examples/three/`
- Lorem / Icons radio toggle: lorem renders `SlugText`; icons renders `SlugStackText` against an [Inter, FA-Solid] stack
- Icon demo uses a 12-glyph FA-Solid subset baked with `slug-bake`; Canvas2D compare mirrors the stack fallback order
- Click-to-measure UX: click any rendered line for cyan (ink) and dashed-yellow (font envelope) overlays with metric monitors
- Compare overlay uses `stack.wrapText` in icons mode so line breaks agree with `SlugStackText`
- `antialias: false` on renderer; Slug computes analytic per-fragment coverage so MSAA is redundant

**Bug fixes**

- Fixed DPR desync on monitor swap: compare canvas now re-sizes when `devicePixelRatio` changes via a `(resolution: Ndppx)` media query
- Fixed stale `innerWidth/innerHeight` on fullscreen exit: `fullscreenchange` listener re-measures immediately and once more in the next RAF
- Fixed kerning extractor choking on stroke glyph IDs (`this.font._push is not a function`) by filtering to source IDs only
- Fixed peer dependency for `three` to reference catalog version

Adds analytic stroke rendering (runtime and baked), a per-codepoint font fallback chain with `SlugFontStack`, `measureText` / `measureParagraph` APIs, and underline/strikethrough decorations — all without breaking existing baked font fixtures.
