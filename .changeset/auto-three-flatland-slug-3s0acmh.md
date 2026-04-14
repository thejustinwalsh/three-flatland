---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

**Rendering pipeline**

- New `@three-flatland/slug` package: WebGPU analytic text rendering via winding-number coverage with TSL shaders
- `SlugFont`, `SlugText`, `SlugGeometry`, `SlugMaterial` — core rendering classes; instanced GPU draw calls with band-accelerated coverage
- `slug-bake` CLI (`--output / -o`) converts TTF/OTF to baked `.slug.{json,bin}` for lazy opentype.js loading; `SlugFontLoader` URL-keyed cache
- Dynamic quad dilation for half-pixel AA via `slugDilate` TSL shader

**Performance**

- `curveTexture` → RGBA16F, `bandTexture` → RG32F: ~50% bandwidth reduction; baked file size ~45% smaller
- `MAX_CURVES_PER_BAND` 64 → 40 (corpus-tuned); `bandCount` 8 → 16 (halves mean curves per band)
- Shader early-exit for non-crossing curves skips sqrt + divisions for ~30% of band curves

**Measurement API**

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` (aligned with `CanvasRenderingContext2D.measureText`)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` for line-break parity with Canvas2D overlays
- Baked measure fixed: `bounds-area` gate replaces `curves.length` heuristic (was silently returning zero ink bounds)
- Constant-time per-call cost via pre-computed `SlugGlyphData.bounds`

**Text decorations**

- `StyleSpan { start, end, underline?, strike? }` — character-range decoration via `SlugText.styles`
- `SlugFont.emitDecorations()` emits `DecorationRect[]` as rect-sentinel instances rendered in the same draw call
- Decoration metrics (underline/strikethrough position + thickness) sourced from OpenType post/os2 tables and baked into font data

**Stem rendering**

- Stem darkening and thickening options on `SlugMaterial` and `SlugText`

**Multi-font stacks**

- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint` / `resolveText` / `hasCharCode`
- `SlugStackText` extends `Group` — one `InstancedMesh` per contributing font, one draw call per font
- `SlugFontStack.wrapText` uses same break policy as `shapeStackText` for Canvas2D overlay line-break parity
- `parseFont` emits advance-only entries for no-outline glyphs (space, tab, zero-width controls)
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` to prevent `liga`/`rlig` collapsing word boundaries

**Outline rendering**

- `SlugStrokeMaterial` — distance-to-curve TSL stroke shader; bevel-via-min exterior joins
- `SlugText.outline` — opt-in child `InstancedMesh` sharing fill geometry; `setOutlineWidth` / `setOutlineColor` update uniforms in place (no rebuild)
- `SlugOutlineOptions` exported from package root; `color` accepts `number | string | Color`
- `SlugText.setOpacity(value)` for fill-only opacity control
- Stroke quad expansion fixed: axis-aligned per-vertex push avoids clipping at glyph extents
- Stroke shader compile cost halved: single Newton seed reduces WGSL size ~50%; per-fragment runtime cost also halved
- `SlugText._setFont` rebuilds outline only when already enabled — no GPU cost for fill-only users

**Bug fixes**

- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild`; prevents WebGPU zero-binding error in R3F on first render

**Internal refactors**

- `buildGpuGlyph.ts` centralises contour-to-GPU-data pipeline for `fontParser`, future SVG and stroke-offset producers

**Examples (React + Three, 1:1 parity)**

- Canvas2D comparison overlay: onion / split / diff modes with draggable handle and luminance-weighted diff heatmap
- Measure folder: click-to-select line shows ink (cyan) and font-envelope (yellow) overlays; paragraph monitors live-update
- Styles folder: underline/strikethrough demo via `StyleSpan` API
- Outline folder: Fill / Outline / Both style toggle; live width slider and color picker via Tweakpane
- Icons scene: FA-Solid baked subset (`fa-solid.slug.{json,bin}`, ~71 KB) against `[Inter, FA-Solid]` stack; Canvas2D compare mirrors per-codepoint fallback
- `antialias: false` on renderer — analytic coverage makes MSAA redundant (4× sample cost, zero visual gain)
- Tweakpane controls replace Web Awesome across all examples; `useStatsMonitor` for GPU-time monitoring

New `@three-flatland/slug` package providing WebGPU analytic text rendering with TSL shaders, including measurement, text decorations, multi-font fallback stacks, and runtime outline rendering with live-uniform width and color control.

