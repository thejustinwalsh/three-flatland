# @three-flatland/slug

## 0.1.0-alpha.5

### Patch Changes

- bf769ca: Register the Slug font baker with `flatland-bake` so it self-discovers.

  `slug-bake` worked, but the package declared no `flatland.bake` entry, so
  `flatland-bake --list` never showed it — while the dispatcher's own help text
  named `@three-flatland/slug` as its example of a registered baker. The baker
  entry wraps the existing bin rather than pointing at `src/cli.ts`, which
  self-executes at import.

## 0.1.0-alpha.4

### Patch Changes

- 75fcf94: > Branch: feat/esm-oxc-migration

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/196
  - Fixed all real-source oxlint errors across the monorepo (0 errors remaining); `exhaustive-deps` kept as advisory warnings, matching prior eslint config
  - Applied oxlint autofixes and reformatting (unused imports/vars removed, `import type` enforced, floating promises voided, useless spreads removed)
  - Excluded e2e/spec test harnesses from lint scope (previously uncovered by eslint)
  - No functional/API changes — internal code-quality and tooling cleanup only, verified via typecheck (45/45) and build (46/46)

  No breaking changes.

  Internal lint and code-quality cleanup as part of the ESM/oxlint migration; no user-facing behavior changes.

## 0.1.0-alpha.3

### Minor Changes

- f40af56: > Branch: worktree-flpak-binary-format

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/91

  ## New baked-font format: single `.slug.glb`

  Baked fonts are now stored as a single standard glTF binary (`.slug.glb`) instead of the previous two-file `.slug.json` + `.slug.bin` pair. All font data (glyphs, cmap, kern, band offsets) lives in standard glTF accessors tagged with the `FL_slug_font` extension.

  ### Loader
  - `SlugFontLoader` fetches and decodes `.slug.glb` at runtime; reconstructs `SlugGlyphData`, cmap, and kern from glTF accessor columns
  - Band data sliced from flat `USHORT bandData` accessor via `FLOAT bandOffsets` CSR prefix-sum (word indices)
  - Corrupt or truncated `.slug.glb` degrades gracefully to the opentype.js runtime path; `response.arrayBuffer()` failure also falls back
  - Schema version gating: `unpackBaked` rejects any `.slug.glb` whose `FL_slug_font` version exceeds the build constant (fail-loud instead of silent misread)

  ### Baker (`@three-flatland/slug/bake` subpath)
  - `packBaked` returns a `Uint8Array` GLB; glyphs sorted by `glyphId` ascending; band offsets use CSR word-index prefix-sum
  - `FlSlugFontExtension` exported from `@three-flatland/slug/bake` — register on `NodeIO`/`WebIO` to let glTF-Transform tooling round-trip `.slug.glb` without dropping font data
  - All 16-bit writes (band/cmap/kern) validated via `assertUint16`/`assertInt16`; out-of-range values throw instead of silently wrapping
  - `@gltf-transform/core` scoped to `./bake` only — browser runtime bundle (`baked.js`, `SlugFontLoader.js`, `index.js`) remains glTF-Transform-free

  ### CLI (`slug-bake`)
  - Bundled for Node ESM so it runs without a tsx shim
  - Writes one `.slug.glb` per font; `--output` suffix stripping fixed (no more `MyFont.slug.slug.glb`)
  - Windows uses shell to resolve the `tsx.cmd` shim; Unix uses `execFileSync` with an args array

  ### Validation hardening
  - `readGlb`: accessor byte range checked against its declared `bufferView.byteLength` before the BIN-chunk bounds check — catches cross-bufferView spills
  - `readGlb`: BIN chunk type and length validated; all accessor views bounds-checked against the BIN chunk; malformed/truncated files throw instead of serving wrong bytes
  - `unpackBaked`: kern stride must be exactly 3 (fixed 6-byte records); non-divisible kern accessor length rejected; `glyphs.count` and `kern.stride` guarded against malformed metadata
  - `bakedURLs`: preserves query/fragment, strips only the path extension

  ### Package changes
  - `@three-flatland/asset` package removed — GLB loader (`glb.ts`) and `FL_slug_font` extension (`bake.ts`) inlined directly into `@three-flatland/slug`; on-disk layout constants consolidated in `format.ts`
  - `@three-flatland/slug` reverted to `bundle:false` to preserve granular subpath exports
  - glTF-Validator conformance check added to the bake pipeline

  ## BREAKING CHANGES
  - **Baked font format changed.** `.slug.glb` (single standard glTF binary) replaces the `.slug.json` + `.slug.bin` two-file pair. Re-bake all fonts with `slug-bake`. The `SlugFont` and `SlugFontLoader` public API is unchanged; a missing `.slug.glb` falls back to opentype.js automatically.
  - **`@three-flatland/asset` removed.** Any direct imports from `@three-flatland/asset` must be migrated — the GLB reader is now internal to `@three-flatland/slug`.

  Reworks `@three-flatland/slug`'s baked-font pipeline around a single standard glTF binary (`.slug.glb`), with robust validation throughout the load and bake paths and `@gltf-transform/core` kept strictly out of the browser runtime bundle.

