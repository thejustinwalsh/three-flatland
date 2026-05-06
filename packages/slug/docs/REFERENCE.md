# API Reference

> Alpha pre-release. Public APIs may shift before `1.0`. See [#37](https://github.com/thejustinwalsh/three-flatland/issues/37) and [#38](https://github.com/thejustinwalsh/three-flatland/issues/38) for in-flight feature work.

## SlugFontLoader

Single entry point for loading fonts. Tries baked data (`.slug.json` + `.slug.bin`) first, falls back to runtime parsing of `.ttf` / `.otf` / `.woff` via opentype.js. Extends three.js's `Loader<SlugFont>` so it composes with `useLoader` in R3F.

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

| Property                                          | Type                         | Description                                                                 |
| ------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `glyphs`                                          | `Map<number, SlugGlyphData>` | Glyph data indexed by glyph ID.                                             |
| `curveTexture`                                    | `DataTexture`                | RGBA16F (`HalfFloatType`). Two texels per quadratic, with endpoint sharing. |
| `bandTexture`                                     | `DataTexture`                | RG32F (`FloatType`). Band headers + curve reference lists.                  |
| `textureWidth`                                    | `number`                     | Texture width in texels (typically 4096).                                   |
| `unitsPerEm`                                      | `number`                     | Font design units per em.                                                   |
| `ascender`                                        | `number`                     | Ascender in em-space.                                                       |
| `descender`                                       | `number`                     | Descender in em-space (typically negative).                                 |
| `capHeight`                                       | `number`                     | Cap height in em-space.                                                     |
| `underlinePosition`, `underlineThickness`         | `number`                     | em-space metrics from OpenType `post` table (used by decoration emit).      |
| `strikethroughPosition`, `strikethroughThickness` | `number`                     | em-space metrics from `os/2` table.                                         |

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
