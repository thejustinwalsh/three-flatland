---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## Stroke Rendering (Phase 4–5)

- `SlugText.outline` — opt-in child `InstancedMesh` sharing glyph geometry with `SlugStrokeMaterial`; runtime `setOutlineWidth` / `setOutlineColor` update uniforms without rebuild
- `SlugStrokeMaterial` — TSL `NodeMaterial` with `distanceToQuadBezier` fragment shader; analytic bevel-via-min joins; sub-pixel strokes widen to 1px minimum
- `SlugOutlineOptions` — exported `{ width, color }` type; `color` accepts `number | string | Color`
- `setOpacity(value)` added to `SlugText` (and `SlugStackText`) for fill-only / outline-only compositing
- Fixed stroke quad expansion to be axis-aligned (`W + 2·halfWidth` × `H + 2·halfWidth`); previously clipped square at glyph extents due to diagonal-normal dilation
- Halved stroke shader WGSL size by reducing Newton seeds from 3 to 1 (t=0.5) + endpoints; cuts first-pipeline-compile hitch ~50% and per-fragment GPU cost ~⅔

## Stroke Offsetter (Phase 5, baked strokes)

- New `strokeOffsetter(curves, closed, options)` pipeline — full quadratic-Bézier stroke offset: adaptive subdivision → per-segment Tiller-Hanson offset → join geometry (bevel / miter / round) → cap geometry (flat / square / triangle / round) → closed contour stitch
- `bakeStrokeForGlyph(source, options)` — converts a source `SlugGlyphData` to a stroked glyph via the offsetter; returns `null` for advance-only (space/tab) and empty glyphs
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` flags; baked `.slug.{json,bin}` embeds a `strokeSets` array with per-set `glyphIdOffset`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke glyph by matching stroke set; returns `null` if no set matches
- Stroke glyphs render through the existing fill shader — no new shader variant, 1× fill cost at runtime
- Kerning extraction filters to source IDs only, preventing errors when the kern extractor encounters stroke-range IDs

## Font Stack & Multi-Font Rendering (Phase 3)

- `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint(c)` / `resolveText(text)` for per-character font assignment
- `SlugFont.hasCharCode(c)` — codepoint-coverage check for stack routing
- `SlugStackText extends Group` — one `InstancedMesh` per font in the stack; `styles`, `outline`, `setOpacity()` at full parity with `SlugText`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` — line-wrap with per-codepoint font resolution; keeps Canvas2D/DOM mirrors in sync with `SlugStackText` output
- `SlugFontStack.emitDecorations()` — decoration rects keyed on positioned-glyph object (not glyphId) to disambiguate same ID across stacked fonts
- `SlugStackText.dispose()` now correctly tears down outline meshes before shared geometries

## Text Decorations (Phase 2)

- `StyleSpan { start, end, underline?, strike? }` — underline and strikethrough decoration spans
- `pipeline/decorations.ts` — pure post-pass over shaped glyphs; one rect per (line, kind, contiguous styled run)
- `SlugGeometry.setGlyphs` accepts optional `decorations` array; appends rect-sentinel instances rendered in the same draw call
- `SlugText` accepts `styles?: StyleSpan[]` (constructor + runtime setter)
- `BAKED_VERSION` 3 → 4; font-declared decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) baked into `BakedJSON.metrics`

## Measurement API (Phase 1)

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line ink and font-envelope bounds, aligned with `CanvasRenderingContext2D.measureText` field names
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience matching `SlugText` layout
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — dispatches to baked or runtime path
- Baked measure gates ink accumulation on bounds area (`xMax > xMin`) instead of `curves.length > 0`, fixing zero-bounds regression on the baked path

## Baked Font Pipeline

- `slug-bake` CLI — `--output / -o` flag for custom output base path
- `BAKED_VERSION` 2 → 3: `curveTexture` → `RGBA16F` (8 bytes/texel), `bandTexture` → `RG32F` (8 bytes/texel), `MAX_CURVES_PER_BAND` 64 → 40; bake-time warning when a band exceeds the shader bound
- `buildGpuGlyphData` / `buildGpuGlyphFromCurves` / `buildAdvanceOnlyGlyph` — shared contour-to-GPU pipeline factored out of `fontParser`; used by font parser, stroke offsetter, and future SVG path support
- `parseFont` now emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for space, tab, and zero-width controls
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` to prevent `liga`/`rlig` from collapsing whitespace and drifting word-boundary checks
- `SlugFontLoader` `BAKED_VERSION` migration machinery removed (package pre-release)
- `SlugText._setFont` defers `visible = true` until first `_rebuild` to avoid WebGPU zero-size-binding error on R3F's first render pass

## Performance

- `bandCount` 8 → 16: halves expected curves per band (mean ~6.3 → ~3.2); band texture grows ~1.5× on disk
- Shader skips post-rootCode solve / coverage / weight work for non-crossing curves (`If(rootCode > 0)`); ~30% of curves in a band branch-skip per fragment
- `SlugText._setFont` only rebuilds the outline mesh when outline is already enabled

## Core Rendering

- `SlugMaterial` / `SlugText` — stem darkening and thickening options
- `slugDilate` — dynamic half-pixel AA dilation for quads; `strokeHalfWidth` parameter removed (expansion now handled axis-aligned in `SlugStrokeMaterial`)
- Examples migrated from Web Awesome (`wa-*`) to `@three-flatland/tweakpane`; all `@awesome.me/webawesome` imports removed
- Three example relocated from `examples/vanilla/slug-text` → `examples/three/slug-text`; React example added with full Canvas2D comparison overlay (onion / diff / split modes)
- Icon-fallback demo: FA-Solid PUA subset baked to `fa-solid.slug.{json,bin}` (~71 KB bin); Canvas2D compare uses `stack.wrapText` for line-break parity
- Compare mode gains `Off` option; `DprSync` component keeps R3F canvas pixel ratio in sync after monitor swaps and fullscreen transitions

## BREAKING CHANGES

- `BAKED_VERSION` bumped twice (2 → 3 → 4). All `.slug.bin` / `.slug.json` files must be re-baked with the current `slug-bake` CLI before use.
- `slugDilate`'s `strokeHalfWidth` parameter removed; callers that passed it must switch to `SlugStrokeMaterial`'s axis-aligned vertex expansion.

Phase 5 stroke-set bake and full quadratic-Bézier stroke-offsetter pipeline land alongside Phase 4 analytic outline rendering, Phase 3 font-stack fallback, Phase 2 text decorations, and Phase 1 measurement APIs. Includes two GPU bandwidth optimizations and the `slug-bake` CLI.

