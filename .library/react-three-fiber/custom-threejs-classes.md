# Custom Three.js Class Patterns in drei (v10 / Three.js r183)

This document catalogs the patterns used when creating custom Three.js classes in the drei codebase on the v10 branch. These patterns ensure clean R3F interop, proper lifecycle management, and declarative usage from JSX.

> **Note:** As of v10, drei uses **exclusively GLSL-based shaders** and `onBeforeCompile`. There is no TSL (Three Shading Language) or WebGPU node material usage yet. All materials target the WebGL renderer.

## Overview

drei defines ~23 custom classes extending Three.js base classes:

| Category | Count | Extends | Examples |
|----------|-------|---------|----------|
| **onBeforeCompile Materials** | 5 | `MeshPhysicalMaterial`, `MeshStandardMaterial`, `PointsMaterial` | `DistortMaterialImpl`, `MeshReflectorMaterial`, `MeshTransmissionMaterialImpl` |
| **Pure ShaderMaterials** | 2 | `THREE.ShaderMaterial` | `SpotLightMaterial`, `StarfieldMaterial` |
| **Factory ShaderMaterials** | 12 | `THREE.ShaderMaterial` (via `shaderMaterial()`) | `SplatMaterial`, `GridMaterial`, `OutlinesMaterial` |
| **Object3D subclasses** | 2 | `THREE.Group` | `PositionMesh`, `PositionPoint` |
| **Loaders** | 1 | `THREE.Loader` | `SplatLoader` |

---

## Pattern 1: Material with `onBeforeCompile` Shader Injection

**The most common pattern.** Extends a built-in material and injects custom GLSL via `onBeforeCompile`.

### Structure

```typescript
// src/core/MeshDistortMaterial.tsx

class DistortMaterialImpl extends MeshPhysicalMaterial {
  _time: Uniform<number>
  _distort: Uniform<number>
  _radius: Uniform<number>

  constructor(parameters: MeshPhysicalMaterialParameters = {}) {
    super(parameters)
    this.setValues(parameters)
    this._time = { value: 0 }
    this._distort = { value: 0.4 }
    this._radius = { value: 1 }
  }

  onBeforeCompile(shader) {
    // 1. Bind uniforms to shader
    shader.uniforms.time = this._time
    shader.uniforms.radius = this._radius
    shader.uniforms.distort = this._distort

    // 2. Prepend uniform declarations + imported GLSL
    shader.vertexShader = `
      uniform float time;
      uniform float radius;
      uniform float distort;
      ${importedGLSL}
      ${shader.vertexShader}
    `

    // 3. Replace shader chunks with custom logic
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position * (noise * pow(distort, 2.0) + radius));`
    )
  }

  // 4. Getter/setter pairs expose uniforms as plain properties
  get time() { return this._time.value }
  set time(v) { this._time.value = v }

  get distort() { return this._distort.value }
  set distort(v) { this._distort.value = v }
}
```

### React Component Wrapper

Every material class gets wrapped in a React component using `<primitive>`:

```typescript
// src/core/MeshDistortMaterial.tsx (line 88)

export const MeshDistortMaterial: ForwardRefComponent<MeshDistortMaterialProps, DistortMaterialImpl> =
  React.forwardRef(({ speed = 1, ...props }, ref) => {
    const [material] = React.useState(() => new DistortMaterialImpl())
    useFrame((state) => material && (material.time = state.clock.elapsedTime * speed))
    return <primitive object={material} ref={ref} attach="material" {...props} />
  })
```

### Key Rules

1. **Private `Uniform<T>` objects** (`{ value: T }`) are initialized in the constructor. These are passed to `shader.uniforms` by reference in `onBeforeCompile`.

2. **`onBeforeCompile` does three things**: binds uniforms to the shader, prepends `uniform` declarations, and replaces `#include <chunk_name>` blocks with custom GLSL.

3. **Getter/setter pairs** expose each uniform as a flat property. This is **critical for R3F interop** -- it lets the reconciler set values via JSX props like `<distortMaterialImpl time={1.5} />`.

4. **Call `this.setValues(parameters)`** in the constructor to apply standard material parameters.

5. **Version-aware shader includes**: Use `version` from `src/helpers/constants.ts` to handle Three.js API changes:
   ```typescript
   const opaque_fragment = version >= 154 ? 'opaque_fragment' : 'output_fragment'
   // r154 renamed output_fragment -> opaque_fragment
   // r154 renamed encodings_fragment -> colorspace_fragment
   ```

