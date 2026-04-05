# React Three Fiber Integration

`@three-flatland/skia/react` provides JSX type augmentation, hooks, and the full Three.js scene graph for using Skia in R3F.

## Setup

R3F users should always import from `@three-flatland/skia/react`. This single subpath gives you:
- ThreeElements type augmentation (JSX types for `<skiaRect>`, etc.)
- All Three.js scene graph components (SkiaCanvas, SkiaRect, SkiaGroup, loaders, etc.)
- React hooks (useSkiaContext, useSkiaDraw)

For core API classes (SkiaPaint, SkiaPath, SkiaFont, etc.), import from the base package:

```tsx
import { SkiaCanvas, SkiaRect, SkiaGroup, useSkiaContext } from '@three-flatland/skia/react'
import { SkiaPaint, SkiaPath } from '@three-flatland/skia'
```

JSX elements are available automatically:

```tsx
<skiaCanvas>
  <skiaGroup tx={50} ty={50} opacity={0.8}>
    <skiaRect fill={[1, 0, 0, 1]} width={200} height={100} cornerRadius={8} />
    <skiaCircle cx={100} cy={50} r={30} fill={[0, 1, 0, 1]} />
  </skiaGroup>
</skiaCanvas>
```

## JSX Elements

Every Three.js component from `@three-flatland/skia/three` has a corresponding JSX element:

| JSX Element | Class | Description |
|---|---|---|
| `<skiaCanvas>` | `SkiaCanvas` | Root container (render target or overlay) |
| `<skiaGroup>` | `SkiaGroup` | Transform, clip, and effects container |
| `<skiaRect>` | `SkiaRect` | Rectangle / rounded rectangle |
| `<skiaCircle>` | `SkiaCircle` | Circle |
| `<skiaOval>` | `SkiaOval` | Oval / ellipse |
| `<skiaLine>` | `SkiaLine` | Line segment |
| `<skiaPathNode>` | `SkiaPathNode` | SVG path or explicit SkiaPath |
| `<skiaTextNode>` | `SkiaTextNode` | Text (requires SkiaFont) |
| `<skiaImageNode>` | `SkiaImageNode` | Image (requires SkiaImage) |
| `<skiaTextPathNode>` | `SkiaTextPathNode` | Text along a path |

All props map 1:1 to the class properties documented in [three.md](./three.md).

## Hooks

### useSkiaContext

Returns the `SkiaContext` singleton, initializing it from the R3F renderer if needed.

```tsx
import { useSkiaContext } from '@three-flatland/skia/react'

function MyComponent() {
  const skia = useSkiaContext()
  if (!skia) return null // loading WASM

  // skia is a SkiaContext — create paints, paths, etc.
}
```

### useSkiaDraw

Registers an imperative draw callback. Currently a placeholder for future use with custom draw passes.

## Loading Resources

Use R3F's `useLoader` with the Three.js loaders:

```tsx
import { useLoader } from '@react-three/fiber'
import { SkiaFontLoader, SkiaImageLoader } from '@three-flatland/skia/react'

function TextDemo() {
  const font = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
  return <skiaTextNode text="Hello" x={50} y={100} font={font} fill={[1, 1, 1, 1]} />
}

function ImageDemo() {
  const image = useLoader(SkiaImageLoader, '/textures/sprite.png')
  return <skiaImageNode image={image} x={0} y={0} width={256} height={256} />
}
```

Both loaders cache by URL. Wrap in `<Suspense>` for loading states:

```tsx
<Suspense fallback={null}>
  <TextDemo />
</Suspense>
```

## Complete Example

