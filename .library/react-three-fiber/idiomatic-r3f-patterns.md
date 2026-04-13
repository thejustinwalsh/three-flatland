# Idiomatic React Three Fiber Patterns (v10 / Three.js r183)

Patterns consistently used across 115+ components in the drei v10 codebase. These represent battle-tested idioms for building R3F components and hooks.

> **Note:** v10 targets R3F v8+ with Three.js r183. All shader code is GLSL-based. No TSL/WebGPU node material patterns are present yet.

---

## 1. Component Signature: `ForwardRefComponent<Props, Ref>`

Every drei component follows this exact structure:

```typescript
// src/core/Float.tsx

import { ForwardRefComponent } from '../helpers/ts-utils'

export type FloatProps = Omit<ThreeElements['group'], 'ref'> & {
  speed?: number
  floatIntensity?: number
  children?: React.ReactNode
}

export const Float: ForwardRefComponent<FloatProps, THREE.Group> =
  /* @__PURE__ */ React.forwardRef<THREE.Group, FloatProps>(
    ({ children, speed = 1, floatIntensity = 1, ...props }, forwardRef) => {
      const ref = React.useRef<THREE.Group>(null!)
      React.useImperativeHandle(forwardRef, () => ref.current, [])
      // ...
      return (
        <group {...props}>
          <group ref={ref}>{children}</group>
        </group>
      )
    }
  )
```

### Rules

- **Always use `React.forwardRef`** -- every component exposes its underlying Three.js object via ref.
- **Type with `ForwardRefComponent<P, T>`** (from `src/helpers/ts-utils.tsx`) -- produces cleaner declaration output than raw `React.forwardRef` types.
- **`/* @__PURE__ */` annotation** on `React.forwardRef` enables tree-shaking.
- **Destructure known props, spread the rest** to the root element for passthrough of `position`, `rotation`, `scale`, etc.

---

## 2. Ref Forwarding: Internal Ref + `useImperativeHandle`

The dominant ref pattern separates the internal ref from the forwarded ref:

```typescript
const ref = React.useRef<THREE.Group>(null!)
React.useImperativeHandle(forwardRef, () => ref.current, [])
```

Three variations:

### Variation A: Direct Object Exposure (most common)

```typescript
// src/core/Float.tsx, Center.tsx, Edges.tsx, etc.
React.useImperativeHandle(fRef, () => ref.current, [])
```

### Variation B: Custom API Exposure

```typescript
// src/core/AccumulativeShadows.tsx
React.useImperativeHandle(forwardRef, () => api, [api])
// where api = { getMesh(), reset(), update(), ... }
```

### Variation C: Derived Value Exposure

```typescript
// src/core/RenderTexture.tsx
React.useImperativeHandle(forwardRef, () => fbo.texture, [fbo])
```

### Variation D: Direct `<primitive ref={ref}>`

```typescript
// src/core/OrbitControls.tsx
return <primitive ref={ref} object={controls} {...restProps} />
```

Used when there's no need for an internal ref -- the forwarded ref goes straight to the primitive.

---

## 3. `useThree` Selector Pattern

Individual selectors are the dominant pattern:

```typescript
// src/core/OrbitControls.tsx

const invalidate = useThree((state) => state.invalidate)
const defaultCamera = useThree((state) => state.camera)
const gl = useThree((state) => state.gl)
const events = useThree((state) => state.events)
const set = useThree((state) => state.set)
const get = useThree((state) => state.get)
const performance = useThree((state) => state.performance)
```

Each selector creates an independent subscription, so the component only re-renders when that specific value changes. This is a performance-critical pattern.

Destructuring is occasionally used for simpler components where re-render cost is low:

```typescript
// src/core/Bounds.tsx
const { camera, size, invalidate } = useThree()
```

---

## 4. `useFrame` for Per-Frame Updates

```typescript
// src/core/Float.tsx
useFrame((state) => {
  const t = offset.current + state.clock.elapsedTime
  ref.current.rotation.x = (Math.cos((t / 4) * speed) / 8) * rotationIntensity
  ref.current.position.y = yPosition * floatIntensity
  ref.current.updateMatrix()
})
```

### Rules

- **Mutate refs directly** inside `useFrame` -- never call `setState` in the render loop.
- **Use priority parameter** for ordering: `useFrame(callback, -1)` runs before default (used for controls).
- **Access `state.clock.elapsedTime`** for time-based animations (not `Date.now()`).
- **Frame counting** for limited renders:

```typescript
// src/core/Instances.tsx
let iterations = 0
useFrame(() => {
  if (frames === Infinity || iterations < frames) {
    // ... update logic
    iterations++
  }
})
```

- **Render priority** for custom render passes:

```typescript
// src/core/Effects.tsx
useFrame(() => {
  if (!disableRender) composer.current?.render()
}, renderIndex)
```

---

## 5. Object Instantiation: `useState` vs `useMemo`

### `useState` initializer for stable objects (no deps)