### Files Using This Pattern

| File | Class | Extends | React Wrapper |
|------|-------|---------|---------------|
| `src/core/MeshDistortMaterial.tsx` | `DistortMaterialImpl` | `MeshPhysicalMaterial` | `MeshDistortMaterial` via `<primitive>` |
| `src/core/MeshWobbleMaterial.tsx` | `WobbleMaterialImpl` | `MeshStandardMaterial` | `MeshWobbleMaterial` via `<primitive>` |
| `src/core/MeshTransmissionMaterial.tsx` | `MeshTransmissionMaterialImpl` | `MeshPhysicalMaterial` | `MeshTransmissionMaterial` via `extend()` + JSX element |
| `src/materials/MeshReflectorMaterial.tsx` | `MeshReflectorMaterial` | `MeshStandardMaterial` | wrapped via `extend()` in `src/core/Reflector.tsx` |
| `src/core/PointMaterial.tsx` | `PointMaterialImpl` | `PointsMaterial` | `PointMaterial` via `<primitive>` |

---

## Pattern 2: Pure `ShaderMaterial` Extension

For fully custom shaders, extend `THREE.ShaderMaterial` directly with vertex/fragment shaders in the constructor.

### Structure

```typescript
// src/core/Stars.tsx (line 19)

class StarfieldMaterial extends ShaderMaterial {
  constructor() {
    super({
      uniforms: { time: { value: 0.0 }, fade: { value: 1.0 } },
      vertexShader: /* glsl */ `
        uniform float time;
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
          gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: /* glsl */ `
        uniform float fade;
        varying vec3 vColor;
        void main() {
          float opacity = 1.0;
          if (fade == 1.0) {
            float d = distance(gl_PointCoord, vec2(0.5, 0.5));
            opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
          }
          gl_FragColor = vec4(vColor, opacity);
          #include <tonemapping_fragment>
          #include <${version >= 154 ? 'colorspace_fragment' : 'encodings_fragment'}>
        }`,
    })
  }
}
```

### React Wrapper for Stars

```typescript
// src/core/Stars.tsx (line 64)
export const Stars: ForwardRefComponent<Props, Points> = React.forwardRef(
  ({ radius = 100, depth = 50, count = 5000, ... }: Props, ref) => {
    const [starfieldMaterial] = React.useState(() => new StarfieldMaterial())
    // ...
    return (
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[position, 3]} />
          <bufferAttribute attach="attributes-color" args={[color, 3]} />
          <bufferAttribute attach="attributes-size" args={[size, 1]} />
        </bufferGeometry>
        <primitive ref={material} object={starfieldMaterial} attach="material"
          blending={AdditiveBlending} uniforms-fade-value={fade}
          depthWrite={false} transparent vertexColors />
      </points>
    )
  }
)
```

Note the deep property access: `uniforms-fade-value={fade}` sets `material.uniforms.fade.value` via R3F's dash-notation.

Also used in `src/materials/SpotLightMaterial.tsx` and `src/core/Sparkles.tsx`.

---

## Pattern 3: The `shaderMaterial` Factory

A helper that dynamically creates a `ShaderMaterial` subclass with auto-generated getter/setter pairs.

### Source: `src/core/shaderMaterial.tsx`

```typescript
export function shaderMaterial<U extends Uniforms, M extends THREE.ShaderMaterial & U>(
  uniforms: U,
  vertexShader: string,
  fragmentShader: string,
  onInit?: (material?: M) => void
) {
  return class extends THREE.ShaderMaterial {
    static key = THREE.MathUtils.generateUUID()

    constructor(parameters?: THREE.ShaderMaterialParameters) {
      super({ vertexShader, fragmentShader, ...parameters })

      for (const key in uniforms) {
        this.uniforms[key] = new THREE.Uniform(uniforms[key])
        Object.defineProperty(this, key, {
          get() { return this.uniforms[key].value },
          set(value) { this.uniforms[key].value = value },
        })
      }
      this.uniforms = THREE.UniformsUtils.clone(this.uniforms)
      onInit?.(this as unknown as M)
    }
  }
}
```

### Usage (12 instances in the codebase)

```typescript
// src/core/AccumulativeShadows.tsx
const SoftShadowMaterial = shaderMaterial(
  { color: new THREE.Color(), blend: 2.0, map: null, opacity: 1, alphaTest: 0 },
  vertexShader,
  fragmentShader
)