```tsx
import { Canvas, useLoader } from '@react-three/fiber'
import { Suspense } from 'react'
import { SkiaFontLoader } from '@three-flatland/skia/react'

function SkiaOverlay() {
  const font = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')

  return (
    <skiaCanvas args={[{ renderer: null, width: 512, height: 512, overlay: true }]}>
      <skiaGroup tx={20} ty={20}>
        <skiaRect fill={[0.1, 0.1, 0.2, 1]} width={472} height={472} cornerRadius={12} />

        <skiaGroup tx={20} ty={20} blur={2}>
          <skiaRect fill={[1, 0.3, 0.3, 1]} width={100} height={100} cornerRadius={8} />
        </skiaGroup>

        <skiaTextNode
          text="@three-flatland/skia"
          x={20} y={460}
          font={font}
          fill={[1, 1, 1, 1]}
        />
      </skiaGroup>
    </skiaCanvas>
  )
}

export default function App() {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <SkiaOverlay />
      </Suspense>
    </Canvas>
  )
}
```

## Caveats

### SkiaCanvas requires a renderer

`SkiaCanvas` needs a `WebGLRenderer` reference. In R3F, the renderer is managed internally. When using `<skiaCanvas>` as a JSX element, R3F calls `new SkiaCanvas()` with no args, then sets properties. The `renderer` must be passed via the `args` prop or set imperatively via a ref.

In practice, `SkiaCanvas` auto-initializes from `SkiaContext.instance` if `Skia.init(renderer)` was called first. The cleanest pattern:

```tsx
import { useThree } from '@react-three/fiber'
import { useSkiaContext } from '@three-flatland/skia/react'

function SkiaLayer({ children }) {
  const skia = useSkiaContext() // auto-inits from R3F renderer
  const { gl } = useThree()

  // SkiaCanvas needs explicit renderer + dimensions
  return (
    <skiaCanvas args={[{ renderer: gl, width: 512, height: 512, overlay: true }]}>
      {children}
    </skiaCanvas>
  )
}
```

### Property names avoid Three.js conflicts

Some property names differ from what you might expect because Three.js `Object3D` already uses `rotation`, `scale`, `position`:

| Expected | Actual | Reason |
|---|---|---|
| `rotation` | `skiaRotate` | `Object3D.rotation` is an Euler |
| `scaleX/Y` | `scaleSkiaX/Y` | `Object3D.scale` is a Vector3 |
| `x/y` | `tx/ty` | Group translation (on SkiaGroup) |
| `blendMode` | `blendMode` | No conflict &mdash; SkiaGroup extends Object3D directly |

Shape nodes (SkiaRect, SkiaCircle, etc.) use their own `x`, `y`, `cx`, `cy` properties which don't conflict because they're custom properties, not inherited from Object3D.

### No hot-reloading of WASM

The Skia WASM module is loaded once. If your dev server hot-reloads, the `SkiaContext` singleton persists across re-renders. Font and image caches also persist. This is usually fine, but if you see stale state after a code change, a full page reload resolves it.

### Font loading is async

`SkiaFont` requires font file data. In R3F, use `useLoader(SkiaFontLoader, url)` with `<Suspense>`. Don't try to render `<skiaTextNode>` without a font &mdash; it silently skips drawing if `font` is null.

### Paint object lifecycle

If you create explicit `SkiaPaint`, `SkiaPath`, or `SkiaShader` objects and pass them as props, you own their lifecycle. Dispose them when the component unmounts:

```tsx
function GradientRect() {
  const skia = useSkiaContext()
  const paint = useMemo(() => {
    if (!skia) return null
    return new SkiaPaint(skia).setFill()
      .setLinearGradient(0, 0, 200, 0, [0xFFFF0000, 0xFF0000FF], [0, 1])
  }, [skia])

  useEffect(() => () => paint?.dispose(), [paint])

  if (!paint) return null
  return <skiaRect paint={paint} width={200} height={100} />
}
```

Inline props (`fill`, `stroke`, etc.) are managed automatically by the `PaintCache` and don't need manual cleanup.

### WebGL stencil buffer required

Skia's GPU backend requires a stencil buffer for clipping and complex path fills. Ensure your R3F `<Canvas>` has stencil enabled:

```tsx
<Canvas gl={{ stencil: true }}>
```

This is the default in most Three.js setups, but worth checking if you see clipping artifacts.