```typescript
// src/core/MeshDistortMaterial.tsx
const [material] = React.useState(() => new DistortMaterialImpl())

// src/core/Center.tsx
const [box3] = React.useState(() => new Box3())
const [center] = React.useState(() => new Vector3())

// src/core/AccumulativeShadows.tsx
const [plm] = React.useState(() => new ProgressiveLightMap(gl, scene, resolution))
```

### `useMemo` for objects derived from props

```typescript
// src/core/OrbitControls.tsx
const controls = React.useMemo(() => new OrbitControlsImpl(explCamera), [explCamera])

// src/core/Line.tsx
const line2 = React.useMemo(() => (segments ? new LineSegments2() : new Line2()), [segments])
```

### When to Use Which

- **`useState` initializer**: Object is stable for the component's lifetime (no dependencies). Guarantees exactly one creation even in StrictMode.
- **`useMemo`**: Object depends on props and must be recreated when those props change.

---

## 6. `<primitive>` for Imperative Three.js Objects

The `<primitive>` element bridges imperative Three.js objects into the declarative R3F tree:

```typescript
// Attach a pre-built control to the scene graph
<primitive ref={ref} object={controls} enableDamping={enableDamping} {...restProps} />

// Attach geometry and material to a parent
<primitive object={line2} ref={ref}>
  <primitive object={lineGeom} attach="geometry" />
  <primitive object={lineMaterial} attach="material" color={color} {...rest} />
</primitive>

// Attach a material to its parent mesh
<primitive object={material} ref={ref} attach="material" {...props} />
```

### The `attach` Prop

- `attach="material"` -- attaches to `parent.material`
- `attach="geometry"` -- attaches to `parent.geometry`
- Dash notation for deep paths: `attach="attributes-position"` sets `parent.attributes.position`
- Dash notation for uniforms: `uniforms-fade-value={fade}` sets `parent.uniforms.fade.value`

---

## 7. `extend()` for Custom JSX Elements

Register custom Three.js classes with R3F's reconciler:

```typescript
// Run once via useMemo
React.useMemo(() => extend({ PositionMesh }), [])

// Or at module scope for materials
extend({ MeshReflectorMaterial })
extend({ SoftShadowMaterial })
```

### Type Declaration (v10 pattern: global JSX namespace)

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

The JSX tag is the camelCase version of the class name. v10 uses `declare global { namespace JSX }` throughout (24 files).

---

## 8. Cleanup and Disposal

### useEffect Cleanup for Controls

```typescript
// src/core/OrbitControls.tsx
React.useEffect(() => {
  controls.connect(explDomElement)
  return () => void controls.dispose()
}, [keyEvents, explDomElement, controls])
```

### Geometry and Material Disposal

```typescript
// src/core/Line.tsx
React.useEffect(() => {
  return () => lineGeom.dispose()
}, [lineGeom])
```

### FBO / Render Target Disposal

```typescript
// src/core/useFBO.tsx
React.useEffect(() => {
  return () => target.dispose()
}, [])
```

### Event Listener Cleanup

```typescript
// src/core/OrbitControls.tsx
React.useEffect(() => {
  controls.addEventListener('change', callback)
  controls.addEventListener('start', onStartCb)
  controls.addEventListener('end', onEndCb)
  return () => {
    controls.removeEventListener('start', onStartCb)
    controls.removeEventListener('end', onEndCb)
    controls.removeEventListener('change', callback)
  }
}, [onChange, onStart, onEnd, controls])
```

### Rule

Every `useEffect` that creates a Three.js object, connects a control, or adds an event listener **must return a cleanup function**.

---

## 9. The `makeDefault` Pattern

Controls and cameras use this pattern to register themselves in the R3F store:

```typescript
// src/core/OrbitControls.tsx
React.useEffect(() => {
  if (makeDefault) {
    const old = get().controls
    set({ controls })
    return () => set({ controls: old })
  }
}, [makeDefault, controls])

// src/core/PerspectiveCamera.tsx
React.useLayoutEffect(() => {
  if (makeDefault) {
    const oldCam = camera
    set(() => ({ camera: cameraRef.current! }))
    return () => set(() => ({ camera: oldCam }))
  }
}, [cameraRef, makeDefault, set])
```

Saves the previous value and restores it on unmount -- a clean swap pattern.

---

## 10. Context for Parent-Child Communication

### Creating and Providing Context

```typescript
// src/core/Bounds.tsx
const context = React.createContext<BoundsApi>(null!)

// In the parent component
<context.Provider value={api}>{children}</context.Provider>

// Custom hook for consumers
export function useBounds() {
  return React.useContext(context)
}
```

### Dynamic Context Factory (Instances pattern)

```typescript
// src/core/Instances.tsx
const [{ context, instance }] = React.useState(() => {
  const context = React.createContext<Api>(null!)
  return {
    context,
    instance: React.forwardRef((props, ref) => (
      <Instance context={context} {...props} ref={ref} />
    )),
  }
})
```

