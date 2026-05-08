---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New features

### Stroke rendering pipeline (Phase 4–5)
- `SlugText.outline` — opt-in text outline with runtime-uniform `width` and `color`; zero geometry rebuild on change
- `SlugStrokeMaterial` — TSL stroke NodeMaterial sharing fill geometry; exported from package root with `SlugOutlineOptions`
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(v)` — live uniform setters, no rebuild
- `SlugText.setOpacity(v)` — fade fill for outline-only mode
- Stroke fragment shader: analytic `distanceToQuadBezier` + `slugStroke` coverage; bevel-via-min joins; sub-pixel strokes widen to 1 px minimum
- Axis-aligned quad expansion in vertex shader; halved Newton seed count cuts WebGPU pipeline compile time ~50% and per-fragment cost ~66%

### Quadratic-Bezier stroke offsetter (Phase 5 Tasks 16–17)
- `subdivideForOffset` — adaptive subdivision ensuring single-quadratic offset fits within epsilon
- `offsetSegment` — Tiller-Hanson per-segment offset with parallel-tangent fallback
- Join insertion: bevel, miter (with miterLimit fallback), round (≤60°/segment quadratic arcs)
- Cap insertion: flat, square, triangle, round for open-contour endpoints
- `strokeOffsetter(curves, closed, options)` — complete closed-contour output for fill pipeline
- `bakeStrokeForGlyph(source, options)` — bridges offsetter to GPU data; advance-only (space/tab) returns null
- `slug-bake` gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; stroke pseudo-glyphs packed into same curve+band textures at `glyphIdOffset + sourceId`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up pre-baked stroke glyph data
- `BakedJSON.strokeSets` optional field; absent for fonts baked without stroke flags

### Font stack and fallback
- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`
- `SlugFont.hasCharCode(c)` — codepoint coverage check
- `SlugStackText extends Group` — one `InstancedMesh` per font in stack; one draw call per contributing font
- `SlugStackText.styles` — underline/strike spans via `SlugFontStack.emitDecorations()`
- `SlugStackText.outline` — per-font `SlugStrokeMaterial` sibling meshes; `setOutlineWidth`, `setOutlineColor`, `setOpacity` parity with `SlugText`
- `SlugStackText.dispose()` — full teardown of outline meshes, fill meshes, geometries, and materials

### Text measurement API
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — CanvasRenderingContext2D-aligned; baked path uses bounds-area heuristic
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — wraps + measures; respects same `lineHeight` default (1.2) as `SlugText`

### Text decoration rendering
- `StyleSpan { start, end, underline?, strike? }` — manual-aligned span type (Slug §2.7/§2.8)
- `pipeline/decorations.ts` — `emitDecorations` post-pass; one rect per contiguous styled run per line
- `SlugText` / `SlugFont` accept `styles?: StyleSpan[]`; decorations rendered in same draw call via rect-sentinel instances

### Baked font format and CLI
- `slug-bake` CLI with `--output / -o` for custom output paths
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — baked + runtime path, used by Canvas2D compare overlays
- `SlugFontStack.wrapText` — per-codepoint font resolution through wrap pipeline via `wrapLinesStack.ts`
- `parseFont` emits advance-only entries for cmap'd no-outline glyphs (space, tab, zero-width)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` to prevent ligature substitution from drifting word-boundary checks
- `SlugText._setFont` defers `visible = true` until first `_rebuild` with real glyph data

### Shared contour-to-GPU pipeline
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — centralized factory in `pipeline/buildGpuGlyph.ts`; used by fontParser, offsetter, and future SVG path producer

## Performance improvements
- `curveTexture` → RGBA16F (half bandwidth), `bandTexture` → RG32F (eliminates wasted channels)
- `bandCount` 8 → 16: halves expected curves/band (~6.3 → ~3.2 mean); bin size grows ~1.5×
- `MAX_CURVES_PER_BAND` 64 → 40 (p999 of Inter corpus = 25, max = 38); reduces shader register pressure
- Shader skips post-`rootCode` solve for non-crossing curves (~30% of band curves)
- Antialias disabled in examples (analytic per-fragment AA; MSAA adds 4× sample cost for zero gain)

## Bug fixes
- Stroke quad clipping: hoist axis-aligned expansion out of `slugDilate`; each axis expands independently by `strokeHalfWidth`
- `SlugText._setFont` skips outline rebuild when outline is not enabled
- `SlugStackText.dispose()` previously left outline child meshes and `SlugStrokeMaterial` instances alive on scene toggle
- WebGPU "Binding size is zero" blank canvas: visibility deferred until `_rebuild` writes real glyph data
- Whitespace collapse at wrap points: `{ features: [] }` stops `liga`/`rlig` from shortening the glyph array vs `text.length`
- Baked `measureText`: `curves.length > 0` heuristic replaced with bounds-area check (curves are GPU-only at runtime)
- Kerning extraction now filters to source IDs only; stroke glyph IDs caused `this.font._push is not a function`

## Breaking changes

### BAKED_VERSION bumps
- 2 → 3: `curveTexture` format change (RGBA16F) and band layout changes; old `.slug.bin/.json` files must be re-baked
- 3 → 4: decoration metrics added to `BakedJSON.metrics`; included fixtures re-baked

### Removed APIs
- `SlugFontLoader.clearCache` removed (static cache already keyed on `url:runtime?`)
- `BAKED_VERSION` migration machinery removed from `SlugFontLoader`/`baked.ts`

---

Initial package release through Phase 5 of the Slug text rendering roadmap. Covers the full pipeline from font parsing and GPU texture packing through analytic stroke rendering, per-codepoint font stacks, text measurement and decoration, and a baked-glyph stroke offsetter for high-performance outlined text.

