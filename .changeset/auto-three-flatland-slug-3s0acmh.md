---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New Features

### Text Rendering Pipeline
- Initial `@three-flatland/slug` package: GPU-accelerated analytic text rendering via WebGPU + TSL
- Font parsing, text shaping, and GPU texture packing pipeline
- `SlugText` Three.js object with `SlugMaterial` / `SlugGeometry`
- React subpath (`three-flatland/react`) with R3F-compatible JSX props
- `SlugFont.wrapText(text, fontSize, maxWidth?)` for line-break matching between Slug and Canvas2D

### Baked Fonts & CLI
- `slug-bake` CLI tool: converts runtime `.ttf` fonts to `.slug.{json,bin}` baked format for zero-opentype-js load cost
- `--output / -o` flag for custom output base paths
- `--stroke-widths / --stroke-join / --stroke-cap / --miter-limit` flags to pre-bake stroke glyph sets into the font file
- `BAKED_VERSION` bumped through 2 → 3 → 4 with included fixture re-bakes

### Measurement APIs
- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line block metrics
- Baked path fixed: bounds-area gate instead of `curves.length` heuristic so baked glyphs return correct ink bounds

### Text Decorations
- `StyleSpan { start, end, underline?, strike? }` API for underline and strikethrough spans
- `SlugFont.emitDecorations` / `pipeline/decorations.ts` post-pass generates decoration rects in the same draw call as glyph fills
- `SlugText` accepts `styles?: StyleSpan[]` at construction and as a runtime setter

### Font Stack & Multi-Font Rendering
- `SlugFontStack(fonts)` — ordered per-codepoint font fallback chain
- `SlugFont.hasCharCode(c)` — coverage check via cmap
- `SlugStackText` — `THREE.Group` with one `InstancedMesh` per font; one draw call per contributing font
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — line-break logic matching `SlugStackText` output for external Canvas2D overlays
- `SlugFontStack.emitDecorations()` for underline/strike across mixed-font runs

### Outline / Stroke Text (Phase 4)
- `SlugStrokeMaterial` — stroke NodeMaterial sharing the fill mesh's instance attributes; uniform-only `color`, `opacity`, `strokeHalfWidth`
- `SlugText.outline: SlugOutlineOptions` — opt-in child stroke mesh (renderOrder -1); `setOutlineWidth` / `setOutlineColor` zero-rebuild setters
- `SlugText.setOpacity(value)` — fade fill without geometry rebuild (enables outline-only mode)
- `SlugStackText.outline` / `SlugStackText.styles` / `SlugStackText.setOpacity()` — full feature parity with `SlugText`
- `SlugOutlineOptions` exported from package root; `color` accepts `number | string | Color`

### Stroke Offsetter (Phase 5)
- `pipeline/strokeOffsetter.ts` — adaptive subdivision → per-segment Tiller-Hanson offset → join insertion (bevel/miter/round) → cap insertion (flat/square/round/triangle) → contour stitching
- `bakeStrokeForGlyph(source, options)` — converts source glyph contours to pre-baked stroke `SlugGlyphData`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — look up pre-baked stroke glyph by parameter set
- `BakedJSON.strokeSets` optional field; fonts baked without stroke flags load unchanged
- `pipeline/buildGpuGlyph.ts` — shared contour-to-GPU factory used by font parser, stroke offsetter, and future SVG path support

### Stem Darkening & Rendering Quality
- `SlugMaterial` / `SlugText` gain stem darkening and thickening options
- Renderer antialias defaults to `false` — Slug uses analytic per-fragment coverage; MSAA adds 4× cost for no visual gain

## Performance

- `curveTexture` → `RGBA16F` (half-float): 8 bytes/texel vs 16; `bandTexture` → `RG32F`: halves bandwidth
- `bandCount` 8 → 16: cuts expected curves per band ~50%; fragment ALU scales linearly
- `MAX_CURVES_PER_BAND` 64 → 40: covers 100% of Inter's glyph corpus with lower shader register pressure
- Shader: skip post-rootCode solve for non-crossing curves (~30% of curves per band)
- Stroke shader: reduced Newton seeds (single seed + endpoints) cuts WGSL size ~50% and halves first-draw pipeline compile time

## Bug Fixes

- Outline quads axis-aligned expansion: stroke was clipping at glyph bbox corners due to diagonal dilation; fixed to per-axis halfWidth expansion before AA pass
- `SlugText._setFont` deferred `visible = true` until first `_rebuild` to avoid zero-binding WebGPU error on R3F pre-frame pass
- `SlugStackText.dispose()` now tears down outline child meshes and `SlugStrokeMaterial`s before disposing shared geometries
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — disables `liga`/`rlig` so word-boundary detection is stable
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab) matching bake CLI behavior
- Kerning extraction filters to source IDs only; stroke glyph IDs in extended ranges no longer cause `_push is not a function`
- Compare overlay `'off'` mode: hides canvas, split handle, and labels; `redrawCompare` short-circuits to avoid CPU work when hidden
- DPR re-sync on R3F canvas after monitor swap / fullscreen via `<DprSync>` component

## Examples

- Slug-text example migrated from `examples/vanilla` → `examples/three`; React and Three examples maintained at 1:1 parity
- Canvas2D overlay with onion-skin / split / diff compare modes in both React and Three examples
- Font stack demo: `[Lorem | Icons]` toggle; Icons mode uses FA-Solid PUA codepoints baked with `slug-bake`
- Interactive outline controls: Fill / Outline / Both style, width slider, color picker
- Click-to-measure line selection with cyan ink bounds and dashed yellow font-envelope overlays; paragraph monitors live-update
- Migrated from Web Awesome controls to `@three-flatland/tweakpane` in both examples

Both examples use `@react-three/fiber/webgpu` and register all custom Three.js classes via `extend()` before JSX use.

