# API Reference

> Alpha pre-release. Public APIs may shift before `1.0`. See [#37](https://github.com/thejustinwalsh/three-flatland/issues/37) and [#38](https://github.com/thejustinwalsh/three-flatland/issues/38) for in-flight feature work.

## SlugFontLoader

Single entry point for loading fonts. Tries baked data (a single `.slug.glb`) first, falls back to runtime parsing of `.ttf` / `.otf` / `.woff` via opentype.js. Extends three.js's `Loader<SlugFont>` so it composes with `useLoader` in R3F.

### Static Methods

#### `SlugFontLoader.load(url, options?): Promise<SlugFont>`

```ts
import { SlugFontLoader } from '@three-flatland/slug'

const font = await SlugFontLoader.load('/fonts/Inter-Regular.ttf')

// Force the runtime opentype path (skip baked data even if present):
const fontRT = await SlugFontLoader.load('/fonts/Inter-Regular.ttf', { forceRuntime: true })
```

| Option         | Type      | Default | Description                                                       |
| -------------- | --------- | ------- | ----------------------------------------------------------------- |
| `forceRuntime` | `boolean` | `false` | Bypass baked-data discovery and parse the source font at runtime. |

opentype.js is dynamic-imported only on the runtime path; baked-only consumers never include it in their bundle.

#### Instance method `load(url, onLoad, onProgress?, onError?): void`

Standard `THREE.Loader` callback shape. Used by R3F's `useLoader`.

---

## SlugFont

Font data container. Holds parsed glyphs, GPU textures, text shaping, measurement, and stroke-set lookup. Construct via `SlugFontLoader` — direct instantiation is not part of the public surface.

### Properties

| Property                                          | Type                         | Description                                                                             |
| ------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `glyphs`                                          | `Map<number, SlugGlyphData>` | Glyph data indexed by glyph ID.                                                         |
| `curveTexture`                                    | `DataTexture`                | RGBA16F (`HalfFloatType`). Two texels per quadratic, with endpoint sharing.             |
| `bandTexture`                                     | `DataTexture`                | R32F (`FloatType`). Band headers + curve reference lists, each packed into one float32. |
| `textureWidth`                                    | `number`                     | Texture width in texels (typically 4096).                                               |
| `unitsPerEm`                                      | `number`                     | Font design units per em.                                                               |
| `ascender`                                        | `number`                     | Ascender in em-space.                                                                   |
| `descender`                                       | `number`                     | Descender in em-space (typically negative).                                             |
| `capHeight`                                       | `number`                     | Cap height in em-space.                                                                 |
| `underlinePosition`, `underlineThickness`         | `number`                     | em-space metrics from OpenType `post` table (used by decoration emit).                  |
| `strikethroughPosition`, `strikethroughThickness` | `number`                     | em-space metrics from `os/2` table.                                                     |

### Methods

#### `shapeText(text, fontSize, options?): PositionedGlyph[]`

Shape a string into positioned glyphs with kerning, alignment, and optional wrap.

```ts
const glyphs = font.shapeText('Hello', 48, {
  align: 'center',
  lineHeight: 1.2,
  maxWidth: 400,
})
```

| Option       | Type                            | Default     |
| ------------ | ------------------------------- | ----------- |
| `align`      | `'left' \| 'center' \| 'right'` | `'left'`    |
| `lineHeight` | `number`                        | `1.2`       |
| `maxWidth`   | `number`                        | `undefined` |

#### `measureText(text, fontSize): TextMetrics`

Single-line measurement aligned with `CanvasRenderingContext2D.measureText`. Constant per-call cost via pre-computed bounds. Dispatches on baked vs runtime path.

```ts
const m = font.measureText('Hello', 48)
// m.width, m.actualBoundingBox{Left,Right,Ascent,Descent},
//          m.fontBoundingBox{Ascent,Descent}
```

#### `measureParagraph(text, fontSize, options?): ParagraphMetrics`

Multi-line convenience over `wrapText` + per-line `measureText`. Respects the same `lineHeight` default (1.2) as `SlugText`, so measurements agree with rendered geometry by construction.

```ts
const m = font.measureParagraph(longText, 24, { maxWidth: 400, lineHeight: 1.4 })
// m.width, m.height, m.lines: ParagraphLineMetrics[]
```

#### `wrapText(text, fontSize, maxWidth?): string[]`

Word-wrap helper used internally by `shapeText` + `measureParagraph`. Both example demos use this for Canvas2D comparison so line breaks match Slug's shaped output exactly.

#### `hasCharCode(charCode): boolean`

Cheap codepoint coverage check via cmap. Used by `SlugFontStack.resolveCodepoint`.

#### `emitDecorations(text, positioned, styles, fontSize): DecorationRect[]`

Underline / strikethrough rect emitter. Uses the font's own decoration metrics. Called automatically by `SlugText` / `SlugStackText` when `styles` is non-empty.

#### `getStrokeGlyph(sourceId, width, join, cap, miterLimit?): SlugGlyphData | null`

Lookup a pre-baked stroke pseudo-glyph for a given source glyph + stroke params. Returns `null` if no matching stroke set exists in the baked data — caller can fall back to dynamic-mode outline.

#### `dispose(): void`

Free GPU resources (curve and band textures).

---

## SlugText

High-level text rendering object. Extends `InstancedMesh`. Single-font.

### Constructor

```ts
new SlugText(options?: SlugTextOptions)
```

All options are optional for R3F compatibility — set them at construction or assign later.

| Option        | Type                            | Default     | Description                                        |
| ------------- | ------------------------------- | ----------- | -------------------------------------------------- |
| `font`        | `SlugFont`                      | —           | Required to render; can be set after construction. |
| `text`        | `string`                        | `''`        | Text content.                                      |
| `fontSize`    | `number`                        | `16`        | Font size in scene units.                          |
| `color`       | `number`                        | `0xffffff`  | Text color.                                        |
| `opacity`     | `number`                        | `1.0`       | Fill opacity.                                      |
| `align`       | `'left' \| 'center' \| 'right'` | `'left'`    | Horizontal alignment.                              |
| `lineHeight`  | `number`                        | `1.2`       | Line height multiplier.                            |
| `maxWidth`    | `number`                        | `undefined` | Word-wrap width.                                   |
| `evenOdd`     | `boolean`                       | `false`     | Use even-odd fill rule (compile-time).             |
| `weightBoost` | `boolean`                       | `false`     | `sqrt()` coverage boost (compile-time).            |
| `stemDarken`  | `number`                        | `0`         | Stem darkening strength; ~0.4 is subtle.           |
| `thicken`     | `number`                        | `0`         | Thickening strength; widens coverage at low ppem.  |
| `pixelSnap`   | `boolean`                       | `true`      | Snap glyph positions to pixel grid.                |
| `supersample` | `boolean`                       | `false`     | 2×2 supersampling (expensive).                     |
| `styles`      | `readonly StyleSpan[]`          | `[]`        | Underline / strike / super-sub spans.              |
| `outline`     | `SlugOutlineOptions`            | `null`      | Optional stroke outline (see below).               |

### Runtime properties

All runtime-mutable props mark dirty for the next `update()`:

`text`, `fontSize`, `color`, `align`, `lineHeight`, `maxWidth`, `styles`, `outline`.

### Methods

| Method                        | Description                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `update(camera?): void`       | Rebuild geometry if dirty + update MVP uniforms. Call once per frame.                                     |
| `setOpacity(value): void`     | Forwards to fill (and outline if present). Enables outline-only mode (`opacity: 0` + `outline: { ... }`). |
| `setOutlineWidth(w): void`    | Runtime-uniform half-width (em-space). Zero rebuild.                                                      |
| `setOutlineColor(c): void`    | Runtime-uniform stroke color. Zero rebuild.                                                               |
| `setViewportSize(w, h): void` | Update viewport dimensions for dilation. Call on resize.                                                  |
| `dispose(): this`             | Free geometry, fill material, and outline material.                                                       |

### Outline

```ts
text.outline = { width: 0.025, color: 0x000000 }
// or null to remove
```

| `SlugOutlineOptions` | Type                        | Default    | Description                                   |
| -------------------- | --------------------------- | ---------- | --------------------------------------------- |
| `width`              | `number`                    | `0.025`    | Stroke half-width in em-space (~5% em total). |
| `color`              | `number \| string \| Color` | `0x000000` | Anything `THREE.Color` accepts.               |

The outline renders as a child `InstancedMesh` behind the fill (`renderOrder = -1`), sharing fill geometry. Width and color update via uniform — no rebuild.

> Phase 5 ([#37](https://github.com/thejustinwalsh/three-flatland/issues/37)) will add `join`, `cap`, `miterLimit`, `dashArray`, `dashOffset`, and a `mode: 'baked' | 'dynamic'` switch. Current implementation is `dynamic` — bevel-via-min joins, no caps (text is closed-contour-only).

---

## SlugFontStack

Ordered fallback chain across multiple `SlugFont`s. Per-codepoint resolution; the first font with a non-zero glyphId wins. Works with both baked and runtime fonts.

### Constructor

```ts
new SlugFontStack(fonts: readonly SlugFont[])
```

### Methods

| Method                                                                  | Description                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `resolveCodepoint(charCode): number`                                    | Index into `fonts` of the resolving font (0 = first).  |
| `resolveText(text): Uint8Array`                                         | Per-character resolution map for an entire string.     |
| `wrapText(text, fontSize, maxWidth?): string[]`                         | Stack-aware wrap using each font's own advance widths. |
| `emitDecorations(text, positioned, styles, fontSize): DecorationRect[]` | Decoration emit across mixed-font runs.                |

---

## SlugStackText

Multi-font renderable. Extends `Group` with one `InstancedMesh` per backing font in the stack. Full `SlugText` parity for `styles`, `outline`, `setOpacity`, `dispose`.

### Constructor

```ts
new SlugStackText(options?: SlugStackTextOptions)
```

`SlugStackTextOptions` mirrors `SlugTextOptions` but takes `fontStack: SlugFontStack` instead of `font: SlugFont`.

```ts
const stack = new SlugFontStack([inter, notoEmoji])
const text = new SlugStackText({
  fontStack: stack,
  text: 'Hello 😀',
  fontSize: 48,
  outline: { width: 0.025, color: 0x000000 },
})
scene.add(text)
```

> Color emoji (COLR/CPAL/CBDT) is out of scope. Emoji glyphs render as their outline if present, else notdef.

---

## SlugMaterial

`MeshBasicNodeMaterial` subclass with the Slug fill shader.

### Constructor

```ts
new SlugMaterial(font: SlugFont, options?: SlugMaterialOptions)
```

| Option        | Type              | Default    |
| ------------- | ----------------- | ---------- |
| `color`       | `number \| Color` | `0xffffff` |
| `opacity`     | `number`          | `1.0`      |
| `evenOdd`     | `boolean`         | `false`    |
| `weightBoost` | `boolean`         | `false`    |
| `stemDarken`  | `number`          | `0`        |
| `thicken`     | `number`          | `0`        |
| `pixelSnap`   | `boolean`         | `true`     |
| `supersample` | `boolean`         | `false`    |
| `transparent` | `boolean`         | `true`     |

### Methods

| Method                      | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `setColor(value)`           | Update text color.                                                 |
| `setOpacity(value)`         | Update opacity.                                                    |
| `setViewportSize(w, h)`     | Update viewport dimensions.                                        |
| `updateMVP(object, camera)` | Update MVP rows for vertex dilation (called by `SlugText.update`). |

---

## SlugStrokeMaterial

Stroke material backing `SlugText.outline`. Uses an analytic distance-to-quadratic-Bezier shader; runtime-uniform half-width; bevel-via-min joins.

```ts
new SlugStrokeMaterial(font: SlugFont, options?: SlugStrokeMaterialOptions)
```

Options mirror `SlugMaterial` plus `strokeHalfWidth` and `strokeColor`. `setStrokeHalfWidth(w)` / `setStrokeColor(c)` update at runtime.

> Phase 5 reserves `joinStyle`, `miterLimit`, `capStyle` uniform slots; current shader treats them as no-ops. The same `SlugStrokeMaterial` will become the `outline: { mode: 'dynamic' }` opt-in path once the baked-as-fill production path lands ([#37](https://github.com/thejustinwalsh/three-flatland/issues/37)).

---

## SlugGeometry

Instanced quad `BufferGeometry` with per-glyph instance attributes.

```ts
new SlugGeometry(capacity?: number)  // default: 256
```

### Methods

#### `setGlyphs(glyphs, font, color?): void`

Fill instance buffers from positioned glyphs. Auto-grows.

```ts
const positioned = font.shapeText('Hello', 48)
geometry.setGlyphs(positioned, font, { r: 1, g: 1, b: 1, a: 1 })
```

### Instance attributes

| Name         | Components | Description                                                                                  |
| ------------ | ---------- | -------------------------------------------------------------------------------------------- |
| `glyphPos`   | xyzw       | Object-space center (xy) + half-size (zw)                                                    |
| `glyphTex`   | xyzw       | Em-space center (xy) + band texture location (zw)                                            |
| `glyphJac`   | xyzw       | Inverse Jacobian 2×2 (object → em). Sentinel bits encode `isRect` for decoration primitives. |
| `glyphBand`  | xyzw       | Band transform: scale (xy) + offset (zw)                                                     |
| `glyphColor` | rgba       | Per-glyph RGBA color                                                                         |

---

## SlugBatch

Cross-component glyph batch: many text runs, ONE draw call. Duck-typed instanced
mesh over an interleaved instance buffer that extends `SlugGeometry`'s five vec4
lanes with a per-instance transform (`glyphMtx0..3`, folded into the dilation MVP
so the screen-space Jacobian stays exact per instance) and a per-instance 4-plane
clip (`glyphClip0..3`, applied as an antialiased coverage multiply — never a
discard).

```ts
new SlugBatch(options?: SlugBatchOptions)
// { font?, capacity? = 256, clip? = true, material? }
```

### Writer contract (allocator-compatible with sorted bucket layouts)

#### `ensureCapacity(n): void` — grow to ≥ n instances (1.5×, contents preserved)

#### `writeGlyph(index, glyphId, font, opts?): void`

`opts`: `{ x?, y?, fontSize?, matrix?, clip?, color?, opacity? }`. `matrix` is the
per-instance transform (glyph → batch-local); `clip` is a `Matrix4` whose ROWS are
plane equations `(nx, ny, nz, d)` — a point survives when `dot(n, p) + d >= 0` for
all four rows; `null` writes the bit-exact disabled sentinel `(0, 0, 0, 1)`.

#### `writeRect(index, rect, opts?): void` — solid-rect sentinel path (decorations, `renderSolid`)

#### `copyWithin(target, start, end): void` — bucket compaction

#### `count` — live instance count; drives the instanced draw

`pixelSnap` is force-disabled in batch mode (snap math assumes an axis-aligned
ortho MVP). Call `update(camera)` once per frame and `setViewportSize(w, h)` on
resize, exactly like `SlugText`.

---

## SlugShapeSet

"A font whose glyphs are SVG paths." Incremental registry of closed
quadratic-Bezier contours sharing one curve/band `DataTexture` pair — the same
`curveTexture`/`bandTexture` contract `SlugFont` exposes (`SlugCurveSource`), so
materials bind either interchangeably. Zero render targets anywhere in the
pipeline; the "atlas" is data textures of curve control points.

```ts
const set = new SlugShapeSet()
const handle = set.registerShape(contours) // QuadContour[] → SlugShapeHandle
```

#### `registerShape(contours: QuadContour[]): SlugShapeHandle`

Registers one shape (holes = counter-wound or nested contours, per fill rule).
The handle IS the shape's `SlugGlyphData` record (`glyphId` = handle id).
Coordinates are quantized to float32 at the door (bit-exact serialization) and
should stay within ~[-2, 2] (half-float curve texture precision).

#### `curveTexture` / `bandTexture` / `textureWidth`

Pack lazily on first access after a registration. **Growth invariant:** shapes
pack in insertion order and new shapes only append, so a repack never moves
previously registered shapes — already-written batch instances stay valid; only
the texture objects are new (`version` increments; `SlugShapeBatch.update`
re-binds automatically).

#### `version` / `shapeCount` / `getShape(id)` / `dispose()` / `meta`

#### `SlugShapeSet.fromBaked(buffer: ArrayBuffer): SlugShapeSet`

Rehydrate a set baked by `packShapeSet` — no SVG parsing, no band building;
renders pixel-identically to runtime registration and stays growable (ids
continue after the baked range). `meta` carries the baker's free-form JSON.

---

## SlugShapeBatch

`SlugBatch` over a `SlugShapeSet`: identical per-instance layout (transform,
clip, color), one draw call for any number of shape instances. Nothing is
forked — the writer just points at shape handles.

```ts
new SlugShapeBatch(options?: SlugShapeBatchOptions)
// { shapes?, capacity?, clip?, material? }  — material.evenOdd = batch-level fill rule
```

#### `shapes: SlugShapeSet | null` — the bound set (binding via `font` throws)

#### `writeShape(index, handle | id, opts?): void`

`opts`: `{ x?, y?, scale? = 1, matrix?, clip?, color?, opacity? }`. `scale` is the
shape analogue of `fontSize` — a `slug/svg` shape occupies a y-up unit box, so
`scale: 64` renders it 64 world units. Unknown ids write a hidden degenerate so
allocator slots stay dense.

#### `update(camera): void`

Per-frame MVP push + staleness check: re-binds the material when the set has
repacked since the last bind. Fill rule is batch-level v1
(`material: { evenOdd: true }`); per-shape fill rule is a documented v2 item.

---

## SVG loading (`slug/svg`)

Uses three's `SVGLoader.parse` **as a parser only** — no tessellation. Cubics go
through `cubicToQuadraticsAdaptive` (the font parser's De Casteljau + best-fit
core wrapped in adaptive recursion; split until the analytic deviation bound
`(√3/36)·|third difference|` drops under the tolerance — default 0.25% of the
viewBox diagonal, depth-capped). Arcs/ellipses go through smooth cubic-Hermite
segmentation, lines through the shared bowed-degenerate converter.

#### `parseSVG(svgText, options?): ParsedSVG`

`{ shapes: QuadContour[][], fills: ParsedSVGFill[], viewBox }` — parallel arrays,
one entry per painted path. Shapes are normalized to a y-up unit box (viewBox
longer side = 1, aspect preserved). `fills[i]` carries `{ color, rule }`;
`fill="none"` paths still emit (matching upstream uikit — stroke-to-fill icon
pipelines inherit `fill="none"` from the svg root) with a white default color so
consumer tints work. Requires a DOM (`DOMParser`).

#### `registerSVG(set, parsed): RegisteredSVG` — register every painted path; returns `{ set, handles, fills, viewBox }`

#### `loadSVGShapes(source, set?, options?): Promise<RegisteredSVG>`

`source` = SVG markup (detected by `<svg`/`<?xml` prefix) or a URL to fetch. Pass
one `set` across many calls to accumulate an icon atlas.

---

## Layout engine (`layout/*`) and queries (`query/*`)

Standalone text layout over `SlugFont` metrics — no dependency on the render classes.
Ported from `@pmndrs/uikit`'s text layout onto Slug's em-space, baseline-relative
font contract. All functions consume the structural `SlugLayoutFont` interface
(`ascender`, `descender`, `getGlyphMetricsForChar`, `getKerning`) — `SlugFont`
satisfies it; tests can stub it.

```ts
interface SlugGlyphLayoutProperties {
  text: string
  font: SlugLayoutFont
  fontSize?: number // default 16
  letterSpacing?: number // default 0
  lineHeight?: number | `${number}%` // default (ascender - descender) * fontSize
  wordBreak?: 'keep-all' | 'break-all' | 'break-word' // default 'break-word'
  whiteSpace?: 'normal' | 'collapse' | 'pre' | 'pre-line' // default 'normal'
  tabSize?: number // default 8
}

measureGlyphLayout(props, availableWidth?): { width, height, lineCount }
buildGlyphLayout(props, availableWidth?, availableHeight?): GlyphLayout
buildPositionedGlyphLayout(props, {
  availableWidth?, availableHeight?, // default: intrinsic size
  textAlign?,     // 'left' | 'center' | 'right' | 'justify', default 'left'
  verticalAlign?, // 'top' | 'center' | 'middle' | 'bottom', default 'top'
}): PositionedGlyphLayout

getCharIndex(layout, x, y, 'between' | 'on'): number
getCaretTransformation(layout, charIndex): CaretTransformation | undefined
getSelectionTransformations(layout, [start, end]): { caret, selections }
```

- **Whitespace is normalized before wrapping** (`normalizeWhitespace`); all
  `charIndex` values refer to the normalized text carried on the layout as
  `layout.text`.
- **Whitespace entries are preserved** in positioned lines — caret placement after
  a space works, unlike `shapeText` output which drops outline-less glyphs.
- **Coordinates:** positioned entries and caret/selection outputs are y-up with the
  origin at the center of the `availableWidth × availableHeight` box. Glyph entries
  carry the ink box (`x`, `y`, `width`) plus `penX`; lines carry `y` (line-box top)
  and `baselineY` (consecutive baselines are exactly `lineHeight` apart).
  `getCharIndex` alone takes pointer input measured from the box's top-left
  (x rightward from the left edge, y downward as negative values) — uikit's pointer
  convention, kept so its selection/input consumers port mechanically.
- **Baseline math lives in one place** (`layout/baseline.ts`):
  `getEmBoxTopOffset`, `getLineBaselineOffset`, `getGlyphTopOffset`. With
  `lineHeight === fontSize` the first baseline sits exactly
  `ascender * fontSize` (= `fontBoundingBoxAscent`) below the line-box top.
- **Wrappers** (`WordWrapper`, `BreakallWrapper`, `NowrapWrapper`, `glyphWrappers`)
  measure with advances + `letterSpacing`; kerning is applied at positioning time
  (upstream parity).

Non-goals (unchanged package-wide): GSUB/ligatures, bidi, complex scripts,
astral-plane clusters, UAX-14.

## CLI: `slug-bake`

Pre-process fonts offline. Eliminates opentype.js at runtime and lets you subset glyphs.

```bash
npx slug-bake Inter-Regular.ttf
npx slug-bake Inter-Regular.ttf --range ascii
npx slug-bake Inter-Regular.ttf -r latin -r 0x2000-0x206F
npx slug-bake Inter-Regular.ttf -o ./fonts/Inter-Regular
```

### Stroke variants (Phase 5 partial)

Bake stroke pseudo-glyphs alongside fills so outlines render through the fill shader at 1× cost:

```bash
npx slug-bake Inter-Regular.ttf \
  --stroke-widths=0.025,0.05 \
  --stroke-join=miter \
  --stroke-cap=flat \
  --miter-limit=4
```

`--stroke-widths` × `--stroke-joins` × `--stroke-caps` is bakedas a cartesian product; the runtime `SlugFont.getStrokeGlyph(...)` matches against the pre-baked variants. The runtime swap path (texture-pool + async `SlugBaker`) and the consumer wiring on `SlugText.outline` arrive in Phase 5 ([#37](https://github.com/thejustinwalsh/three-flatland/issues/37)).

## Baked shape sets: `packShapeSet` / `FL_slug_shapes`

`packShapeSet(set, meta?)` (Node-only, `@three-flatland/slug/bake`) serializes a
`SlugShapeSet` into a GLB carrying the `FL_slug_shapes` root extension —
consumed by `uikit-bake icons` and rehydrated at runtime with
`SlugShapeSet.fromBaked(buffer)`.

The format is **geometry-complete** (schema v1, `format.ts` is the source of
truth): SoA accessor columns over shapes sorted ascending by id —

| Column                             | Type           | Contents                                                                                |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `shapeId`                          | FLOAT SCALAR   | ascending handle ids                                                                    |
| `bounds`                           | FLOAT VEC4     | xMin yMin xMax yMax (normalized shape space)                                            |
| `curveOffsets` / `curveData`       | FLOAT SCALAR   | CSR prefix-sum (in curves) + flat `p0x p0y p1x p1y p2x p2y` per curve                   |
| `contourOffsets` / `contourStarts` | FLOAT SCALAR   | CSR prefix-sum + per-shape contour start indices                                        |
| `bandOffsets` / `bandData`         | FLOAT / USHORT | CSR word offsets + `FL_slug_font`-layout band words (`[numH, numV, counts…, indices…]`) |

Because curves, contour starts, and prebuilt bands round-trip losslessly (and
`registerShape` quantizes to float32 at registration), a loaded set repacks to
**bit-identical GPU textures** — pixel-identical rendering — with no SVG parsing
and no band building at load; only the linear-copy texture pack runs. The loaded
set stays growable. Free-form `meta` JSON rides in the extension and surfaces as
`SlugShapeSet.meta`. Register `FlSlugShapesExtension` on a gltf-transform
`NodeIO`/`WebIO` to round-trip the file with external tooling.

---

## Types

### TextMetrics

```ts
interface TextMetrics {
  width: number
  actualBoundingBoxLeft: number
  actualBoundingBoxRight: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
  fontBoundingBoxAscent: number
  fontBoundingBoxDescent: number
}
```

### ParagraphMetrics

```ts
interface ParagraphMetrics {
  width: number // widest line
  height: number // lines.length * fontSize * lineHeight
  lines: ParagraphLineMetrics[]
  fontBoundingBoxAscent: number
  fontBoundingBoxDescent: number
}

interface ParagraphLineMetrics {
  text: string
  width: number
}
```

### StyleSpan

```ts
interface StyleSpan {
  start: number // half-open [start, end) over UTF-16 code units
  end: number
  underline?: boolean
  strike?: boolean
  scriptLevel?: number // positive = super, negative = sub, magnitude in [1, 3]
}
```

### SlugOutlineOptions

```ts
interface SlugOutlineOptions {
  width?: number // em-space half-width, default 0.025
  color?: number | string | Color // default 0x000000
}
```

### QuadCurve / PositionedGlyph / SlugGlyphData

```ts
interface QuadCurve {
  p0x: number
  p0y: number // start
  p1x: number
  p1y: number // control
  p2x: number
  p2y: number // end
}

interface PositionedGlyph {
  glyphId: number
  x: number
  y: number
  scale: number
  srcCharIndex: number // UTF-16 offset in original text
}

interface SlugGlyphData {
  glyphId: number
  curves: QuadCurve[]
  contourStarts: number[]
  bands: GlyphBands
  bounds: GlyphBounds
  advanceWidth: number
  lsb: number
  bandLocation: { x: number; y: number }
  curveLocation: { x: number; y: number }
}
```
