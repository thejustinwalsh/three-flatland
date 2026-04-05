# Three.js Integration

`@three-flatland/skia/three` provides a retained-mode scene graph built on Three.js `Object3D`. Instead of issuing draw calls every frame, you build a tree of nodes and let `SkiaCanvas` walk it for you.

```ts
import { SkiaCanvas, SkiaGroup, SkiaRect, SkiaCircle } from '@three-flatland/skia/three'
```

## Quick Start

```ts
import * as THREE from 'three'
import { SkiaCanvas, SkiaRect, SkiaGroup, SkiaTextNode } from '@three-flatland/skia/three'
import { SkiaFont } from '@three-flatland/skia'

const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true })
renderer.setSize(512, 512)

const canvas = new SkiaCanvas({ renderer, width: 512, height: 512, overlay: true })
await canvas.ready // wait for WASM to load

const rect = new SkiaRect()
rect.x = 50; rect.y = 50; rect.width = 200; rect.height = 100
rect.cornerRadius = 12
rect.fill = [1, 0, 0, 1] // red

canvas.add(rect)

// In your render loop:
canvas.invalidate()
canvas.render(renderer)
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
- **SkiaGroup**: pushes canvas state (save/saveLayer), applies transforms and clips, recurses into children, then restores.
- **SkiaNode subclass**: resolves its paint (from inline props or explicit `paint` reference), calls the appropriate draw method, and returns.
- **Plain Object3D**: recurses into its children (so you can nest arbitrary Three.js structure).

Invisible nodes (`visible = false`) are skipped entirely.

## Components

### SkiaCanvas

The root container. Owns the render target and orchestrates the draw pass.

| Property | Type | Description |
|---|---|---|
| `renderer` | `WebGLRenderer` | Three.js renderer (required) |
| `width` | `number` | Surface width in pixels |
| `height` | `number` | Surface height in pixels |
| `overlay` | `boolean` | If true, draw to FBO 0 (canvas framebuffer) instead of a render target |
| `ready` | `Promise<SkiaContext>` | Resolves when WASM is loaded and context is ready |
| `texture` | `Texture \| null` | Output texture (render-target mode only) |

**Methods:**
- `render(renderer)` &mdash; Run the Skia draw pass. No-op until `ready` resolves.
- `invalidate()` &mdash; Mark as needing redraw (render-target mode skips unchanged frames).
- `setSize(w, h)` &mdash; Resize the surface and render target.
- `dispose()` &mdash; Release GPU resources.

**Modes:**
- **Render target** (default): Skia draws to a `WebGLRenderTarget`. Use `canvas.texture` as a material map on a Three.js mesh. Good for compositing Skia content into a 3D scene.
- **Overlay** (`overlay: true`): Skia draws directly to the WebGL canvas (FBO 0). Good for HUD, debug overlays, or when Skia is the only renderer.

### SkiaGroup

Transform, clip, and effects container. This is the key grouping primitive &mdash; it does **not** draw anything itself, but wraps its children in a canvas save/restore (or `saveLayer` when effects are active).

**Why SkiaGroup exists:** In Skia, effects like blur, opacity, and shadows apply to a *composited layer*, not individual shapes. If you blur a group of overlapping circles, they blur as one unit. This is fundamentally different from blurring each circle individually. SkiaGroup maps directly to Skia's `saveLayer` mechanism.

| Property | Type | Default | Description |
|---|---|---|---|
| `tx` | `number` | 0 | Translate X |
| `ty` | `number` | 0 | Translate Y |
| `skiaRotate` | `number` | 0 | Rotation in degrees |
| `scaleSkiaX` | `number` | 1 | Scale X |
| `scaleSkiaY` | `number` | 1 | Scale Y |
| `skewX` | `number` | 0 | Skew X |
| `skewY` | `number` | 0 | Skew Y |
| `clipRect` | `[x, y, w, h]` | null | Rectangular clip |
| `clipRoundRect` | `{x, y, w, h, rx, ry}` | null | Rounded rectangle clip |
| `clipPath` | `SkiaPath` | null | Arbitrary path clip |
| `opacity` | `number` | 1 | Group opacity (0-1). Triggers saveLayer. |
| `blendMode` | `BlendMode` | null | Layer blend mode |
| `blur` | `number` | 0 | Gaussian blur sigma on all children as a group |
| `shadow` | `SkiaShadowProps` | null | Drop shadow on the group's composite shape |
| `colorMatrix` | `number[]` | null | 4x5 color matrix (20 floats) &mdash; grayscale, sepia, etc. |
| `backdropBlur` | `number` | 0 | Blur the content *behind* this group (frosted glass) |
| `layer` | `SkiaPaint` | null | Explicit layer paint &mdash; overrides all semantic effects |

**When does saveLayer activate?** Any time `opacity < 1`, `blur > 0`, `shadow`, `colorMatrix`, or `blendMode` is set. Without these, the group uses a plain `save()/restore()` (no GPU texture allocation).

**Shadow:**
```ts
group.shadow = { dx: 4, dy: 4, blur: 3, color: 0x80000000 }
group.shadow = { dx: 0, dy: 8, blur: 6, color: 0x40000000, shadowOnly: true }
```

**Backdrop blur (frosted glass):**
```ts
group.backdropBlur = 10
group.clipRoundRect = { x: 0, y: 0, w: 200, h: 100, rx: 12, ry: 12 }
```

### Drawing Nodes

All drawing nodes extend `SkiaNode` and share these common paint properties:

| Property | Type | Description |
|---|---|---|
| `fill` | `SkiaColor` | Fill color as `[r, g, b, a]` (0-1) or packed `0xAARRGGBB` |
| `stroke` | `SkiaColor` | Stroke color |
| `strokeWidth` | `number` | Stroke width in pixels |
| `strokeCap` | `StrokeCap` | `'butt'`, `'round'`, or `'square'` |
| `strokeJoin` | `StrokeJoin` | `'miter'`, `'round'`, or `'bevel'` |
| `strokeMiter` | `number` | Miter limit for miter joins |
| `opacity` | `number` | Alpha (0-1) |
| `blur` | `number` | Blur mask filter sigma |
| `dash` | `{intervals, phase?}` | Dash pattern |
| `blendMode` | `BlendMode` | Porter-Duff blend mode |
| `antiAlias` | `boolean` | Anti-aliasing (default: Skia default, usually on) |
| `paint` | `SkiaPaint` | Explicit paint &mdash; overrides all inline props above |

Setting `fill` makes the node filled. Setting `stroke` makes it stroked. For both fill and stroke on the same shape, use two sibling nodes or an explicit `paint`.

#### SkiaRect

```ts
const rect = new SkiaRect()
rect.x = 10; rect.y = 10; rect.width = 200; rect.height = 100
rect.cornerRadius = 8  // 0 = sharp corners
rect.fill = [0.2, 0.4, 0.9, 1]
```

#### SkiaCircle

```ts
const circle = new SkiaCircle()
circle.cx = 100; circle.cy = 100; circle.r = 50
circle.fill = [1, 0, 0, 1]
```

#### SkiaOval

```ts
const oval = new SkiaOval()
oval.x = 10; oval.y = 10; oval.width = 200; oval.height = 100
oval.fill = [0, 1, 0.5, 1]
```

#### SkiaLine

```ts
const line = new SkiaLine()
line.x1 = 0; line.y1 = 0; line.x2 = 200; line.y2 = 100
line.stroke = [1, 1, 1, 0.5]; line.strokeWidth = 2
```

#### SkiaPathNode

Draws an SVG path string or an explicit `SkiaPath` reference.

```ts
const pathNode = new SkiaPathNode()
pathNode.d = 'M10 80 Q95 10 180 80 T350 80'  // SVG path data
pathNode.fill = [0.8, 0.3, 0.1, 1]
pathNode.fillType = 'evenOdd'  // or 'winding' (default)
```

Or with an explicit path (for PathOps, dynamic geometry, etc.):
```ts
const path = new SkiaPath(skia).moveTo(0, 0).lineTo(100, 50).lineTo(0, 100).close()
pathNode.path = path
```

#### SkiaTextNode

```ts
const text = new SkiaTextNode()
text.text = 'Hello, Skia!'
text.x = 50; text.y = 100
text.font = font  // SkiaFont instance
text.fill = [1, 1, 1, 1]
```

Requires a loaded `SkiaFont`. See **Loaders** below.

#### SkiaTextPathNode

Draws text along a path, positioning each glyph using `SkiaPathMeasure`.

```ts
const textPath = new SkiaTextPathNode()
textPath.text = 'Curved text!'
textPath.path = path  // SkiaPath to follow
textPath.font = font
textPath.fill = [1, 1, 1, 1]
textPath.offset = 0  // starting offset along path (pixels)
```

#### SkiaImageNode

```ts
const imgNode = new SkiaImageNode()
imgNode.image = image  // SkiaImage instance
imgNode.x = 10; imgNode.y = 10
imgNode.width = 200; imgNode.height = 150  // destination size
// Optional: source rectangle for cropping
imgNode.srcRect = [0, 0, 512, 512]
```

## Loaders

Loaders follow the Three.js `Loader` pattern and work with R3F's `useLoader`.

### SkiaFontLoader

```ts
import { SkiaFontLoader } from '@three-flatland/skia/three'

