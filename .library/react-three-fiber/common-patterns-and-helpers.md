# Common Patterns and Helpers in drei (v10 / Three.js r183)

Recurring patterns, shared utilities, and architectural conventions used across the 115+ components in drei v10.

> **Note:** v10 targets Three.js r183 with R3F v8+. All shaders are GLSL. No TSL or WebGPU code paths exist yet. The codebase includes version-compatibility shims for Three.js r152-r183.

---

## Project Structure

```
src/
  core/       # ~115 components -- the bulk of the library
  materials/  # Standalone material classes (SpotLightMaterial, ConvolutionMaterial,
              #   MeshReflectorMaterial, MeshRefractionMaterial, WireframeMaterial,
              #   DiscardMaterial, ShadowMaterial)
  helpers/    # Shared utilities
    ts-utils.tsx            # ForwardRefComponent, Overwrite, NamedArrayTuple
    useEffectfulState.tsx   # Layout-effect-based state initialization
    constants.ts            # Three.js version detection from REVISION
    deprecated.ts           # Compat shims (setUpdateRange, LinearEncoding, sRGBEncoding)
    environment-assets.ts   # 10 built-in HDR preset URLs
    glsl/                   # Shared GLSL fragments (distort, noise)
  web/        # Web-specific components (Html, FaceControls, pivotControls, etc.)
  native/     # React Native re-exports from core
  index.ts    # Barrel: web/ -> core/
```

### Export Categories (from `src/core/index.ts`)

| Category | Examples |
|----------|----------|
| **Abstractions** | Instances, Merged, Clone, Points, Segments, Billboard, Text, Text3D |
| **Cameras** | PerspectiveCamera, OrthographicCamera, CubeCamera |
| **Controls** | OrbitControls, TransformControls, CameraControls, FlyControls, PointerLockControls |
| **Gizmos** | GizmoHelper, GizmoViewcube, GizmoViewport, Grid |
| **Loaders** | useGLTF, useTexture, useEnvironment, useFont, useKTX2, useProgress |
| **Shaders** | shaderMaterial, MeshDistortMaterial, MeshWobbleMaterial, MeshTransmissionMaterial, softShadows |
| **Shapes** | shapes (Plane, Box, Sphere...), RoundedBox, ScreenQuad |
| **Staging** | Center, Stage, Backdrop, Shadow, Environment, Lightformer, Sky, Stars |
| **Performance** | Points, Instances, Segments, Detailed (LOD), AdaptiveDpr, PerformanceMonitor, Bvh |
| **Portals** | RenderTexture, RenderCubeTexture, Mask, Hud, Fisheye, MeshPortalMaterial |

---

## Shared Type Utilities

### `ForwardRefComponent<P, T>` (used by every component)

```typescript
// src/helpers/ts-utils.tsx
export type ForwardRefComponent<P, T> =
  ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<T>>
```

### `Overwrite<T, O>`

```typescript
export type Overwrite<T, O> = Omit<T, NonFunctionKeys<O>> & O
```

Replaces properties in `T` with those in `O`. Used to override inherited Three.js prop types in controls components.

---

## Version Compatibility System

drei v10 supports a range of Three.js versions via runtime detection:

### Version Detection

```typescript
// src/helpers/constants.ts
import { REVISION } from 'three'
export const version = parseInt(REVISION.replace(/\D+/g, ''))
```

### API Change Shims

```typescript
// src/helpers/deprecated.ts

// r159: BufferAttribute.updateRange -> updateRanges[0]
export const setUpdateRange = (attribute, updateRange) => {
  if ('updateRanges' in attribute) {
    attribute.updateRanges[0] = updateRange  // r159+
  } else {
    attribute.updateRange = updateRange       // pre-r159
  }
}

// r152/r162: TextureEncoding deprecated then removed
export const LinearEncoding = 3000
export const sRGBEncoding = 3001
```

### Version-Conditional Shader Includes

```typescript
// r154: output_fragment -> opaque_fragment
const opaque_fragment = version >= 154 ? 'opaque_fragment' : 'output_fragment'

// r154: encodings_fragment -> colorspace_fragment
`#include <${version >= 154 ? 'colorspace_fragment' : 'encodings_fragment'}>`

// r155: physically-based light intensity
intensity: version >= 155 ? Math.PI : 1
```

---

## Loading Patterns

All asset-loading hooks wrap `useLoader` from R3F and provide static `.preload()` and `.clear()` methods.

### useGLTF

```typescript
// src/core/useGLTF.tsx
export const useGLTF = (path, useDraco = true, useMeshopt = true, extendLoader?) =>
  useLoader(GLTFLoader, path, extensions(useDraco, useMeshopt, extendLoader))

