---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**New measurement APIs**

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText` (width, actualBoundingBox\*, fontBoundingBox\*); constant-time via pre-computed glyph bounds
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line measurement respecting the same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — word-wrap producing lines that match `SlugText` shaped output exactly

**Font fallback stack**

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint(c)` picks the first covering font, `resolveText(text)` yields per-character assignments
- `SlugFont.hasCharCode(c)` — cheap codepoint-coverage check (baked: cmapLookup; runtime: opentype charToGlyph)
- `SlugStackText` — multi-font `Group` renderable; one `InstancedMesh` per contributing font, same shaping options as `SlugText`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` → `string[]` — per-codepoint font resolution with the same wrap policy as `SlugStackText`, enabling Canvas2D overlays to stay line-for-line
- `SlugFontStack.emitDecorations()` — builds decoration rects using primary-font metrics across multi-font runs

**Text decorations**

- `StyleSpan { start, end, underline?, strike? }` type exported from package root
- `SlugText.styles` — underline/strikethrough spans; accepted at construction and via runtime setter
- `SlugStackText.styles` — same API on the multi-font renderable; decoration line position follows the primary font
- Font decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) sourced from OpenType post/os2 tables at parse time and stored in baked JSON

**Outline / stroke**

- `SlugStrokeMaterial` — exported stroke-capable `NodeMaterial`; same instance-attribute layout and MVP/viewport lifecycle as `SlugMaterial`
- `SlugOutlineOptions` type exported from package root
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; `renderOrder = -1` so stroke draws behind fill
- `SlugText.setOpacity(v)`, `setOutlineWidth(v)`, `setOutlineColor(v)` — runtime-uniform setters, zero rebuild
- `SlugStackText.outline` — parity with `SlugText.outline`; one stroke mesh per font in the stack
- `SlugStackText.setOpacity(v)` — forwards to every per-font fill material

**Baked stroke (CLI)**

- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit` — bake stroke pseudo-glyphs at specified widths into the same curve+band textures at `glyphIdOffset + sourceId`; renders through the existing fill shader at 1× fill cost
- `BakedJSON.strokeSets?` optional field; absent for fonts baked without stroke flags (old fixtures load unchanged)
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up a pre-baked stroke `SlugGlyphData` by parameter set
- `slug-bake --output / -o` — custom output base path

**Stroke offsetter pipeline (internal)**

- Quadratic-Bezier stroke offsetter in `pipeline/strokeOffsetter.ts`: adaptive subdivision, per-segment Tiller-Hanson offset, join insertion (bevel/miter/round), cap insertion (flat/square/triangle/round), contour stitching into closed annular shapes
- `bakeStrokeForGlyph(source, options)` — integrates offsetter output into `SlugGlyphData` via `buildGpuGlyphData`; returns `null` for advance-only glyphs
- `buildGpuGlyph.ts` — shared `buildGpuGlyphFromCurves` / `buildGpuGlyphData` / `buildAdvanceOnlyGlyph` factories extracted from `fontParser` (refactor, no behavior change)

**Stem darkening and thickening**

- `SlugMaterial` and `SlugText` accept stem-darkening and thickening options controlling coverage scaling at small sizes

**Performance**

- `bandCount` 8 → 16: halves expected curves per band (~6.3 → ~3.2 mean), reducing per-fragment ALU proportionally
- `curveTexture` format `RGBA32F` → `RGBA16F` (8 bytes/texel vs 16); em-space coordinates fit half-float precision
- `bandTexture` format `RGBA32F` → `RG32F` (8 bytes/texel vs 16)
- `MAX_CURVES_PER_BAND` 64 → 40 (covers 100% of Inter corpus at p999=25; lowers register pressure)
- Fragment shader: non-crossing curves skip the sqrt/division/saturate block, saving ~30% ALU on empty-space fragments
- Stroke shader: Newton seeds reduced from 3×3 to 1×3 + 2 endpoints, halving WGSL compile time and cutting per-fragment cost ~⅔

**Bug fixes**

- `SlugText._setFont`: `visible` no longer set to `true` before the first `_rebuild`; prevents WebGPU "Binding size is zero" error on the R3F inter-frame between prop-set and `useFrame`
- `SlugStackText.dispose()`: now tears down outline child meshes and `SlugStrokeMaterial` instances before disposing shared geometries; eliminates GPU leaks on repeated scene toggles
- Stroke outline: quad now expands axis-aligned by `strokeHalfWidth` before AA dilation, fixing outer-ring clipping at glyph bbox corners
- Runtime shapers: `{ features: [] }` passed to `stringToGlyphs` to suppress `liga`/`rlig` substitution, preventing whitespace collapse at wrap points
- `parseFont`: emits advance-only entries (empty curves, real `advanceWidth`) for space, tab, and zero-width cmap'd glyphs
- Baked measure: `xMax > xMin` bounds-area gate replaces `curves.length > 0` heuristic; fixes zero ink bounds on baked path
- Kerning extraction filters to source glyph IDs only; stroke glyph IDs in extended ranges no longer cause `_push is not a function` errors

**BREAKING CHANGES**

- BAKED_VERSION 2 → 3: `curveTexture` switched to RGBA16F, `bandTexture` to RG32F, `MAX_CURVES_PER_BAND` lowered to 40 — all `.slug.bin`/`.slug.json` files must be re-baked with the updated `slug-bake` CLI
- BAKED_VERSION 3 → 4: decoration metrics (underlinePosition, underlineThickness, strikethroughPosition, strikethroughThickness) added to baked JSON — fonts baked without these fields must be re-baked to use `SlugText.styles`
- `SlugFontLoader.clearCache` removed (cache is already keyed on `url:runtime?`); BAKED_VERSION runtime validation machinery removed

This release ships the full measurement surface, per-codepoint font-stack fallback, underline/strikethrough decorations, analytic outline rendering, and a complete quadratic-Bezier stroke-offset bake pipeline, alongside two rounds of GPU bandwidth and shader compile-time improvements.

