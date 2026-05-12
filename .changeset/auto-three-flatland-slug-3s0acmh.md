---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New features

- Initial `@three-flatland/slug` package: analytic WebGPU/TSL text rendering pipeline — font parsing, glyph shaping, GPU texture packing (curve + band textures), instanced quad rendering via `SlugText`
- `slug-bake` CLI: pre-bake `.ttf`/`.otf` fonts into compact `.slug.{json,bin}` pairs; `--output`/`-o` flag for custom output paths; `--stroke-widths`/`--stroke-join`/`--stroke-cap`/`--miter-limit` flags for baking pre-computed stroke glyph sets into the baked format
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — word-wrap with break-at-last-space + hard-break fallback; dispatches to runtime (opentype.js) or baked path
- `SlugFont.measureText(text, fontSize)` — single-line metrics aligned with `CanvasRenderingContext2D.measureText` (width, ink bounds, font bounds)
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` — multi-line block metrics; respects same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.hasCharCode(codepoint)` — cheap codepoint coverage check via cmap
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke glyph from a matching stroke set
- `StyleSpan` type + `SlugText.styles` — underline and strikethrough decorations over character ranges; decoration rects appended as sentinel instances in the same draw call
- `SlugFontStack(fonts)` — per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`
- `SlugStackText` — multi-font `Group` with one `InstancedMesh` per font; supports `styles`, `outline`, `setOpacity`; `dispose()` cleans up fill meshes, outline meshes, and shared geometries
- `SlugText.outline` — opt-in child stroke mesh sharing fill geometry; runtime-uniform `setOutlineWidth`/`setOutlineColor`; `setOpacity` for fill-opacity control
- `SlugStrokeMaterial` + `SlugOutlineOptions` exported from package root
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline reused by font parser, stroke offsetter, and future SVG shape path
- Quadratic-Bezier stroke offsetter (`strokeOffsetter`) — adaptive subdivision, per-segment Tiller-Hanson offset, miter/round/bevel joins, flat/square/round/triangle caps, contour stitching into closed annular rings or open-path outlines
- `bakeStrokeForGlyph(source, options)` — bridges offsetter output to `SlugGlyphData` for CLI bake pass and future runtime async fallback
- Stem darkening + thickening options on `SlugMaterial` and `SlugText`

### Performance

- Curve texture format: `RGBA16F` (8 bytes/texel, down from 16); band texture: `RG32F` (8 bytes/texel, down from 16) — ~45% smaller baked files
- Band count: 8 → 16, halving expected curves-per-band and per-fragment ALU cost
- `MAX_CURVES_PER_BAND`: 64 → 40, reducing shader register pressure (backed by corpus analysis of Inter's full glyph set)
- Shader: non-crossing curves skip the solve + coverage path — ~30% of curves in a band per fragment
- Stroke shader: single Newton seed (down from three), halving WGSL compile time and per-fragment runtime cost; axis-aligned quad expansion replacing diagonal-normal expansion eliminates stroke clipping at glyph bbox corners

### Bug fixes

- Stroke quad outer ring no longer clips square at glyph x/y extents (was using diagonal-normal dilation)
- `SlugText` visibility now toggles inside `_rebuild` once glyph data is written, preventing WebGPU pipeline errors on first R3F render
- Runtime shapers pass `{ features: [] }` to opentype.js, fixing whitespace collapse at wrap points caused by `liga`/`rlig` shortening the glyph array
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls), matching bake CLI behavior
- Baked `measureText` now uses bounds-area (`xMax > xMin`) to gate ink accumulation, fixing zero-ink-bounds for all glyphs on the baked path
- Kerning extraction filters to source glyph IDs only, avoiding `_push is not a function` errors when stroke glyph IDs are in the kern table range

### BREAKING CHANGES

- **BAKED_VERSION 1 → 4**: all `.slug.bin`/`.slug.json` fixtures must be re-baked with the current `slug-bake` CLI. The format changed twice: curve texture moved to RGBA16F and band texture to RG32F (version 3), and decoration metrics added to `BakedJSON.metrics` (version 4).
- `BAKED_VERSION` machinery removed from `SlugFontLoader` — version mismatch now throws; no silent migration path (package was unreleased).

---

Initial release of `@three-flatland/slug` — a WebGPU-native analytic text renderer built on TSL. Ships font loading (runtime + baked), text shaping, wrapping, measurement, decorations, multi-font stacks, and a stroke rendering system with a full quadratic-Bezier offsetter for baked stroke glyph sets.

