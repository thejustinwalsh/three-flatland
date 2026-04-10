---
name: tsl
description: Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with three/tsl imports, or debugging shader node graphs
---

# TSL (Three.js Shading Language)

**TSL is the CURRENT Three.js shader system (r150+). It replaces GLSL shaders, `onBeforeCompile`, and `ShaderMaterial` with raw GLSL strings. All modern Three.js shader work uses TSL.**

## STOP — Read Before Writing Any Shader Code

Your training data contains 10+ years of GLSL, `ShaderMaterial`, and `onBeforeCompile` patterns. **None of those apply here.** TSL is a fundamentally different paradigm:

- **No GLSL strings.** No `vertexShader:`, no `fragmentShader:`, no `#include`, no `#define`.
- **No `ShaderMaterial`.** Use `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`, etc.
- **No `onBeforeCompile`.** Node materials have `.colorNode`, `.positionNode`, etc.
- **No `WebGLRenderer`.** TSL targets `WebGPURenderer` via `three/webgpu`.
- **No `three/nodes`.** That import path is deprecated. Use `three/tsl`.

If you find yourself writing GLSL syntax, raw shader strings, or reaching for `ShaderMaterial` — **stop and use TSL instead.**

## What TSL Actually Is

TSL is TypeScript/JavaScript that builds GPU shader **node graphs**. Code executes at **two distinct times**:

- **Build time**: Your TypeScript runs once, constructing a node graph
- **Run time**: The compiled WGSL executes per-pixel/vertex on the GPU every frame

```ts
// BUILD TIME: TypeScript conditional — runs once when shader compiles
if (material.transparent) { return transparent_shader }

// RUN TIME: TSL conditional — runs every pixel/vertex on GPU
If(value.greaterThan(0.5), () => { result.assign(1.0) })
```

This is the single most important concept. TypeScript `if` = build time. TSL `If` = run time on GPU. Mixing these up is the #1 source of bugs.

## Imports — Current API

```ts
// Runtime imports — ALWAYS from 'three/webgpu' and 'three/tsl'
import * as THREE from 'three/webgpu'
import { Fn, vec3, float, uniform, attribute, If, Discard, mix, select } from 'three/tsl'

// Type imports — use `type` keyword, import from source paths
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
```

### WRONG Import Patterns

These are outdated. Do NOT use them:

```ts
// WRONG — old import path, removed
import { vec3 } from 'three/nodes'
// CORRECT
import { vec3 } from 'three/tsl'

// WRONG — WebGL renderer, incompatible with TSL
import * as THREE from 'three'
// CORRECT — WebGPU renderer
import * as THREE from 'three/webgpu'
```

### CDN (ES Modules)

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.webgpu.min.js",
    "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.webgpu.min.js",
    "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.tsl.min.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/"
  }
}
</script>
```

## Renderer Initialization

**CRITICAL: Always `await renderer.init()` before the first render or compute call.** Skipping this is silent — nothing renders, no error thrown.

```ts
const renderer = new THREE.WebGPURenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// REQUIRED — must await before any rendering
await renderer.init()

// Now safe to render/compute
renderer.render(scene, camera)
```

## Deprecated API (r181+)

| DO NOT USE | USE INSTEAD |
|------------|-------------|
| `timerGlobal` | `time` |
| `timerLocal` | `time` |
| `timerDelta` | `deltaTime` |
| `import from 'three/nodes'` | `import from 'three/tsl'` |
| `import * as THREE from 'three'` | `import * as THREE from 'three/webgpu'` |
| `oscSine(timerGlobal)` | `oscSine(time)` or `oscSine()` |
| `oscSquare(timerGlobal)` | `oscSquare(time)` or `oscSquare()` |
| `oscTriangle(timerGlobal)` | `oscTriangle(time)` or `oscTriangle()` |
| `oscSawtooth(timerGlobal)` | `oscSawtooth(time)` or `oscSawtooth()` |

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

## Variables — TSL Nodes Are Immutable By Default

This is NOT like GLSL where you can reassign variables freely. TSL nodes are immutable. You must explicitly opt into mutability with `.toVar()`.

```ts
// WRONG — this is the GLSL instinct, but TSL nodes are immutable
const pos = positionLocal
pos.y = pos.y.add(1)  // ERROR: Cannot assign to immutable node

// CORRECT — .toVar() creates a mutable GPU variable
const pos = positionLocal.toVar()
pos.y.assign(pos.y.add(1))  // OK: .assign() modifies a mutable variable
```

**Key rule:** If you need to modify a value, call `.toVar()` first, then use `.assign()`, `.addAssign()`, `.subAssign()`, `.mulAssign()`, `.divAssign()`. Never use `=` to mutate node properties.

```ts
const v = expr.toVar()           // mutable variable
const v = expr.toVar('name')     // named mutable variable (useful for debugging)
const c = expr.toConst()         // inline constant (optimization hint)
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

Annotate fields explicitly when storing uniforms as class properties:

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

### Updating Uniforms — `.value`, NOT Reassignment