useGLTF.preload = (path, ...) => useLoader.preload(GLTFLoader, path, ...)
useGLTF.clear = (input) => useLoader.clear(GLTFLoader, input)
useGLTF.setDecoderPath = (path) => { decoderPath = path }
```

### Loader Extension Callback

```typescript
function extensions(useDraco = true, useMeshopt = true, extendLoader) {
  return (loader: GLTFLoader) => {
    if (useDraco) {
      const dracoLoader = new DRACOLoader()
      loader.setDRACOLoader(dracoLoader)
    }
    if (useMeshopt) loader.setMeshoptDecoder(MeshoptDecoder)
    extendLoader?.(loader)
  }
}
```

### useTexture with GPU Upload

```typescript
// src/core/useTexture.tsx
export function useTexture<Url extends string[] | string | Record<string, string>>(
  input: Url,
  onLoad?: (texture: MappedTextureType<Url>) => void
): MappedTextureType<Url> {
  const textures = useLoader(TextureLoader, /* ... */)

  // Eagerly upload to GPU for WebGL
  useEffect(() => {
    if ('initTexture' in gl) {
      textureArray.forEach((texture) => {
        if (texture instanceof Texture) gl.initTexture(texture)
      })
    }
  }, [gl, textures])

  return textures
}

useTexture.preload = (url) => useLoader.preload(TextureLoader, url)
useTexture.clear = (input) => useLoader.clear(TextureLoader, input)
```

### useEnvironment

Supports equirectangular (HDR/EXR), cubemaps (6 files), gainmap (WebP), and HDR JPG. Auto-detects format.

---

## Shader Integration Patterns

### Pattern A: `onBeforeCompile` Chunk Replacement (dominant)

```typescript
// src/core/MeshDistortMaterial.tsx
onBeforeCompile(shader) {
  shader.uniforms.time = this._time
  shader.vertexShader = `uniform float time; ${distort} ${shader.vertexShader}`
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `vec3 transformed = vec3(position * (noise * pow(distort, 2.0) + radius));`
  )
}
```

Common replacement targets:
- `#include <begin_vertex>` -- vertex position
- `#include <emissivemap_fragment>` -- emission
- `#include <opaque_fragment>` (r154+) / `#include <output_fragment>` (pre-r154) -- final color
- `#include <colorspace_fragment>` (r154+) / `#include <encodings_fragment>` (pre-r154) -- color space

### Pattern B: `shaderMaterial` Factory

```typescript
const MyMaterial = shaderMaterial(
  { time: 0, color: new THREE.Color() },
  vertexShader,
  fragmentShader
)
extend({ MyMaterial })
<myMaterial time={elapsed} color="red" />
```

12 materials in the codebase use this factory.

### Pattern C: Inline GLSL in Pure ShaderMaterial

```typescript
// src/core/Stars.tsx
super({
  uniforms: { time: { value: 0.0 }, fade: { value: 1.0 } },
  vertexShader: /* glsl */ `...`,
  fragmentShader: /* glsl */ `...`,
})
```

The `/* glsl */` comment tag enables syntax highlighting in editors.

### Pattern D: Imported GLSL Files

```typescript
// @ts-ignore
import distort from '../helpers/glsl/distort.vert.glsl'
```

Shared GLSL fragments in `src/helpers/glsl/` are imported and injected into shaders.

---

## FBO / Render Target Pattern

```typescript
// src/core/useFBO.tsx
export function useFBO(width?, height?, settings?): WebGLRenderTarget {
  const gl = useThree((state) => state.gl)
  const [target] = React.useState(() => {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      ...settings,
    })
    if (settings?.samples) target.samples = settings.samples
    return target
  })

  React.useLayoutEffect(() => {
    target.setSize(width, height)
    if (settings?.samples) target.samples = settings.samples
  }, [width, height, settings?.samples])

  React.useEffect(() => {
    return () => target.dispose()
  }, [])

  return target
}
```

Used by `RenderTexture`, `CubeCamera`, `Caustics`, `MeshTransmissionMaterial`, and others.

---

## Subscribe/Unsubscribe Pattern

Used by `Instances`, `Points`, and similar batched components:

```typescript
// Parent provides subscription API via context
const api = React.useMemo(() => ({
  getParent: () => parentRef,
  subscribe: (ref) => {
    setInstances((instances) => [...instances, ref])
    return () => setInstances((instances) =>
      instances.filter((item) => item.current !== ref.current)
    )
  },
}), [])

// Child subscribes in useLayoutEffect
React.useLayoutEffect(() => subscribe(group), [])
```

The subscribe function returns an unsubscribe function, matching React's cleanup pattern.

---

## Render-Children Patterns

### Standard Children