// Register with R3F, then use in JSX
extend({ SoftShadowMaterial })
<softShadowMaterial color={color} blend={2.0} map={texture} />
```

### Factory-Created Materials in drei

| File | Material | Used In |
|------|----------|---------|
| `src/core/AccumulativeShadows.tsx` | `SoftShadowMaterial` | AccumulativeShadows |
| `src/core/Splat.tsx` | `SplatMaterial` | Splat |
| `src/core/Grid.tsx` | `GridMaterial` | Grid |
| `src/core/MeshPortalMaterial.tsx` | `PortalMaterialImpl` | MeshPortalMaterial |
| `src/core/Sparkles.tsx` | `SparklesImplMaterial` | Sparkles |
| `src/core/Outlines.tsx` | `OutlinesMaterial` | Outlines |
| `src/core/Image.tsx` | `ImageMaterialImpl` | Image |
| `src/core/Caustics.tsx` | `CausticsProjectionMaterial`, `CausticsMaterial` | Caustics |
| `src/materials/DiscardMaterial.tsx` | `DiscardMaterial` | exported directly |
| `src/materials/MeshRefractionMaterial.tsx` | `MeshRefractionMaterial` | exported directly |
| `src/materials/WireframeMaterial.tsx` | `WireframeMaterial` | Wireframe |

### Key Rules

- `static key` (UUID) ensures Three.js caches the compiled shader program correctly.
- Uniforms are cloned per-instance via `THREE.UniformsUtils.clone` to prevent shared state.
- `Object.defineProperty` generates getter/setters automatically, same as the manual pattern.
- The returned class must be registered via `extend()` before use in JSX.

---

## Pattern 4: Group Extensions for Instanced Rendering

Custom `THREE.Group` subclasses are used for virtual instances that need custom raycasting and geometry delegation. **These are always wrapped in React components.**

### `PositionMesh` (for `<Instances>`)

```typescript
// src/core/Instances.tsx (line 49)

export class PositionMesh extends THREE.Group {
  color: THREE.Color
  instance: React.MutableRefObject<THREE.InstancedMesh | undefined>
  instanceKey: React.MutableRefObject<JSX.IntrinsicElements['positionMesh'] | undefined>

  constructor() {
    super()
    this.color = new THREE.Color('white')
    this.instance = { current: undefined }
    this.instanceKey = { current: undefined }
  }

  // Delegate geometry to the parent InstancedMesh
  get geometry() {
    return this.instance.current?.geometry
  }

  // Custom raycast against the parent's geometry at this instance's transform
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const parent = this.instance.current
    if (!parent || !parent.geometry || !parent.material) return
    // ... compute instance world matrix, raycast against single-instance mesh
  }
}
```

### React Wrapper for `PositionMesh`

```typescript
// src/core/Instances.tsx (line 103)

export const Instance = React.forwardRef(({ context, children, ...props }: InstanceProps, ref) => {
  // Register the custom element with R3F
  React.useMemo(() => extend({ PositionMesh }), [])

  const group = React.useRef<JSX.IntrinsicElements['positionMesh']>()
  React.useImperativeHandle(ref, () => group.current, [])

  // Subscribe to parent Instances context
  const { subscribe, getParent } = React.useContext(context || globalContext)
  React.useLayoutEffect(() => subscribe(group), [])

  return (
    <positionMesh instance={getParent()} instanceKey={group} ref={group as any} {...props}>
      {children}
    </positionMesh>
  )
})
```

### `PositionPoint` (for `<Points>`)

```typescript
// src/core/Points.tsx (line 29)

export class PositionPoint extends THREE.Group {
  size: number
  color: THREE.Color
  instance: React.MutableRefObject<THREE.Points | undefined>
  instanceKey: React.MutableRefObject<JSX.IntrinsicElements['positionPoint'] | undefined>

  constructor() {
    super()
    this.size = 0
    this.color = new THREE.Color('white')
    this.instance = { current: undefined }
    this.instanceKey = { current: undefined }
  }

  get geometry() { return this.instance.current?.geometry }