---

## 11. `useLayoutEffect` for Synchronous Measurement

When you need to measure or modify the scene graph before the browser paints:

```typescript
// src/core/Center.tsx
React.useLayoutEffect(() => {
  outer.current.matrixWorld.identity()
  box3.setFromObject(object ?? inner.current, precise)
  const width = box3.max.x - box3.min.x
  // ... compute alignment
  outer.current.position.set(/* computed position */)
}, [cacheKey, ...deps])
```

Used for: bounding box measurements, initial positions, geometry setup, `computeLineDistances()`, material `defines` updates.

---

## 12. Portal Rendering

Use `createPortal` from R3F to render into a separate scene or render target:

```typescript
// src/core/RenderTexture.tsx
return createPortal(
  <Container renderPriority={renderPriority} frames={frames} fbo={fbo}>
    {children}
    <group onPointerOver={() => null} />
  </Container>,
  vScene,
  { events: { compute: compute || uvCompute, priority: eventPriority } }
)
```

The `events.compute` option maps UV coordinates for raycasting into the portal.

---

## 13. `applyProps` for Dynamic Property Application

```typescript
// src/core/Environment.tsx
import { applyProps } from '@react-three/fiber'

applyProps(target as any, sceneProps)     // Apply new values
return () => applyProps(target as any, oldSceneProps)  // Restore on unmount

// src/core/Decal.tsx
applyProps(state as any, { position, scale })
applyProps(state as any, { rotation })
```

Use `applyProps` when you need to batch-apply props to a Three.js object imperatively, outside the JSX reconciliation cycle.

---

## 14. Props Typing Patterns

### v10 Pattern: `JSX.IntrinsicElements` + intersection

```typescript
// src/core/Bounds.tsx
export type BoundsProps = JSX.IntrinsicElements['group'] & {
  maxDuration?: number
  margin?: number
  observe?: boolean
}

// src/core/MeshDistortMaterial.tsx
export type MeshDistortMaterialProps = JSX.IntrinsicElements['meshPhysicalMaterial'] & {
  speed?: number
  factor?: number
}
```

### Overwrite pattern for controls

```typescript
// src/core/OrbitControls.tsx
export type OrbitControlsProps = Omit<
  ReactThreeFiber.Overwrite<
    ReactThreeFiber.Object3DNode<OrbitControlsImpl, typeof OrbitControlsImpl>,
    { camera?: Camera; domElement?: HTMLElement; makeDefault?: boolean; ... }
  >,
  'ref'
>
```

### Rules

- Always `Omit<..., 'ref'>` since `forwardRef` provides its own ref type.
- Omit `'args'` when the component manages construction internally.
- Use `Overwrite` to replace inherited prop types with more specific ones.

---

## 15. Event Handling: Multiple Listeners in Single Effect

```typescript
// src/core/OrbitControls.tsx
React.useEffect(() => {
  const callback = (e: OrbitControlsChangeEvent) => {
    invalidate()
    if (regress) performance.regress()
    if (onChange) onChange(e)
  }
  const onStartCb = (e: Event) => { if (onStart) onStart(e) }
  const onEndCb = (e: Event) => { if (onEnd) onEnd(e) }

  controls.addEventListener('change', callback)
  controls.addEventListener('start', onStartCb)
  controls.addEventListener('end', onEndCb)

  return () => {
    controls.removeEventListener('start', onStartCb)
    controls.removeEventListener('end', onEndCb)
    controls.removeEventListener('change', callback)
  }
}, [onChange, onStart, onEnd, controls, invalidate, setEvents])
```

Group related listeners into a single `useEffect` with a combined cleanup.

---

## Summary: The Idiomatic drei v10 Component

```typescript
import * as React from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ForwardRefComponent } from '../helpers/ts-utils'

export type MyComponentProps = JSX.IntrinsicElements['group'] & {
  speed?: number
  children?: React.ReactNode
}

export const MyComponent: ForwardRefComponent<MyComponentProps, THREE.Group> =
  /* @__PURE__ */ React.forwardRef<THREE.Group, MyComponentProps>(
    ({ children, speed = 1, ...props }, forwardRef) => {
      // 1. Internal ref + imperative handle
      const ref = React.useRef<THREE.Group>(null!)
      React.useImperativeHandle(forwardRef, () => ref.current, [])

      // 2. Individual useThree selectors
      const invalidate = useThree((state) => state.invalidate)

      // 3. Stable object creation
      const [helper] = React.useState(() => new THREE.Vector3())

      // 4. Per-frame mutation via refs (never setState)
      useFrame((state) => {
        ref.current.rotation.y = state.clock.elapsedTime * speed
      })

      // 5. Cleanup on unmount
      React.useEffect(() => {
        return () => { /* dispose resources */ }
      }, [])

      // 6. Spread rest props to root element
      return (
        <group {...props}>
          <group ref={ref}>{children}</group>
        </group>
      )
    }
  )
```
