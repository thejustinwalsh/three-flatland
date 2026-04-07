# React Three Fiber Integration

`@three-flatland/skia/react` provides JSX type augmentation, hooks, attach helpers, and the full Three.js scene graph.

## Setup

Import everything from `@three-flatland/skia/react`. For core API classes (`SkiaPaint`, `SkiaPath`, etc.), import from `@three-flatland/skia`.

```tsx
import { SkiaCanvas, SkiaRect, SkiaGroup, SkiaFontLoader, useSkiaContext, attachSkiaTexture } from '@three-flatland/skia/react'
import { SkiaPaint, SkiaPath } from '@three-flatland/skia'
```

## SkiaCanvas

The `<SkiaCanvas>` wrapper provides the Skia context to children via React context. Child components access it with `useSkiaContext()`.

```tsx
<SkiaCanvas renderer={renderer} width={512} height={512}>
  <skiaRect fill={[1, 0, 0, 1]} width={200} height={100} />
</SkiaCanvas>
```

## useSkiaContext

Returns the nearest `SkiaContext`. Suspends via `use()` if the context isn't ready yet.

```tsx
function MyComponent() {
  const skia = useSkiaContext() // always returns SkiaContext, never null
  const [paint] = useState(() => new SkiaPaint(skia).setFill())
  // ...
}
```

Resolution order:
1. Nearest `<SkiaCanvas>` parent (React context)
2. `SkiaContext.instance` singleton
3. `Skia.pending` (suspends until init completes)
4. `Skia.init(renderer)` from R3F renderer (suspends)

## Texture Attachment

Use `attachSkiaTexture` to apply a SkiaCanvas texture to a material:

```tsx
<mesh>
  <meshBasicMaterial transparent premultipliedAlpha>
    <SkiaCanvas attach={attachSkiaTexture} renderer={renderer} width={1024} height={880}>
      <skiaRect fill={[1, 0, 0, 1]} width={100} height={100} />
    </SkiaCanvas>
  </meshBasicMaterial>
</mesh>
```

## Font Loading

`SkiaFontLoader` works with R3F's `useLoader`. Returns a `SkiaTypeface` — call `.atSize(n)` for sized fonts.

```tsx
import { useLoader } from '@react-three/fiber/webgpu'
import { SkiaFontLoader } from '@three-flatland/skia/react'

function TextDemo() {
  const typeface = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
  const titleFont = typeface.atSize(32)
  const bodyFont = typeface.atSize(14)

  return <>
    <skiaTextNode text="Title" font={titleFont} fill={[1, 1, 1, 1]} />
    <skiaTextNode text="Body" font={bodyFont} fill={[0.8, 0.8, 0.8, 1]} />
  </>
}
```

One `useLoader` call, one fetch. Multiple sized fonts from `.atSize()` — cached internally.

## Render Pipeline

SkiaCanvas does not auto-render. Call `render()` in `useFrame`:

```tsx
// Texture mode — render before Three.js scene
useFrame(() => {
  canvasRef.current?.render(true)
}, { before: 'render' })

// Overlay mode — render after Three.js scene
useFrame(() => {
  overlayRef.current?.render(true)
}, { after: 'render' })
```

## WASM Objects

Use `useState(() => ...)` initializers for `SkiaPaint`, `SkiaPath`, and other WASM-backed objects. Unlike `useMemo`, the `useState` initializer runs exactly once and survives React strict mode double-mounts.

```tsx
const skia = useSkiaContext()
const [paint] = useState(() => new SkiaPaint(skia).setFill())
const [paths] = useState(() => ({
  a: new SkiaPath(skia),
  b: new SkiaPath(skia),
  result: new SkiaPath(skia),
}))
```

## JSX Elements

All Skia nodes are available as lowercase JSX elements:

| Element | Class |
|---|---|
| `<skiaRect>` | `SkiaRect` |
| `<skiaCircle>` | `SkiaCircle` |
| `<skiaOval>` | `SkiaOval` |
| `<skiaLine>` | `SkiaLine` |
| `<skiaPathNode>` | `SkiaPathNode` |
| `<skiaTextNode>` | `SkiaTextNode` |
| `<skiaImageNode>` | `SkiaImageNode` |
| `<skiaTextPathNode>` | `SkiaTextPathNode` |
| `<skiaGroup>` | `SkiaGroup` |