  raycast(raycaster, intersects) {
    // Sphere-based intersection test for individual point instances
    // Uses raycaster.params.Points.threshold for hit testing
  }
}
```

### React Wrapper for `PositionPoint`

The `Point` component wraps `PositionPoint` via `extend()` + JSX element, following the same context-subscription pattern as `Instance`.

### Key Rules for Group Subclasses

1. **Always wrapped in a React component** -- the class is never used directly by consumers.
2. **Registered via `extend()`** wrapped in `useMemo` to run once.
3. **Property delegation** (`get geometry()`) lets the virtual instance appear to have geometry without owning it.
4. **Custom `raycast()`** enables per-instance events on batched geometry (InstancedMesh, Points).
5. **Context subscription** -- the React wrapper subscribes to a parent context on mount and unsubscribes on unmount.
6. **Ref forwarding** via `useImperativeHandle` exposes the underlying Group instance.

> **Note:** The `createInstances()` factory function exists on the master branch but is not present on v10.

---

## Pattern 5: Loader Extension

```typescript
// src/core/Splat.tsx (line 245)

class SplatLoader extends THREE.Loader {
  gl: THREE.WebGLRenderer = null!
  chunkSize: number = 25000

  load(url, onLoad, onProgress?, onError?) {
    // Creates a Web Worker for background .splat file parsing
    // Manages texture streaming and chunked GPU upload
  }
}
```

### React Wrapper for SplatLoader

```typescript
// src/core/Splat.tsx (line 624)

export function Splat({ src, chunkSize = 25000, ...props }: SplatProps) {
  extend({ SplatMaterial })
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  // useLoader integrates the custom loader into R3F's suspense system
  const shared = useLoader(SplatLoader as unknown as LoaderProto<unknown>, src, (loader) => {
    loader.gl = gl
    loader.chunkSize = chunkSize
  })

  React.useLayoutEffect(() => shared.connect(ref.current), [src])
  useFrame(() => shared.update(ref.current, camera, alphaHash))

  return (
    <mesh ref={ref} frustumCulled={false} {...props}>
      <splatMaterial key={...} centerAndScaleTexture={shared.centerAndScaleTexture} ... />
    </mesh>
  )
}
```

The loader is wrapped via `useLoader()` with a configuration callback, not used directly.

---

## Registering Custom Classes with R3F (v10)

On v10, drei uses **global JSX namespace augmentation** (not `declare module '@react-three/fiber'`):

```typescript
// v10 pattern (global JSX)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      positionMesh: ReactThreeFiber.Object3DNode<PositionMesh, typeof PositionMesh>
      starfieldMaterial: ReactThreeFiber.MaterialNode<StarfieldMaterial, []>
      pointMaterialImpl: JSX.IntrinsicElements['pointsMaterial']
    }
  }
}

// Register the class
extend({ PositionMesh })

// Use in JSX (camelCase of class name)
<positionMesh instance={parent} ref={ref} {...props} />
```

This differs from the master branch which uses `declare module '@react-three/fiber' { interface ThreeElements { ... } }`.

---

## Version Compatibility

drei v10 uses runtime version detection for Three.js API changes:

```typescript
// src/helpers/constants.ts
import { REVISION } from 'three'
export const version = parseInt(REVISION.replace(/\D+/g, ''))
```

Used in shaders for conditional includes:

```typescript
// r154: output_fragment -> opaque_fragment
const opaque_fragment = version >= 154 ? 'opaque_fragment' : 'output_fragment'

// r154: encodings_fragment -> colorspace_fragment
`#include <${version >= 154 ? 'colorspace_fragment' : 'encodings_fragment'}>`

// r155: light intensity units changed
intensity: version >= 155 ? Math.PI : 1
```

And in `src/helpers/deprecated.ts` for buffer attribute API changes:

```typescript
// r159: updateRange -> updateRanges[0]
export const setUpdateRange = (attribute, updateRange) => {
  if ('updateRanges' in attribute) {
    attribute.updateRanges[0] = updateRange
  } else {
    attribute.updateRange = updateRange
  }
}
```

---

## Summary: How Non-Material Classes are Wrapped

| Class | Extends | React Wrapper | Wrapping Method |
|-------|---------|---------------|-----------------|
| `PositionMesh` | `THREE.Group` | `Instance` | `extend()` + `<positionMesh>` JSX element + context subscription |
| `PositionPoint` | `THREE.Group` | `Point` | `extend()` + `<positionPoint>` JSX element + context subscription |
| `SplatLoader` | `THREE.Loader` | `Splat` | `useLoader()` with config callback |

**Every custom Three.js class in drei is wrapped in a React component.** Consumers never instantiate the classes directly. The wrapping pattern depends on the class type:

- **Materials**: `useState(() => new Material())` + `<primitive object={material} attach="material" />`
- **Group subclasses**: `extend({ Class })` + `<className>` JSX element
- **Loaders**: `useLoader(LoaderClass, url, configCallback)`