### Patch Changes

- 571afc3: > Branch: lighting-stochastic-adoption

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/27
  - `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, aligning with all other baked-asset loaders in the ecosystem
  - Adds `@three-flatland/bake` as a type-only workspace dependency (no runtime cost)

  Structural type alignment for `SlugFontLoader` as part of the unified baked-asset loader API.

- Updated dependencies [dea6d18]
- Updated dependencies [2db36c9]
  - @three-flatland/bake@0.1.0-alpha.2

## 0.1.0-alpha.2

### Minor Changes

- 49b9ce3: > Branch: feat-slug

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/20

  ### Initial release of `@three-flatland/slug`

  **Core rendering**
  - `SlugText` (InstancedMesh subclass), `SlugMaterial`, `SlugGeometry` — GPU-accelerated, resolution-independent text via the Slug algorithm (Eric Lengyel, JCGT 2017); quadratic-Bezier outlines evaluated per-pixel in a TSL fragment shader
  - RGBA16F curve textures + RG32F band textures with endpoint sharing
  - Targets WebGPU and WebGL2 through three-flatland renderer abstractions

  **Font loading**
  - `SlugFont` + `SlugFontLoader` supporting both baked (offline-precomputed) and runtime opentype paths
  - `slug-bake` CLI for offline font baking with subsetting and Unicode-range selection
  - Single `_backend: ShapingBackend` field replaces six function-pointer imports; loader binds the correct closures automatically

  **Text layout**
  - `SlugFont.measureText` / `measureParagraph` / `wrapText` matching `CanvasRenderingContext2D.measureText` semantics
  - `StyleSpan`-driven underline, strikethrough, superscript, and subscript rendered through the existing instance pipeline (rect-sentinel short-circuit in the fragment shader — no extra draw call)

  **Multi-font**
  - `SlugFontStack` for per-codepoint font resolution
  - `SlugStackText` renders a multi-font Group with one InstancedMesh per backing font

  **Stroke / outline**
  - `SlugStrokeMaterial` with analytic distance-to-quadratic-Bezier shader
  - `SlugText.outline` — runtime-uniform width and color with no geometry rebuild
  - Crispness-gated smoothstep keeps sub-pixel strokes visible
  - Bevel-via-min joins at exterior corners

  **Stroke offsetter**
  - Quadratic-Bezier adaptive offsetter: per-segment offset, miter/round/bevel joins with `miterLimit` fallback, flat/square/round/triangle caps, inner+outer stitch
  - `slug-bake` CLI flags: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` (cartesian-product baking)
  - `SlugFont.getStrokeGlyph()` runtime lookup

  **Examples**
  - Paired Three.js (`examples/three/slug-text/`) and React (`examples/react/slug-text/`) demos with Tweakpane controls for size, darken, thicken, max-width, text styles, and outline (Fill/Outline/Both modes, width slider, color picker)
  - Canvas2D compare overlay with onion/split/diff modes; Lorem and Icons demo modes via `SlugFontStack` (Inter + FontAwesome fallback)

  **Docs**
  - `packages/slug/README.md`, `docs/ARCHITECTURE.md`, `docs/REFERENCE.md`
  - Starlight guide and example pages (`guides/slug-text.mdx`, `examples/slug-text.mdx`)

  Initial release of `@three-flatland/slug` — GPU-accelerated resolution-independent text rendering for Three.js and R3F using TSL node materials, with full layout, decoration, stroke-offsetting, and multi-font fallback support.