```ts
// WRONG — reassigns the JS variable, GPU never sees the change
speed = 2.0

// WRONG — same problem
myUniform = newValue

// CORRECT — mutates the uniform's value, GPU sees the update
speed.value = 2.0
```

## Fn() Functions

`Fn()` wraps TSL statements in a closure. Return types are inferred from the body. **This is NOT a regular function — it builds a shader node graph.**

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

// Build context access (second param) — JS conditionals here are BUILD TIME
const myFn = Fn(([input], { material }) => {
  if (material.transparent) { return input.mul(0.5) }  // JS = build time only
  return input
})
```

### Immediate Invocation — `()` After `Fn()`

To assign a Fn result to a material node, you must invoke it:

```ts
material.colorNode = Fn(() => {
  // ...
  return color
})()  // <-- the trailing () invokes the Fn, producing the node graph
```

**Type cast for material assignment** when TSL can't infer the exact union type:

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
// WRONG — missing type parameter, will error in newer @types/three
const instanceUV = attribute('instanceUV', 'vec4')

// CORRECT — explicit type parameter
const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
const instanceColor = attribute<'vec4'>('instanceColor', 'vec4')
const instanceFlip = attribute<'vec2'>('instanceFlip', 'vec2')
```

## Conditionals — Capital `If`, NOT Lowercase `if`

The most common TSL mistake. GLSL uses `if`. JavaScript uses `if`. But TSL's GPU conditional is `If` with a capital I. Lowercase `if` is a JavaScript build-time conditional and will NOT execute on the GPU.

```ts
// WRONG — this is JavaScript, not TSL. It runs once at build time, not per-pixel.
if(condition, () => {})

// CORRECT — TSL If runs on GPU per-pixel/vertex (must be inside Fn())
If(a.greaterThan(b), () => {
  result.assign(a)
}).ElseIf(a.lessThan(c), () => {
  result.assign(c)
}).Else(() => {
  result.assign(b)
})
```

### select() — Preferred Over If For Simple Cases

```ts
// Works outside Fn(), returns a value directly (like ternary)
const result = select(condition, valueIfTrue, valueIfFalse)
```

### Branchless Math — Best Performance

```ts
// Fastest: no GPU branching at all
step(edge, x)           // x < edge ? 0 : 1
mix(a, b, t)            // a*(1-t) + b*t
smoothstep(e0, e1, x)   // smooth 0-1 transition
clamp(x, min, max)      // constrain range
saturate(x)             // clamp(x, 0, 1)

// Pattern: conditional selection without branching
mix(valueA, valueB, step(threshold, selector))
```

## Operators — Method Chains, NOT Symbols

TSL does NOT use `+`, `-`, `*`, `/`, `=` operators. All operations are method calls:

```ts
// WRONG — GLSL/JS instinct
result = a + b * c

// CORRECT — TSL method chaining
const result = a.add(b.mul(c))
```

### Comparison Returns `Node<'bool'>`

```ts
// WRONG — JS comparison
if (a > b) { ... }

// CORRECT — TSL comparison (returns Node<'bool'> for use with If/select)
a.greaterThan(b)     // a > b
a.lessThan(b)        // a < b
a.equal(b)           // a == b
a.greaterThanEqual(b) // a >= b
a.lessThanEqual(b)   // a <= b
```

## Common Error Patterns

**These are the errors you WILL encounter.** Every single one maps to a GLSL/JS habit:

| Error | GLSL/JS Instinct | TSL Correct Way |
|-------|-------------------|-----------------|
| "If is not defined" | `if(cond, () => {})` | `If(cond, () => {})` — capital I |
| Cannot assign to node | `v.x = 5` | `v.x.assign(5)` after `.toVar()` |
| Type mismatch | `sqrt(intValue)` | `sqrt(intValue.toFloat())` |
| Uniform not changing | `u = newVal` | `u.value = newVal` |
| Compute data not visible | Using `storage()` in render | `attribute()` to read, `storage()` to write |
| Nothing renders | Rendering before init | `await renderer.init()` first |
| Import not found | `from 'three/nodes'` | `from 'three/tsl'` |
| Import not found | `from 'three'` | `from 'three/webgpu'` |
| Attribute type error | `attribute('n', 'vec4')` | `attribute<'vec4'>('n', 'vec4')` |
| Node immutability | Direct `=` assignment | `.toVar()` then `.assign()` |
| Loop unrolling | TSL `Loop()` for fixed counts | JS `for` loop (unrolls at build time) |
| Matrix multiply | `matrix * vector` | `matrix.mul(vector)` |

## Build-Time vs. Run-Time Loops

This is the second most important concept after the build-time/run-time distinction. When you need a loop in TSL, you have two choices:

```ts
// BUILD-TIME LOOP (JS for-loop) — unrolls at shader compile time
// Use for: fixed sample counts, pre-computed data, performance-critical paths
const samples = generateSamples(16)
let result: Node<'float'> = float(0)
for (let i = 0; i < samples.length; i++) {
  const dir = vec3(samples[i][0], samples[i][1], samples[i][2])
  result = result.add(computeSample(dir))  // builds 16 separate node operations
}

// RUN-TIME LOOP (TSL Loop()) — compiles to GPU loop instruction
// Use for: dynamic iteration counts, when unrolling would be too large
Loop(count, ({ i }) => {
  // TSL statements here execute on GPU each iteration
})
```

