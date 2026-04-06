# API Reference

## SlugFont

Font data container. Holds parsed glyph outlines, spatial band structures, packed GPU textures, and text shaping.

### Static Methods

#### `SlugFont.fromURL(url: string): Promise<SlugFont>`

Load and parse a font from a URL. Fetches the file, parses it, builds acceleration structures, and packs GPU textures.

```ts
const font = await SlugFont.fromURL('/fonts/Inter-Regular.ttf')
```

Supported formats: TTF, OTF, WOFF (not WOFF2).

#### `SlugFont.fromArrayBuffer(buffer: ArrayBuffer): Promise<SlugFont>`

Parse a font from an in-memory buffer. Same pipeline as `fromURL` but skips the fetch.

```ts
const response = await fetch('/fonts/MyFont.ttf')
const buffer = await response.arrayBuffer()
const font = await SlugFont.fromArrayBuffer(buffer)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `glyphs` | `Map<number, SlugGlyphData>` | Glyph data indexed by glyph ID |
| `curveTexture` | `DataTexture` | RGBA32Float texture with Bezier control points |
| `bandTexture` | `DataTexture` | Float-encoded band headers and curve references |
| `textureWidth` | `number` | Texture width in texels (4096) |
| `unitsPerEm` | `number` | Font design units per em |
| `ascender` | `number` | Ascender in em-space (typically ~0.8-1.0) |
| `descender` | `number` | Descender in em-space (negative, typically ~-0.2) |
| `capHeight` | `number` | Cap height in em-space |

### Methods

#### `shapeText(text, fontSize, options?): PositionedGlyph[]`

Shape a string into positioned glyphs with kerning and layout.

```ts
const glyphs = font.shapeText('Hello', 48, {
  align: 'center',
  lineHeight: 1.2,
  maxWidth: 400,
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `align` | `'left' \| 'center' \| 'right'` | `'left'` | Horizontal alignment |
| `lineHeight` | `number` | `1.2` | Line height as a multiple of font size |
| `maxWidth` | `number` | `undefined` | Maximum width before word wrapping |

#### `getHBandCount(glyphId): number`

Number of horizontal bands for a glyph.

#### `getVBandCount(glyphId): number`

Number of vertical bands for a glyph.

#### `dispose(): void`

Free GPU resources (curve and band textures).

---

## SlugText

High-level text rendering object. Extends `InstancedMesh`.

### Constructor

```ts
new SlugText(font: SlugFont, text?: string, options?: SlugTextOptions)
```

#### SlugTextOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fontSize` | `number` | `16` | Font size in world units |
| `color` | `number` | `0xffffff` | Text color as hex |
| `opacity` | `number` | `1.0` | Text opacity |
| `align` | `'left' \| 'center' \| 'right'` | `'left'` | Horizontal alignment |
| `lineHeight` | `number` | `1.2` | Line height multiplier |
| `maxWidth` | `number` | `undefined` | Maximum width for word wrapping |
| `evenOdd` | `boolean` | `false` | Use even-odd fill rule instead of nonzero |
| `weightBoost` | `boolean` | `false` | Apply sqrt coverage boost for thin strokes |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | The rendered text. Setting marks as dirty. |
| `fontSize` | `number` | Font size in world units. Setting marks as dirty. |
| `align` | `'left' \| 'center' \| 'right'` | Alignment. Setting marks as dirty. |
| `lineHeight` | `number` | Line height multiplier. Setting marks as dirty. |
| `maxWidth` | `number \| undefined` | Word wrap width. Setting marks as dirty. |

### Methods

#### `update(): void`

Rebuild geometry if any properties changed since last call. Call once per frame.

```ts
function animate() {
  text.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
```

#### `setViewportSize(width, height): void`

Update viewport dimensions for dilation calculations. Call on window resize.

```ts
window.addEventListener('resize', () => {
  text.setViewportSize(window.innerWidth, window.innerHeight)
})
```

#### `dispose(): this`

Free geometry and material resources.

---

## SlugMaterial

`MeshBasicNodeMaterial` subclass with the Slug TSL vertex and fragment shaders.

### Constructor

```ts
new SlugMaterial(font: SlugFont, options?: SlugMaterialOptions)
```

#### SlugMaterialOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `color` | `number \| Color` | `0xffffff` | Text color |
| `opacity` | `number` | `1.0` | Opacity |
| `evenOdd` | `boolean` | `false` | Even-odd fill rule |
| `weightBoost` | `boolean` | `false` | Sqrt coverage boost |
| `transparent` | `boolean` | `true` | Enable transparency |

### Methods

#### `setColor(value: Color | number): void`

Update text color at runtime.

#### `setOpacity(value: number): void`

Update opacity at runtime.

#### `setViewportSize(width, height): void`

Update viewport dimensions.

---

## SlugGeometry

Instanced quad `BufferGeometry` with per-glyph instance attributes.

### Constructor

```ts
new SlugGeometry(capacity?: number)  // default: 256
```

### Methods

#### `setGlyphs(glyphs, font, color?): void`

Fill instance buffers from positioned glyphs. Grows buffers automatically if needed.

```ts
const positioned = font.shapeText('Hello', 48)
geometry.setGlyphs(positioned, font, { r: 1, g: 1, b: 1, a: 1 })
```

### Instance Attributes

| Name | Size | Description |
|------|------|-------------|
| `glyphPos` | vec4 | Center position (xy) + half-size (zw) |
| `glyphTex` | vec4 | Em-space center (xy) + band texture location (zw) |
| `glyphJac` | vec4 | Inverse Jacobian 2x2 matrix |
| `glyphBand` | vec4 | Band transform: scale (xy) + offset (zw) |
| `glyphColor` | vec4 | RGBA per-glyph color |

---

## Pipeline Exports

Available via `@three-flatland/slug/pipeline`:

### `parseFont(buffer: ArrayBuffer)`

Parse a font file into glyph curve data. Returns `{ glyphs, unitsPerEm, ascender, descender, capHeight }`.

### `buildBands(curves, bounds, bandCount?)`

Build spatial band acceleration structure. Default 8 bands per axis.

### `packTextures(glyphs)`

Pack glyph data into GPU `DataTexture` instances. Returns `{ curveTexture, bandTexture, textureWidth }`.

### `shapeText(font, text, fontSize, options?)`

Shape text string into positioned glyphs. Accepts an opentype.js `Font` object.

---

## Shader Exports

Available via `@three-flatland/slug/shaders`:

### `calcRootCode`

TSL `Fn` node. Branchless root eligibility via `0x2E74` lookup table.

**Signature:** `(y1: Node<'float'>, y2: Node<'float'>, y3: Node<'float'>) => Node<'uint'>`

### `solveHorizPoly` / `solveVertPoly`

TSL `Fn` nodes. Quadratic Bezier intersection solvers for horizontal and vertical rays.

**Signature:** `(p0: Node<'vec2'>, p1: Node<'vec2'>, p2: Node<'vec2'>) => Node<'vec2'>`

### `calcCoverage`

TSL `Fn` node. Combines horizontal + vertical coverage into final antialiased value.

**Signature:** `(xcov, xwgt, ycov, ywgt: Node<'float'>, evenOdd, weightBoost: Node<'bool'>) => Node<'float'>`

### `buildSlugFragmentNode(curveTexture, bandTexture)`

Build the complete Slug fragment shader TSL function. Returns a callable `Fn` node.

### `buildSlugVertexNodes(viewportWidth, viewportHeight)`

Build typed references to Slug instance attributes and viewport uniform.

---

## Types

### QuadCurve

```ts
interface QuadCurve {
  p0x: number; p0y: number  // start point
  p1x: number; p1y: number  // control point
  p2x: number; p2y: number  // end point
}
```

### PositionedGlyph

```ts
interface PositionedGlyph {
  glyphId: number
  x: number       // object-space X
  y: number       // object-space Y
  scale: number   // fontSize / unitsPerEm
}
```

### SlugGlyphData

```ts
interface SlugGlyphData {
  glyphId: number
  curves: QuadCurve[]
  bands: GlyphBands
  bounds: GlyphBounds
  advanceWidth: number
  lsb: number
  bandLocation: { x: number; y: number }
  curveLocation: { x: number; y: number }
}
```