```typescript
<group {...props}>
  <group ref={ref}>{children}</group>
</group>
```

### Functional Children (Render Props)

```typescript
// src/core/Instances.tsx
{isFunctionChild(children)
  ? <context.Provider value={api}>{children(instance)}</context.Provider>
  : <context.Provider value={api}>{children}</context.Provider>
}

// Usage:
<Instances>
  {(Instance) => <Instance position={[0, 0, 0]} />}
</Instances>
```

### Children as Texture Source (Portal)

```typescript
// src/core/RenderTexture.tsx
return createPortal(
  <Container renderPriority={renderPriority} frames={frames} fbo={fbo}>
    {children}
  </Container>,
  virtualScene,
  { events: { compute: uvCompute, priority: eventPriority } }
)
```

---

## Performance Patterns

### Frame Limiting

```typescript
let iterations = 0
useFrame(() => {
  if (frames === Infinity || iterations < frames) {
    // ... expensive work
    iterations++
  }
})
```

Many components accept a `frames` prop. Set to `1` for static content (compute once), `Infinity` for continuous.

### Buffer Attribute Update Ranges

```typescript
// src/core/Instances.tsx
import { setUpdateRange } from '../helpers/deprecated'

setUpdateRange(parentRef.current.instanceMatrix, { offset: 0, count: count * 16 })
parentRef.current.instanceMatrix.needsUpdate = true
```

Only mark the changed portion of a buffer for upload.

### `matrixAutoUpdate = false`

```typescript
// src/core/Float.tsx
<group ref={ref} matrixAutoUpdate={false}>

// Then manually:
ref.current.updateMatrix()
```

Disable automatic matrix computation when you're manually updating transforms in `useFrame`.

### Demand-Based Invalidation

```typescript
const invalidate = useThree((state) => state.invalidate)

useFrame(() => {
  if (needsUpdate) {
    // ... do work
    invalidate()  // request a new frame
  }
})
```

---

## Event Handling Patterns

### Stable Callback via Closure

```typescript
// src/core/OrbitControls.tsx
React.useEffect(() => {
  const callback = (e) => {
    invalidate()
    if (regress) performance.regress()
    if (onChange) onChange(e)
  }
  controls.addEventListener('change', callback)
  return () => controls.removeEventListener('change', callback)
}, [onChange, onStart, onEnd, controls, invalidate])
```

### Disabling Raycast

```typescript
<instancedMesh raycast={() => null} {...props}>
```

---

## JSX Namespace Augmentation (v10)

v10 uses `declare global` exclusively (not `declare module '@react-three/fiber'`):

```typescript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      positionMesh: ReactThreeFiber.Object3DNode<PositionMesh, typeof PositionMesh>
      starfieldMaterial: ReactThreeFiber.MaterialNode<StarfieldMaterial, []>
      softShadowMaterial: ReactThreeFiber.Object3DNode<SoftShadowMaterial, typeof SoftShadowMaterial>
    }
  }
}
```

24 files use this pattern. The type helpers come from `@react-three/fiber`:
- `ReactThreeFiber.Object3DNode<Instance, Constructor>` -- for Object3D subclasses
- `ReactThreeFiber.MaterialNode<Instance, ConstructorArgs>` -- for materials
- `JSX.IntrinsicElements['existingElement']` -- for extending existing element types

---

## Quick Reference

| Pattern | When to Use |
|---------|-------------|
| `ForwardRefComponent<P, T>` | Every component signature |
| `useImperativeHandle(ref, () => obj, [])` | Every component's ref forwarding |
| `useThree((s) => s.thing)` | Accessing R3F state (prefer individual selectors) |
| `useFrame((state) => { ... })` | Per-frame imperative mutations |
| `useState(() => new Thing())` | Stable object creation (no deps) |
| `useMemo(() => new Thing(dep), [dep])` | Object creation with dependencies |
| `<primitive object={obj} attach="..." />` | Bridging imperative to declarative |
| `extend({ MyClass })` | Registering custom JSX elements |
| `declare global { namespace JSX }` | Type declarations for custom elements (v10) |
| `useLoader(Loader, url, configCb)` | Asset loading with Suspense |
| `useFBO(w, h, settings)` | Offscreen render targets |
| `createPortal(jsx, scene)` | Isolated scene rendering |
| `applyProps(obj, { ... })` | Imperative prop application |
| `version >= 154` | Three.js version-conditional code |
| `setUpdateRange(attr, range)` | Buffer attribute compat shim |
| `frames` prop + iteration counting | Limiting per-frame work |
| `matrixAutoUpdate={false}` | Performance for animated transforms |
| `/* @__PURE__ */` annotation | Tree-shaking for forwardRef components |
