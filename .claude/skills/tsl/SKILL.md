---
name: tsl
description: Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with three/tsl imports, or debugging shader node graphs
---

# TSL (Three.js Shading Language)

## Overview

TSL is TypeScript/JavaScript that builds GPU shader node graphs. The critical mental model: code executes at **two times** — TS/JS runs at **build time** to construct the node graph, then compiled WGSL executes on the GPU at **run time**.

```ts
// BUILD TIME: TypeScript conditional (runs once when shader compiles)
if (material.transparent) { return transparent_shader }

// RUN TIME: TSL conditional (runs every pixel/vertex on GPU)
If(value.greaterThan(0.5), () => { result.assign(1.0) })
```

## When to Use

- Writing custom shaders with `three/tsl` node functions
- Creating or customizing `NodeMaterial` types (MeshStandardNodeMaterial, etc.)
- Migrating GLSL shaders to TSL
- Writing compute shaders with storage buffers
- Debugging "If is not defined", assignment errors, or type mismatches in TSL code

**When NOT to use:** Legacy WebGL/GLSL codebases not targeting WebGPU.

## Deprecated API (r181+)

| DO NOT USE | USE INSTEAD |
|------------|-------------|
| `timerGlobal` / `timerLocal` | `time` |
| `timerDelta` | `deltaTime` |
| `import from 'three/nodes'` | `import from 'three/tsl'` |
| `import * as THREE from 'three'` | `import * as THREE from 'three/webgpu'` |
| `oscSine(timerGlobal)` | `oscSine(time)` or `oscSine()` |

## Imports

```ts
// Runtime imports
import * as THREE from 'three/webgpu'
import { Fn, vec3, float, uniform, attribute, If, Discard } from 'three/tsl'

// Type imports — use `type` keyword, import from source paths
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import type PassNode from 'three/src/nodes/display/PassNode.js'
```

**CRITICAL:** Always `await renderer.init()` before first render or compute.

## Core Type System

All TSL nodes are typed via the generic `Node<TNodeType>` where `TNodeType` is a string literal:

```ts
Node<'float'>  Node<'vec2'>  Node<'vec3'>  Node<'vec4'>  Node<'color'>
Node<'int'>    Node<'uint'>  Node<'bool'>
Node<'mat2'>   Node<'mat3'>  Node<'mat4'>
```

### Type Constructors — Return Types

| Call | Returns |
|------|---------|
| `float(1.0)` | `ConstNode<'float', number>` |
| `float(someNode)` | `Node<'float'>` |
| `vec2(1, 2)` | `ConstNode<'vec2', Vector2>` |
| `vec3(node, node, node)` | `Node<'vec3'>` |
| `vec4(1, 2, 3, 4)` | `ConstNode<'vec4', Vector4>` |

Literal values produce `ConstNode`, node inputs produce `Node`. Both extend `Node<T>`.

### Input Type Unions

Define flexible function parameters that accept either JS literals or TSL nodes:

```ts
import type Node from 'three/src/nodes/core/Node.js'

type FloatInput = number | Node<'float'>
type Vec2Input = [number, number] | Node<'vec2'>
type Vec3Input = [number, number, number] | Node<'vec3'>
type Vec4Input = [number, number, number, number] | Node<'vec4'>
type ColorInput = number | [number, number, number] | Node<'color'> | Node<'vec3'>
```

Use runtime dispatch to coerce literals into nodes:

```ts
function tint(
  inputColor: Node<'vec4'>,
  tintColor: Vec3Input,
  strength: FloatInput = 1,
): Node<'vec4'> {
  const tintVec = Array.isArray(tintColor) ? vec3(...tintColor) : tintColor
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  const tintedRGB = inputColor.rgb.mul(tintVec)
  const mixedRGB = mix(inputColor.rgb, tintedRGB, strengthNode)
  return vec4(mixedRGB, inputColor.a)
}
```

## Variables — Immutable by Default

```ts
// WRONG: Cannot modify immutable node
const pos = positionLocal
pos.y = pos.y.add(1)  // ERROR

// CORRECT: Use .toVar() for mutable variable
const pos = positionLocal.toVar()
pos.y.assign(pos.y.add(1))  // OK
```

## Uniforms

`uniform()` infers both its TSL type and JS value type from the argument:

```ts
// Type: UniformNode<'float', number>
const speed = uniform(1.0)

// Type: UniformNode<'color', Color>
const tint = uniform(new Color(0xff0000))

// Type: UniformNode<'vec2', Vector2>
const offset = uniform(new Vector2(0, 0))
```

Annotate fields explicitly when storing uniforms:

```ts
import type UniformNode from 'three/src/nodes/core/UniformNode.js'

class MyUniforms {
  readonly timeNode: UniformNode<'float', number>
  readonly tintNode: UniformNode<'color', Color>
  readonly sizeNode: UniformNode<'vec2', Vector2>

  constructor() {
    this.timeNode = uniform(0)
    this.tintNode = uniform(new Color(1, 1, 1))
    this.sizeNode = uniform(new Vector2(1, 1))
  }
}
```

Update from JS via `.value` (NOT reassignment):

```ts
// WRONG
speed = 2.0

// CORRECT
speed.value = 2.0
```

## Fn() Functions

`Fn()` has overloaded generics — return types are inferred from the body:

```ts
// No parameters — infers return type
const wave = Fn(() => {
  const p = positionLocal.toVar()
  p.y.addAssign(sin(p.x.mul(5).add(time)).mul(0.2))
  return p
})

// Array parameters — destructured tuple
const myFn = Fn(([a, b, c]) => {
  return a.add(b).mul(c)
})

// Object parameters with defaults
const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => {
  return color.mul(intensity)
})

// Build context access (second param)
const myFn = Fn(([input], { material }) => {
  if (material.transparent) { return input.mul(0.5) }  // JS = build time
  return input
})
```

**Immediate invocation:** Call `()` on the result to get a node for assignment:

```ts
material.colorNode = Fn(() => {
  // ...
  return color
})()  // <-- () invokes the Fn, producing the node
```

**Type cast for material assignment:** When TSL can't infer the exact union type:

```ts
this.colorNode = Fn(() => {
  let color: Node<'vec4'> = buildBaseColor()
  // ... effect chain ...
  return color
})() as typeof this.colorNode
```

## Attributes

Explicit type parameter required for `@types/three >= 0.183`:

```ts
// Type param matches the attribute type
const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
const instanceColor = attribute<'vec4'>('instanceColor', 'vec4')
const instanceFlip = attribute<'vec2'>('instanceFlip', 'vec2')
```

## Conditionals — Capital I

```ts
// WRONG: lowercase 'if' is JavaScript
if(condition, () => {})

// CORRECT: TSL If (inside Fn())
If(a.greaterThan(b), () => {
  result.assign(a)
}).Else(() => {
  result.assign(b)
})

// Preferred: select() works outside Fn()
const result = select(condition, valueIfTrue, valueIfFalse)

// Branchless (best performance)
mix(valueA, valueB, step(threshold, selector))
```

## Common Error Patterns

| Error | Wrong | Correct |
|-------|-------|---------|
| "If is not defined" | `if(cond, () => {})` | `If(cond, () => {})` |
| Cannot assign | `v.x = 5` | `v.x.assign(5)` after `.toVar()` |
| Type mismatch | `sqrt(intValue)` | `sqrt(intValue.toFloat())` |
| Uniform not changing | `u = val` | `u.value = val` |
| Compute data not in render | `storage()` in material | `attribute()` to read, `storage()` to write |
| Nothing renders | render before init | `await renderer.init()` first |
| Import not found | `from 'three/nodes'` | `from 'three/tsl'` |
| Attribute type error (@types/three >= 0.183) | `attribute('name', 'vec4')` | `attribute<'vec4'>('name', 'vec4')` |

## Quick Patterns

```ts
// Fresnel
const NdotV = normalize(cameraPosition.sub(positionWorld)).dot(normalWorld).max(0)
const fresnel = pow(float(1).sub(NdotV), 5)

// Wave displacement
const p = positionLocal.toVar()
p.y.addAssign(sin(p.x.mul(5).add(time)).mul(0.2))

// UV scroll
material.colorNode = texture(map, uv().add(vec2(time.mul(0.1), 0)))

// Circular mask (sprites/points)
const dist = length(uv().sub(0.5).mul(2.0))
const circle = smoothstep(float(1.0), float(0.8), dist)

// Packed buffer component access
function getPackedComponent(bufNodes: Node<'vec4'>[], offset: number): Node<'float'> {
  const components = [bufNodes[Math.floor(offset / 4)]!.x, /* .y, .z, .w */] as const
  return components[offset % 4]!
}
```

## Full API Reference

See [reference.md](reference.md) for complete documentation of:
- Type constructors, operators, swizzle
- All math functions, oscillators, blend modes
- Shader inputs (position, normal, camera, screen, time, model)
- NodeMaterial types and properties
- Compute shader patterns and storage buffers
- UV utilities, varyings, textures, arrays
- GLSL-to-TSL migration table

<!-- Source: https://threejsroadmap.com/blog/getting-ai-to-write-tsl-that-works -->
