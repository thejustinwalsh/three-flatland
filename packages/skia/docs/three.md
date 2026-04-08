# Three.js Integration

`@three-flatland/skia/three` provides a retained-mode scene graph built on Three.js `Object3D`. Build a tree of nodes and `SkiaCanvas` walks it for you.

```ts
import { SkiaCanvas, SkiaGroup, SkiaRect, SkiaCircle } from '@three-flatland/skia/three'
```

## Quick Start

```ts
import { Skia } from '@three-flatland/skia'
import { SkiaCanvas, SkiaRect, SkiaFontLoader } from '@three-flatland/skia/three'

const skia = await Skia.init(renderer) // auto-detects WebGPU or WebGL

const canvas = new SkiaCanvas({ renderer, width: 512, height: 512, overlay: true })
await canvas.ready

const rect = new SkiaRect()
rect.x = 50; rect.y = 50; rect.width = 200; rect.height = 100
rect.cornerRadius = 12
rect.fill = [1, 0, 0, 1]
canvas.add(rect)

// In your render loop:
canvas.render(true) // true = invalidate + draw
```

## Architecture

```
SkiaCanvas (root)
  +-- SkiaGroup (transform, clip, effects)
  |     +-- SkiaRect
  |     +-- SkiaCircle
  |     +-- SkiaTextNode
  +-- SkiaGroup
        +-- SkiaPathNode
        +-- SkiaImageNode
```

`SkiaCanvas.render()` walks the tree depth-first. For each child:
- **SkiaGroup**: pushes canvas state, applies transforms and clips, recurses into children, restores.
- **SkiaNode subclass**: resolves its paint (from inline props or explicit `paint` reference), draws, returns.
- **Plain Object3D**: recurses into its children.

Invisible nodes (`visible = false`) are skipped.

## SkiaCanvas

The root container. Owns the render target and orchestrates the draw pass.

| Property | Type | Description |
|---|---|---|
| `renderer` | `AnyRenderer` | Three.js renderer (WebGLRenderer or WebGPURenderer) |
| `width` | `number` | Surface width in pixels |
| `height` | `number` | Surface height in pixels |
| `overlay` | `boolean` | If true, draw to the screen framebuffer instead of a render target |
| `ready` | `Promise<SkiaContext>` | Resolves when WASM is loaded |
| `texture` | `Texture \| null` | Output texture (render-target mode only) |

**Methods:**
- `render(invalidate?)` &mdash; Run the Skia draw pass. Pass `true` to invalidate + draw in one call. Without `true`, only draws if previously `invalidate()`d.
- `invalidate()` &mdash; Mark as needing redraw.
- `setSize(w, h)` &mdash; Resize the surface and render target.
- `dispose()` &mdash; Release GPU resources.

**Modes:**
- **Render target** (default): Skia draws to a `WebGLRenderTarget`. Use `canvas.texture` on a material.
- **Overlay** (`overlay: true`): Skia draws directly to the screen framebuffer. Call after `renderer.render(scene, camera)`.

## SkiaGroup

Transform, clip, and effects container. Uses standard Object3D `position`, `scale`, and `rotation.z` for transforms.

| Property | Type | Default | Description |
|---|---|---|---|
| `position` | `Vector3` | (0,0,0) | Translation (Object3D) |
| `scale` | `Vector3` | (1,1,1) | Scale (Object3D) |
| `rotation.z` | `number` | 0 | Rotation in radians (Object3D) |
| `degrees` | `number` | 0 | Rotation in degrees (convenience, overrides rotation.z) |
| `skewX` | `number` | 0 | Skew X |
| `skewY` | `number` | 0 | Skew Y |
| `clipRect` | `[x, y, w, h]` | null | Rectangular clip |
| `clipRoundRect` | `{x, y, w, h, rx, ry}` | null | Rounded rectangle clip |
| `clipPath` | `SkiaPath` | null | Arbitrary path clip |
| `opacity` | `number` | 1 | Group opacity (triggers saveLayer) |
| `blendMode` | `BlendMode` | null | Layer blend mode |
| `blur` | `number` | 0 | Gaussian blur on all children as a group |
| `shadow` | `SkiaShadowProps` | null | Drop shadow |
| `colorMatrix` | `number[]` | null | 4x5 color matrix (20 floats) |
| `backdropBlur` | `number` | 0 | Frosted glass effect |
| `layer` | `SkiaPaint` | null | Explicit layer paint (overrides semantic effects) |

## Drawing Nodes

All drawing nodes extend `SkiaNode` and share inline paint properties:

| Property | Type | Description |
|---|---|---|
| `fill` | `SkiaColor` | Fill color as `[r, g, b, a]` (0-1) or packed `0xAARRGGBB` |
| `stroke` | `SkiaColor` | Stroke color |
| `strokeWidth` | `number` | Stroke width in pixels |
| `opacity` | `number` | Alpha (0-1) |
| `blur` | `number` | Blur sigma |
| `blendMode` | `BlendMode` | Porter-Duff blend mode |
| `paint` | `SkiaPaint` | Explicit paint (overrides all inline props) |

### SkiaRect, SkiaCircle, SkiaOval, SkiaLine

Basic shape nodes with self-explanatory properties.

### SkiaPathNode

Draws an SVG path string (`d` prop) or an explicit `SkiaPath` reference (`path` prop).

### SkiaTextNode

Requires a `SkiaFont`. See **Loaders** below.

### SkiaTextPathNode

Draws text along a `SkiaPath`. Requires `font`, `path`, and `text`.

### SkiaImageNode

Draws a `SkiaImage`. Supports source/destination rects for cropping and scaling.

## Loaders

### SkiaFontLoader

Returns a `SkiaTypeface`. Call `.atSize(n)` for sized fonts. Cached by URL.

```ts
import { SkiaFontLoader } from '@three-flatland/skia/three'

const typeface = await SkiaFontLoader.load('/fonts/Inter.ttf')
const titleFont = typeface.atSize(32)
const bodyFont = typeface.atSize(14)
```

### SkiaImageLoader

```ts
import { SkiaImageLoader } from '@three-flatland/skia/three'

const image = await SkiaImageLoader.load('/textures/sprite.png')
```

## Explicit Paint

For gradients, shaders, and filters beyond inline props:

```ts
import { SkiaPaint } from '@three-flatland/skia'

const paint = new SkiaPaint(skia)
  .setFill()
  .setLinearGradient(0, 0, 200, 0, [0xFFFF0000, 0xFF0000FF], [0, 1])

rect.paint = paint // overrides fill/stroke/etc.
```