- c348639: > Branch: feat-slug

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/20

  ## BREAKING CHANGES
  - `BAKED_VERSION` bumped 2 → 3: `curveTexture` format changed to `RGBA16F` (half-float), `bandTexture` to `RG32F`, `MAX_CURVES_PER_BAND` reduced to 40. Existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`.
  - `BAKED_VERSION` bumped 3 → 4: decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`) added to `BakedJSON.metrics`. Existing `.slug.bin`/`.slug.json` files must be re-baked with `slug-bake`.
  - `SlugFontLoader.clearCache` removed — the static cache is already keyed on `url:runtime?` so explicit invalidation was redundant.

  ## New APIs

  **Measurement**
  - `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line measurement aligned with `CanvasRenderingContext2D.measureText`; dispatches on baked vs runtime path; constant per-call cost via pre-computed bounds
  - `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` → `ParagraphMetrics` — multi-line convenience over `wrapText` + per-line `measureText`; respects the same `lineHeight` default (1.2) as `SlugText`
  - `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — dispatches on baked vs runtime path; both examples use this for Canvas2D comparison so line breaks match Slug shaped output exactly

  **Text decorations**
  - `StyleSpan { start, end, underline?, strike? }` — underline and strikethrough spans over shaped character ranges
  - `SlugText.styles: StyleSpan[]` — constructor option and runtime setter threading through shaper + decoration emission
  - `SlugFont.emitDecorations(text, positioned, styles, fontSize)` — thin wrapper using font's own metrics and advance map
  - Font-declared decoration metrics sourced from OpenType `post` + `os2` tables and baked into `BakedJSON.metrics`

  **Outlines**
  - `SlugStrokeMaterial` — stroke `NodeMaterial` using analytic `distanceToQuadBezier` fragment shader; exported from package root alongside `SlugOutlineOptions`
  - `SlugText.outline: SlugOutlineOptions | null` — opt-in outline via child `InstancedMesh` sharing fill geometry; `renderOrder = -1` so stroke draws behind fill
  - `SlugText.setOutlineWidth(w)`, `SlugText.setOutlineColor(c)` — runtime-uniform setters, zero rebuild
  - `SlugText.setOpacity(value)` — forwards to fill material opacity uniform; enables outline-only mode (fill alpha 0)

  **Multi-font stack**
  - `SlugFont.hasCharCode(codepoint)` — cheap codepoint coverage check via cmap
  - `SlugFontStack(fonts)` — ordered fallback chain; `resolveCodepoint(c)`, `resolveText(text)`, `wrapText(text, fontSize, maxWidth?)`, `emitDecorations()`
  - `SlugStackText extends Group` — multi-font renderable with one `InstancedMesh` per font; one draw call per contributing font
  - `SlugStackText.styles`, `.outline`, `.setOpacity()`, `.dispose()` — full parity with `SlugText`

  **Baked stroke**
  - `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — pre-baked stroke glyph lookup by matching stroke set
  - `bakeStrokeForGlyph(source, options)` — stroke pseudo-glyph builder; used by CLI bake pass and future runtime fallback
  - `BakedJSON.strokeSets?: Array<{ width, joinStyle, capStyle, miterLimit, glyphIdOffset }>` — optional baked format field; absent for non-stroke bakes so old fixtures load unchanged

  ## CLI (`slug-bake`)
  - `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` — bake stroke variants alongside fill glyphs into the same curve+band textures
  - `--output` / `-o` — custom output base path

  ## Performance
  - `curveTexture` → `RGBA16F` (half-float): 8 bytes/texel vs 16; resulting `.slug.bin` files ~45% smaller on disk
  - `bandTexture` → `RG32F`: 8 bytes/texel vs 16; eliminates wasted channel bandwidth
  - `MAX_CURVES_PER_BAND` 64 → 40: covers 100% of Inter's 2849-glyph corpus with a safety margin; reduces shader register pressure
  - `bandCount` 8 → 16: ~50% fewer expected curves per band, halving fragment ALU cost in the hot loop
  - Non-crossing curves skip Newton solve and coverage math in the fragment shader (~30% of curves per band branch-coherently skipped)
  - Stroke fragment shader uses single Newton seed (halves WGSL compile time and ~⅔ per-fragment GPU cost for outlines)
  - `SlugText._setFont` deferred outline rebuild — no GPU resource cost for users who never enable outlines

  ## Stroke rendering pipeline
  - Analytic `distanceToQuadBezier` primitive (TSL + CPU reference) — cubic critical-point solve with Newton refinement; bevel-via-min joins at zero extra geometry
  - Full quadratic-Bézier stroke offsetter: adaptive subdivision (Tiller-Hanson construction), per-segment offset, bevel/miter/round joins with `miterLimit` fallback (matching SVG stroke-miterlimit), flat/square/round/triangle cap styles, outer+inner contour stitching into annular ring for closed sources
  - `buildGpuGlyph.ts` — shared contour-to-GPU pipeline module ensuring consistent `SlugGlyphData` shape across font parser, stroke offsetter, and future SVG path support

  ## Fixes
  - `parseFont` emits advance-only glyph entries (empty curves/bounds, real `advanceWidth`) for cmap'd glyphs with no outline (space, tab, zero-width controls) — fixes incorrect advances on both runtime and baked paths
  - Runtime shapers pass `{ features: [] }` to `stringToGlyphs` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` OpenType ligature features shortening the glyph array
  - `SlugText._setFont` defers `visible = true` until first `_rebuild` — fixes WebGPU "Binding size is zero" error in R3F when a render occurs before the instance buffer is initialized
  - `slugDilate` axis-aligned stroke expansion — fixes stroke corners clipped/squared-off at glyph extents (diagonal unit-normal expansion only covered ~70% of `halfWidth` per axis)
  - Kerning extraction filters to source IDs only — fixes `this.font._push is not a function` crash when stroke glyph IDs (outside opentype.js's range) were passed to the kern extractor
  - `SlugStackText.dispose()` tears down outline meshes and `SlugStrokeMaterials` before shared geometry — fixes GPU leaks on repeated scene toggles
  - Compare mode `Off` option added — hides compare overlay entirely for standalone Slug rendering and clean screenshots

  ## Initial release
  - Core rendering pipeline: font parsing (OpenType via opentype.js), text shaping, band-accelerated GPU texture packing, TSL/WebGPU `NodeMaterial` with analytic per-fragment coverage
  - `SlugText`, `SlugFont`, `SlugFontLoader`, `SlugGeometry`, `SlugMaterial` — primary public API
  - `slug-bake` CLI — pre-bakes font glyph data to `.slug.bin`/`.slug.json` so runtime loading requires no opentype.js
  - Stem darkening and thickening options on `SlugMaterial` and `SlugText`
  - Dynamic per-instance quad dilation for sub-pixel AA
  - React (`/react` subpath) and plain Three.js examples with Canvas2D compare overlay (onion/split/diff modes)

  This release ships the complete `@three-flatland/slug` package: an analytic GPU text renderer using TSL/WebGPU with support for baked and runtime font loading, text measurement, underline/strikethrough decorations, multi-font fallback stacks, and a complete stroke rendering pipeline. Two baked format version bumps require re-baking all existing `.slug.bin`/`.slug.json` assets with the updated `slug-bake` CLI.

- c348639: > Branch: feat-slug

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/20

  ## New package: `@three-flatland/slug`

  GPU-accelerated, resolution-independent text rendering for Three.js using the [Slug algorithm](https://sluglibrary.com/). Glyphs are evaluated as quadratic Bezier curves directly in the fragment shader — no SDF atlas, no bitmap textures.

  ### Core API
  - `SlugFont` — loads TTF/OTF/WOFF fonts; parses glyph outlines into GPU-ready `DataTexture` pairs (curve texture + band texture)
  - `SlugText` — `InstancedMesh` subclass; set `.text`, `.fontSize`, `.align` and call `.update(camera)` each frame
  - `SlugMaterial` — `MeshBasicNodeMaterial` with TSL vertex + fragment shaders; compiles to WGSL (WebGPU) and GLSL ES 3.0 (WebGL2)
  - `SlugGeometry` — instanced quad geometry with five `vec4` per-glyph instance attributes

  ### Rendering pipeline
  - `fontParser` — parses glyph outlines; lines converted to degenerate quadratics with correctly scaled `LINE_EPSILON` (font units × `1/unitsPerEm`); cubic Beziers split into four quadratics via De Casteljau for improved accuracy
  - `bandBuilder` — partitions curves into horizontal/vertical spatial bands for fast GPU lookup
  - `texturePacker` — packs curves and bands into power-of-two `DataTexture`s with endpoint sharing to reduce texture size
  - `textShaper` — maps strings to positioned glyphs with kerning and alignment

  ### Shaders (TSL)
  - Vertex: instanced quad positioning with dynamic half-pixel dilation (`slugDilate`) — expands each quad vertex outward in screen space to prevent edge clipping artifacts; MVP matrix rows passed as uniforms via `SlugMaterial.updateMVP(object, camera)`
  - Fragment: dual-axis ray casting evaluates winding number per pixel; fractional coverage produces smooth anti-aliasing without supersampling
  - Per-glyph band counts packed into `glyphJac` instance attribute (z/w components) and forwarded to the fragment shader via varyings

  ### `SlugText.update()` signature change

  `update()` now accepts an optional `Camera` parameter to update MVP uniforms for vertex dilation each frame. Calling without a camera skips dilation updates.

  ### Other
  - `SlugGeometry.capacity` getter exposed
  - `instanceMatrix` auto-initialized with identity matrices on rebuild to prevent invisible glyphs
  - React Three Fiber entry point (`three-flatland/slug/react`) with JSX type augmentation stubs
  - Unit tests for `bandBuilder`, `fontParser`, `texturePacker`, and reference shader logic
  - `docs/ARCHITECTURE.md` and `docs/REFERENCE.md` with full algorithm walkthrough and API reference

  Initial release of `@three-flatland/slug` — GPU text rendering via the Slug algorithm, targeting `WebGPURenderer` (WebGPU and WebGL2 fallback). Supports TTF, OTF, and WOFF fonts with a minimal two-class API.