**Rule of thumb:** If the iteration count is known at shader compile time (e.g., sample counts, kernel sizes), use a JS for-loop. The shader compiler will unroll it. If the count comes from a uniform or is very large, use `Loop()`.

Note that reassigning a `let` node variable in a JS loop (like `result = result.add(...)`) is **build-time graph construction**, not GPU mutation. This is correct — you're building a longer node chain, not mutating a GPU variable.

## Matrix Operations

Matrix-vector multiplication uses the same `.mul()` method:

```ts
// mat4 × vec4 multiplication
const viewPos = invProjectionMatrix.mul(clipSpacePos)  // Node<'vec4'>

// Access result components
const xyz = viewPos.xyz           // Node<'vec3'>
const w = viewPos.w               // Node<'float'>

// Perspective divide
const result = viewPos.xyz.div(viewPos.w)  // Node<'vec3'>
```

## Texture Sampling — Two Syntaxes

```ts
// Function syntax (import texture from three/tsl)
import { texture } from 'three/tsl'
const color = texture(myTexture, uv)  // TextureNode<'vec4'>

// Method syntax (on TextureNode instances)
const color = texNode.sample(uv)  // Node<'vec4'>
// Useful when you already have a TextureNode reference
```

Both work. The repo commonly aliases the import: `import { texture as sampleTexture } from 'three/tsl'` to avoid naming conflicts with local variables.

## Quick Patterns

### Fresnel Rim Lighting

```ts
const viewDir = normalize(cameraPosition.sub(positionWorld))
const NdotV = max(dot(normalWorld, viewDir), 0.0)
const fresnel = pow(float(1.0).sub(NdotV), fresnelPower)
const finalColor = mix(baseColor, rimColor, fresnel)
```

### Wave Displacement

```ts
material.positionNode = Fn(() => {
  const p = positionLocal.toVar()  // .toVar() because we modify it
  p.y.addAssign(sin(p.x.mul(5).add(time)).mul(0.2))
  return p
})()
```

### UV Scroll

```ts
material.colorNode = texture(map, uv().add(vec2(time.mul(0.1), 0)))
```

### Circular Mask (for sprites/points)

```ts
const dist = length(uv().sub(0.5).mul(2.0))
const circle = smoothstep(float(1.0), float(0.8), dist)
```

### Alpha Test with Discard

```ts
// Discard must be inside Fn()
material.colorNode = Fn(() => {
  const color = texture(tex, uv())
  If(color.a.lessThan(float(0.01)), () => {
    Discard()
  })
  return color
})()
```

### Gradient Mapping

```ts
const t = smoothstep(float(0.0), float(1.0), inputValue)
const gradient = mix(colorA, colorB, t)
```

### Soft Falloff

```ts
// Exponential (good for glow, attenuation)
const falloff = exp(dist.negate().mul(rate))

// Inverse square
const attenuation = float(1.0).div(dist.mul(dist).add(1.0))
```

### Packed Buffer Component Access

```ts
function getPackedComponent(bufNodes: Node<'vec4'>[], offset: number): Node<'float'> {
  const node = bufNodes[Math.floor(offset / 4)]!
  const components = [node.x, node.y, node.z, node.w] as const
  return components[offset % 4]!
}
```

## Full API Reference

See [reference.md](reference.md) for complete documentation of:
- Type constructors, operators, swizzle, type conversions
- All math functions, oscillators, blend modes
- Shader inputs with types (position, normal, camera, screen, time, model)
- NodeMaterial types and all assignable properties
- Compute shader patterns and storage buffer types
- UV utilities, varyings, textures, arrays
- GLSL-to-TSL migration table

## Summary — TSL Rules to Remember

1. **Import from `'three/tsl'`** and `'three/webgpu'`. Not `'three/nodes'`. Not `'three'`.
2. **`await renderer.init()`** before any render or compute call.
3. **Nodes are immutable.** Use `.toVar()` then `.assign()` to modify values.
4. **Method chains for math.** `.add()`, `.mul()`, `.sub()`, `.div()`. Not `+`, `*`, `-`, `/`.
5. **Capital `If`** for GPU conditionals. Lowercase `if` is JavaScript build-time only.
6. **`uniform.value = x`** to update. Not `uniform = x`.
7. **`Fn(() => { ... })()`** — don't forget the trailing `()` to invoke.
8. **`attribute<'vec4'>(...)`** — explicit type parameter for @types/three >= 0.183.
9. **`storage()` to write, `attribute()` to read** in compute-to-render pipelines.
10. **No GLSL.** No `ShaderMaterial`. No `onBeforeCompile`. No raw shader strings.

<!-- Source: https://threejsroadmap.com/blog/getting-ai-to-write-tsl-that-works -->
