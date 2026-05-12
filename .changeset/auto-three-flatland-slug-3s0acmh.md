---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New package: `@three-flatland/slug`

WebGPU-native analytic text rendering powered by TSL shaders. No WebGL, no GLSL, no rasterized atlases.

**Core rendering**
- `SlugFont`, `SlugText`, `SlugGeometry`, `SlugMaterial` — full rendering pipeline from font file to GPU draw call
- Analytic per-fragment coverage via winding-number fill shader; MSAA unnecessary
- GPU texture packing: `RGBA16F` curve texture + `RG32F` band texture (~45% smaller than initial format)
- Band count 8→16; `MAX_CURVES_PER_BAND` 64→40; shader skips non-crossing curves (~30% fewer ALU ops)
- Stem darkening + thickening options on `SlugMaterial`

**Baked font format & CLI**
- `slug-bake` CLI: offline font baking to `.slug.json` + `.slug.bin`; `--output / -o` for custom paths
- Baked path dispatches without loading opentype.js at runtime
- `slug-bake --stroke-widths / --stroke-join / --stroke-cap / --miter-limit`: pre-bake stroke sets into the same curve/band textures
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` looks up pre-baked stroke glyphs
- `bakeStrokeForGlyph` helper bridges the stroke offsetter into CLI and runtime

**Text shaping & layout**
- Runtime (opentype.js) and baked shapers; `{ features: [] }` passed to `stringToGlyphs` to prevent `liga`/`rlig` glyph-count drift at wrap points
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — line-break-accurate wrapping dispatching to runtime or baked path
- `SlugFontStack.wrapText` — per-codepoint font resolution with the same break policy as `shapeStackText`
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` (CanvasRenderingContext2D-aligned field names)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- Baked measure uses `bounds-area` gate (was `curves.length`); fixes zero ink bounds on baked path

**Font fallback stacks**
- `SlugFontStack(fonts)`: ordered per-codepoint fallback chain; `SlugFont.hasCharCode(c)` for coverage checks
- `SlugStackText`: `Group` with one `InstancedMesh` per font; per-draw-call texture binding
- `SlugFontStack.emitDecorations()` for decoration placement across mixed-font runs

**Text decorations**
- `StyleSpan { start, end, underline?, strike? }` — underline / strikethrough with font-metric placement
- Decoration rects encoded as sentinel instances in `SlugGeometry`; rendered in the same draw call as glyphs
- Underline/strike in icons (stack) mode uses primary font's declared line metrics

**Outline / stroke**
- `SlugStrokeMaterial` — analytic distance-to-curve stroke shader; bevel-via-min joins at no extra geometry cost
- `SlugText.outline: SlugOutlineOptions` — child `InstancedMesh` sharing fill geometry; runtime `setOutlineWidth` / `setOutlineColor` (zero rebuild)
- `SlugText.setOpacity(value)` for fill-invisible outline-only mode
- `SlugStackText.outline` / `setOpacity` — parity with `SlugText`
- Stroke quad expansion is axis-aligned (was diagonal-normal, causing clipping at glyph extents)
- Stroke shader compile time halved: single Newton seed with 3 iterations vs. 3 seeds × 3

**Stroke offsetter (build-time pipeline)**
- Adaptive subdivision of quadratic Béziers before offsetting (`subdivideForOffset`)
- Per-segment Tiller-Hanson offset; degenerate and parallel cases handled
- Join geometry: bevel, miter (with `miterLimit` fallback to bevel), round
- Cap geometry: flat, square, triangle, round
- Contour stitching into closed annular rings (closed source) or single closed loops (open source)

**Shared GPU glyph builder**
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — single factory shared by font parser, stroke offsetter, and future SVG path support
- Advance-only glyph entries (space, tab, zero-width controls) emitted by runtime parser, matching baked CLI output

**Examples (React + Three, 1:1 parity)**
- Canvas2D onion / diff / split compare overlay with draggable handle
- Click-to-measure: cyan ink bounds + dashed font envelope overlays; tweakpane monitors
- Hover-measure mode replacing click-to-style interaction
- `[Lorem | Icons]` radio toggle; Icons mode loads FA-Solid PUA subset via `SlugFontStack`
- `[Off | Onion | Diff | Split]` compare mode; Off hides overlay entirely
- Outline folder: style / width / color controls wired to runtime setters
- Styles folder: underline / strikethrough preset scope controls
- Renderer set to `antialias: false` (analytic coverage; MSAA is pure overhead)
- `DprSync` component keeps R3F canvas pixel ratio in sync after monitor swap / fullscreen

## BREAKING CHANGES

- **BAKED_VERSION 2→3**: `RGBA16F` curve + `RG32F` band textures; all `.slug.bin`/`.slug.json` files must be re-baked with the updated CLI
- **BAKED_VERSION 3→4**: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) added to baked format; re-bake required

Initial release of `@three-flatland/slug` spanning the full rendering pipeline from font parsing through Phase 5 stroke baking, with measurement, decoration, fallback stack, and outline APIs.

