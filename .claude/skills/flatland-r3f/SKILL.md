# Flatland R3F Integration Skill

> **Purpose:** Guide for properly integrating Flatland with React Three Fiber (R3F).
> **Core Principle:** Use declarative React patterns with R3F's `extend()` API.

---

## Understanding Flatland Architecture

Flatland **extends Group** and is a valid Three.js scene graph node:

```typescript
// Flatland extends Group, so it works with R3F's scene graph
class Flatland extends Group {
  readonly scene: Scene         // Internal scene for rendering
  readonly spriteGroup: SpriteGroup  // For batch rendering
  readonly camera: OrthographicCamera
  readonly globals: GlobalUniforms   // Shared uniforms (time, tint, etc.)
}
```

All classes in Flatland extend three.js base classes, so they can be registered with R3F's `extend()` API and used as JSX elements. When adding new classes we need to augment R3F's `ThreeElements` type to enable JSX support.

---

## The Correct R3F Pattern

### 1. Register with extend()

```tsx
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Flatland, Sprite2D } from '@three-flatland/react'

// Register Flatland and its children with R3F
extend({ Flatland, Sprite2D })
```

### 2. Use declaratively in JSX

```tsx
function Scene() {
  const flatlandRef = useRef<Flatland>(null)
  const { gl, size } = useThree()

  // Handle resize
  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Render loop — Flatland.render() handles everything
  useFrame(() => {
    flatlandRef.current?.render(gl)
  })

  return (
    <flatland
      ref={flatlandRef}
      viewSize={300}
      clearColor={0x1a1a2e}
    >
      <sprite2D texture={texture} position={[0, 0, 0]} scale={[64, 64, 1]} />
    </flatland>
  )
}
```

### 3. Complete Example

```tsx
import { Suspense, useRef, useEffect } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Flatland, Sprite2D, TextureLoader } from '@three-flatland/react'

// Register with R3F
extend({ Flatland, Sprite2D })

function Scene() {
  const texture = useLoader(TextureLoader, '/sprites/knight.png')
  const flatlandRef = useRef<Flatland>(null)
  const { gl, size } = useThree()

  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  useFrame(() => {
    flatlandRef.current?.render(gl)
  })

  return (
    <flatland ref={flatlandRef} viewSize={300} clearColor={0x1a1a2e}>
      <sprite2D texture={texture} position={[0, 0, 0]} scale={[64, 64, 1]} />
    </flatland>
  )
}

export default function App() {
  return (
    <Canvas gl={{ antialias: false }}>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}
```

---

## How Flatland Routing Works

Flatland overrides `add()` to route children appropriately:

```typescript
// Inside Flatland.add()
add(...objects: Object3D[]): this {
  for (const child of objects) {
    if (child instanceof Sprite2D) {
      // Wire global uniforms to the material
      if (!child.material.globalUniforms) {
        child.material.globalUniforms = this.globals
      }
      this.spriteGroup.add(child)  // Sprites go to batch group
    } else {
      this.scene.add(child)        // Other objects to internal scene
    }
  }
  return this
}
```

This means:
- R3F's reconciler calls `flatland.add(child)` for each JSX child
- Children are automatically routed to the correct internal container
- Rendering uses `flatland.scene` and `flatland.camera`

---

## Post-Processing with Flatland

For post-processing effects, use `addEffect()`:

```tsx
import { crtComplete, vignette } from '@three-flatland/react'

function PostProcessingScene() {
  const { gl, size } = useThree()
  const flatlandRef = useRef<Flatland>(null)

  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Add effects once
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return

    flatland.addEffect((input, uv) => crtComplete(input, uv, { curvature: 0.15 }))
    flatland.addEffect((input, uv) => vignette(input, uv, 0.5))
  }, [])

  useFrame(() => {
    flatlandRef.current?.render(gl)
  })

  return (
    <flatland ref={flatlandRef} viewSize={300} clearColor={0x1a1a2e}>
      <sprite2D texture={texture} />
    </flatland>
  )
}
```

Or for manual post-processing control:

```tsx
import { PostProcessing } from 'three/webgpu'
import { pass, uv } from 'three/tsl'

function ManualPostProcessing() {
  const { gl } = useThree()
  const flatlandRef = useRef<Flatland>(null)

  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return

    const postProcessing = new PostProcessing(gl)
    const scenePass = pass(flatland.scene, flatland.camera)
    postProcessing.outputNode = crtComplete(scenePass, uv(), { curvature: 0.15 })

    flatland.setPostProcessing(postProcessing, scenePass)

    return () => {
      postProcessing.dispose?.()
    }
  }, [gl])

  useFrame(() => {
    flatlandRef.current?.render(gl)
  }, 1)

  return (
    <flatland ref={flatlandRef} viewSize={300} clearColor={0x1a1a2e}>
      <sprite2D texture={texture} />
    </flatland>
  )
}
```

---

## Key Differences from Vanilla

| Vanilla Three.js | React Three Fiber |
|-----------------|-------------------|
| `new Flatland({...})` | `<flatland viewSize={300}>` |
| `flatland.add(sprite)` | `<sprite2D>` as child of `<flatland>` |
| `flatland.render(renderer)` | Manual via `useFrame` |
| `flatland.resize(w, h)` | Manual via `useEffect` + `useThree().size` |

---

## Anti-Patterns to Avoid

### Bad: Creating Flatland outside of JSX

```tsx
// BAD: Creates Flatland imperatively, bypasses R3F's scene graph
function Bad() {
  const flatland = useMemo(() => {
    const fl = new Flatland({ viewSize: 300 })
    const sprite = new Sprite2D({ texture })
    fl.add(sprite)  // Imperative child management
    return fl
  }, [])

  useFrame(() => {
    flatland.render(gl)
  })

  return null  // Nothing in the JSX tree
}
```

### Good: Declarative with extend()

```tsx
// GOOD: Declarative, R3F-idiomatic
extend({ Flatland, Sprite2D })

function Good() {
  const flatlandRef = useRef<Flatland>(null)
  const { gl, size } = useThree()

  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  useFrame(() => {
    flatlandRef.current?.render(gl)
  })

  return (
    <flatland ref={flatlandRef} viewSize={300}>
      <sprite2D texture={texture} />
    </flatland>
  )
}
```

---

## Why Manual Rendering is Required

Flatland has its own internal camera and scene, which means:
1. R3F's default render loop renders the main scene with the main camera
2. Flatland's content is in a separate internal scene
3. You must explicitly call `flatland.render(renderer)` in `useFrame`

This is similar to how render targets work in R3F - you render to them manually.

---

## Extending JSX Types

The `@three-flatland/react` package includes type augmentation:

```typescript
// packages/react/src/types.ts
declare module '@react-three/fiber' {
  interface ThreeElements {
    flatland: ThreeElement<typeof Flatland>
    sprite2D: ThreeElement<typeof Sprite2D>
    spriteGroup: ThreeElement<typeof SpriteGroup>
    // ...
  }
}
```

This enables TypeScript support for JSX elements after calling `extend()`.
