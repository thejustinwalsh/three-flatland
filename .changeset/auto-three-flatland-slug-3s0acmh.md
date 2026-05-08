---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

**Stroke rendering (Phase 4 + Phase 5 prep)**

- `SlugText.outline` — opt-in child stroke mesh sharing the fill geometry; runtime-uniform `setOutlineWidth` / `setOutlineColor` with zero rebuild
- `SlugStrokeMaterial` — TSL stroke NodeMaterial using analytic distance-to-quadratic-Bezier coverage; exported from package root with `SlugOutlineOptions`
- `SlugText.setOpacity(value)` — fade fill for outline-only mode
- Fix: stroke quad expansion now axis-aligned (prevents clipping at glyph extents); stroke shader Newton seeds reduced from 3×3 to 1×3, halving pipeline compile time and GPU runtime cost
- Stroke offsetter pipeline (`strokeOffsetter`) — full quadratic-Bezier offsetter with adaptive subdivision, per-segment Tiller-Hanson offset, miter/bevel/round joins, flat/square/round/triangle caps, and contour stitching into closed annular rings
- `bakeStrokeForGlyph(source, options)` — bridge from offsetter output to `SlugGlyphData` for bake and async runtime paths
- `slug-bake` gains `--stroke-widths` / `--stroke-join` / `--stroke-cap` / `--miter-limit` flags; stroke pseudo-glyphs baked into the same curve+band textures at `glyphIdOffset + sourceId`
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — retrieves pre-baked stroke glyph data; `BakedJSON.strokeSets` optional field carries stroke set metadata

**Text decorations**

- `StyleSpan { start, end, underline?, strike? }` — per-range text decoration API on `SlugText` (constructor + runtime setter)
- `SlugFont.emitDecorations` / `pipeline/decorations.ts` — pure post-pass producing `DecorationRect[]` instances rendered in the same draw call via rect-sentinel instances
- Decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) added to `SlugFont` and `BakedJSON.metrics`; fixtures re-baked (BAKED_VERSION 3 → 4, then version-gate machinery removed pre-release)

**Font stacks and fallback**

- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint` / `resolveText` / `hasCharCode`
- `SlugStackText extends Group` — multi-font renderable with one `InstancedMesh` per contributing font; `styles`, `outline`, `setOpacity`, `dispose` at feature parity with `SlugText`
- `SlugFontStack.wrapText(text, fontSize, maxWidth?)` / `SlugFont.wrapText` — line-break arrays matching the shaped output for Canvas2D overlays and DOM mirrors; backed by `pipeline/wrapLinesStack.ts`
- `SlugFontStack.emitDecorations()` — per-glyph advance lookup keyed on positioned-glyph object for correct cross-font decoration rendering

**Measurement API**

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — aligns field names with `CanvasRenderingContext2D.measureText`; backed by baked or runtime path
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText` + per-line `measureText`

**Performance**

- `curveTexture` → RGBA16F, `bandTexture` → RG32F — ~50% texture bandwidth reduction; baked binary size ~45% smaller
- `bandCount` 8 → 16 — halves average curves per fragment; `MAX_CURVES_PER_BAND` 64 → 40
- Shader skips post-solve work for non-crossing curves (~30% of band curves)
- `antialias: false` in examples (Slug computes analytic per-fragment coverage; MSAA is zero-gain at 4× cost)

**Pipeline internals**

- Shared `buildGpuGlyph.ts` — `buildGpuGlyphFromCurves` / `buildGpuGlyphData` / `buildAdvanceOnlyGlyph` factored out of `fontParser` for reuse by offsetter and future SVG path producer
- `parseFont` emits advance-only entries for space/tab/zero-width cmap'd glyphs matching the bake CLI post-pass
- Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — prevents `liga`/`rlig` from collapsing tokens and drifting word-boundary checks
- `SlugText._setFont` no longer sets `visible=true` before first `_rebuild` — prevents WebGPU pipeline error on uninitialized instance buffer
- `SlugFontLoader` `BAKED_VERSION` machinery removed (pre-release; no migration story)

**CLI**

- `slug-bake` gains `--output` / `-o` for custom output base paths
- `slug-bake` gains stroke flags: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit`

**Examples (Three.js + React, 1:1 parity)**

- Migrated `examples/vanilla/slug-text` → `examples/three/slug-text`; both examples auto-discovered by shared MPA
- Canvas2D compare overlay (onion / split / diff modes) in both examples; draggable split handle, diff heatmap, computing indicator
- `[Lorem | Icons]` radio toggle; Icons mode renders `SlugStackText` against `[Inter, FA-Solid]` stack with a 12-icon FA-Solid PUA subset baked via `slug-bake`
- Compare overlay uses `stack.wrapText` in icons mode for line-break agreement; `drawCompareText` accepts `preWrappedLines?` override
- Compare mode `Off` option to hide the overlay entirely
- Measure overlay: hover any rendered line to show cyan ink bounds + dashed yellow font-envelope overlays; paragraph monitors live-update
- `DprSync` component (React) re-syncs R3F canvas pixel ratio on monitor swap / OS zoom / fullscreen transition
- Tweakpane-based controls in both examples (migrated from Web Awesome)

**BREAKING CHANGES**

- Baked `.slug.bin` / `.slug.json` files from before this release are incompatible. Re-run `slug-bake` to regenerate. (BAKED_VERSION was bumped twice and the version-gate machinery subsequently removed while the package is pre-release.)
- `SlugFontLoader.clearCache` removed (cache is already url-keyed; no callers in the wild)
- `slugDilate` `strokeHalfWidth` parameter removed; stroke expansion is now handled axis-aligned in `SlugStrokeMaterial`'s vertex shader

Adds analytic stroke rendering, text decorations, multi-font fallback stacks, measurement APIs, and a full quadratic-Bezier stroke offsetter pipeline; includes significant GPU performance improvements and a baked-format update.