// Static convenience
const font = await SkiaFontLoader.load('/fonts/Inter.ttf')

// Or with options
const loader = new SkiaFontLoader()
loader.size = 24
const font = await loader.loadAsync('/fonts/Inter.ttf')
```

Fonts are cached by URL. Call `SkiaFontLoader.clearCache()` to release.

### SkiaImageLoader

```ts
import { SkiaImageLoader } from '@three-flatland/skia/three'

const image = await SkiaImageLoader.load('/textures/sprite.png')
```

Images are decoded by the browser (no codecs in WASM), then uploaded as a Skia image handle.

## Explicit Paint Escape Hatch

Inline props cover the most common cases. For advanced effects (gradients, shaders, path effects, image filters), create a `SkiaPaint` and assign it directly:

```ts
import { SkiaPaint, SkiaShader } from '@three-flatland/skia'

const paint = new SkiaPaint(skia)
  .setFill()
  .setLinearGradient(0, 0, 200, 0,
    [0xFFFF0000, 0xFF0000FF], [0.0, 1.0])

const rect = new SkiaRect()
rect.paint = paint  // overrides fill/stroke/etc.
```

For group-level effects beyond the semantic props, use the `layer` escape hatch:

```ts
import { SkiaPaint, SkiaImageFilter } from '@three-flatland/skia'

const layerPaint = new SkiaPaint(skia)
const filter = SkiaImageFilter.blur(skia, 4, 4)
layerPaint.setImageFilter(filter)

const group = new SkiaGroup()
group.layer = layerPaint  // overrides blur/shadow/colorMatrix/etc.
```

## Render Target vs Overlay

**Render target** (default) draws to an offscreen texture:
```ts
const canvas = new SkiaCanvas({ renderer, width: 512, height: 512 })
// canvas.texture is a Three.js Texture you can use on a mesh
const material = new THREE.MeshBasicMaterial({ map: canvas.texture })
```

**Overlay** draws directly to the WebGL canvas:
```ts
const canvas = new SkiaCanvas({ renderer, width: 512, height: 512, overlay: true })
// Call after your Three.js scene render for HUD/overlay
canvas.render(renderer)
```

After Skia draws, call `skia.resetGLState()` if you're sharing the GL context with Three.js rendering in the same frame.

## GL State

Skia and Three.js share the same WebGL2 context. Skia modifies GL state (shaders, textures, framebuffers, etc.) during its draw pass. `SkiaCanvas.render()` automatically calls `resetGLState()` after drawing, which tells Skia to invalidate its GL state cache. This ensures Three.js and Skia don't conflict.

If you're using the core `SkiaContext` API directly (not `SkiaCanvas`), call `skia.resetGLState()` after each draw pass before returning control to Three.js.
