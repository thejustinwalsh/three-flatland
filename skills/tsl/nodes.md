# TSL Nodes Reference

**This is the CURRENT Three.js shader API (r150+).** All shader code uses TSL node functions. Import from `'three/tsl'` and `'three/webgpu'`.

## Imports

```ts
// Runtime imports
import * as THREE from 'three/webgpu'
import {
  Fn, vec2, vec3, vec4, float, int, uint, bool, color,
  uniform, attribute, storage,
  texture, uv, cubeTexture,
  If, Discard, Loop, Break, Continue, Switch,
  select, mix, step, smoothstep, clamp, saturate,
  sin, cos, tan, asin, acos, atan,
  abs, sign, floor, ceil, round, trunc, fract, mod, min, max,
  pow, exp, exp2, log, log2, sqrt, inverseSqrt,
  length, distance, dot, cross, normalize, reflect, refract,
  dFdx, dFdy, fwidth,
  positionLocal, positionWorld, positionView, positionGeometry,
  normalLocal, normalWorld, normalView, normalGeometry,
  cameraPosition, cameraNear, cameraFar,
  screenUV, screenCoordinate, screenSize,
  time, deltaTime, instanceIndex,
  varying, vertexStage,
} from 'three/tsl'

// Type imports — always use `type` keyword, import from source paths
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
```

---

## Type Constructors

| Constructor | Input | Returns |
|-------------|-------|---------|
| `float(x)` | `number` | `ConstNode<'float', number>` |
| `float(x)` | `Node` | `Node<'float'>` |
| `int(x)` | `number` / `Node` | `ConstNode<'int'>` / `Node<'int'>` |
| `uint(x)` | `number` / `Node` | `ConstNode<'uint'>` / `Node<'uint'>` |
| `bool(x)` | `boolean` / `Node` | `ConstNode<'bool'>` / `Node<'bool'>` |
| `vec2(x, y)` | `number`s / `Node`s / `Vector2` | `ConstNode<'vec2', Vector2>` / `Node<'vec2'>` |
| `vec3(x, y, z)` | `number`s / `Node`s / `Vector3` / `Color` | `ConstNode<'vec3', Vector3>` / `Node<'vec3'>` |
| `vec4(x, y, z, w)` | `number`s / `Node`s / `Vector4` | `ConstNode<'vec4', Vector4>` / `Node<'vec4'>` |
| `color(hex)` | `number` | `ConstNode<'color', Color>` |
| `color(r, g, b)` | `number`s | `ConstNode<'color', Color>` |
| `ivec2/3/4` | integers | signed int vector node |
| `uvec2/3/4` | integers | unsigned int vector node |
| `mat2/3/4` | `number`s / `Matrix` | matrix node |

### Type Conversions

```ts
node.toFloat()  node.toInt()  node.toUint()  node.toBool()
node.toVec2()   node.toVec3() node.toVec4()  node.toColor()
```

---

## Operators

### Arithmetic (method chaining)

```ts
a.add(b)      // a + b (supports multiple: a.add(b, c, d))
a.sub(b)      // a - b
a.mul(b)      // a * b
a.div(b)      // a / b
a.mod(b)      // a % b
a.negate()    // -a
```

Operator overloads preserve types: `Node<'vec3'>.add(Node<'vec3'>)` returns `Node<'vec3'>`.

### Assignment (for mutable variables)

```ts
v.assign(x)        // v = x
v.addAssign(x)     // v += x
v.subAssign(x)     // v -= x
v.mulAssign(x)     // v *= x
v.divAssign(x)     // v /= x
```

### Comparison (returns `Node<'bool'>`)

```ts
a.equal(b)           a.notEqual(b)
a.lessThan(b)        a.greaterThan(b)
a.lessThanEqual(b)   a.greaterThanEqual(b)
```

### Logical / Bitwise

```ts
a.and(b)   a.or(b)   a.not()   a.xor(b)
a.bitAnd(b)  a.bitOr(b)  a.bitXor(b)  a.bitNot()
a.shiftLeft(n)  a.shiftRight(n)
```

### Swizzle

```ts
v.x  v.y  v.z  v.w          // single component → Node<'float'>
v.xy  v.xyz  v.xyzw         // multiple → Node<'vec2'> / Node<'vec3'> / Node<'vec4'>
v.zyx  v.bgr                // reorder
// Aliases: xyzw = rgba = stpq
```

### Matrix Operations

```ts
// mat4 × vec4 multiplication
const viewPos = invProjectionMatrix.mul(clipSpacePos)  // Node<'vec4'>

// Perspective divide
const result = vec3(viewPos.x.div(viewPos.w), viewPos.y.div(viewPos.w), viewPos.z.div(viewPos.w))
```

---

## Variables

```ts
const v = expr.toVar()           // mutable variable
const v = expr.toVar('name')     // named mutable variable
const c = expr.toConst()         // inline constant
const p = property('float')      // uninitialized property
```

---

## Uniforms

```ts
// Type inferred from argument:
const u1 = uniform(0.5)                       // UniformNode<'float', number>
const u2 = uniform(new THREE.Color(0xff0000))  // UniformNode<'color', Color>
const u3 = uniform(new THREE.Vector2(0, 0))    // UniformNode<'vec2', Vector2>
const u4 = uniform(new THREE.Vector3(1, 2, 3)) // UniformNode<'vec3', Vector3>
const u5 = uniform(new THREE.Matrix4())        // UniformNode<'mat4', Matrix4>

// Update from JS — .value, NOT reassignment
u1.value = 1.0

// Auto-update callbacks
u1.onFrameUpdate(() => performance.now() / 1000)
u1.onRenderUpdate(({ camera }) => camera.position.y)
u1.onObjectUpdate(({ object }) => object.position.y)
```

---

## Fn() Functions

```ts
// No params — return type inferred
const myFn = Fn(() => { return positionLocal.toVar() })

// Array parameters
const myFn = Fn(([a, b, c]) => { return a.add(b).mul(c) })

// Object parameters with defaults
const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => { return color.mul(intensity) })

// Build context (JS conditionals = build time)
const myFn = Fn(([input], { material }) => {
  if (material.transparent) { return input.mul(0.5) }
  return input
})

// Immediate invocation for material assignment
material.colorNode = Fn(() => { return color })()
```

---

## Attributes

```ts
// Explicit type param required for @types/three >= 0.183
const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
const instanceFlip = attribute<'vec2'>('instanceFlip', 'vec2')
```

---

## Conditionals

```ts
// GPU conditional (capital I, inside Fn())
If(a.greaterThan(b), () => { result.assign(a) })
  .ElseIf(a.lessThan(c), () => { result.assign(c) })
  .Else(() => { result.assign(b) })

// Ternary (works outside Fn())
const result = select(condition, valueIfTrue, valueIfFalse)

// Branchless (best performance)
step(edge, x)  mix(a, b, t)  smoothstep(e0, e1, x)  clamp(x, min, max)  saturate(x)

// Switch
Switch(mode)
  .Case(0, () => { out.assign(red) })
  .Case(1, () => { out.assign(green) })
  .Default(() => { out.assign(white) })
```

---

## Loops

```ts
Loop(count, ({ i }) => { /* i is loop index */ })
Loop({ start: int(0), end: int(10), type: 'int', condition: '<' }, ({ i }) => {})
Loop(10, 5, ({ i, j }) => {})           // nested
Loop({ start: 10 }, ({ i }) => {})       // backward
Loop(value.lessThan(10), () => { ... })  // while-style
Break()   Continue()                      // control
```

**Build-time vs run-time:** JS `for` loop unrolls at compile time (fixed counts). TSL `Loop()` compiles to GPU loop (dynamic counts).

---

## Math Functions

```ts
// All available as: func(x) OR x.func()
abs(x) sign(x) floor(x) ceil(x) round(x) trunc(x) fract(x)
mod(x, y) min(x, y) max(x, y) clamp(x, min, max) saturate(x)
mix(a, b, t) step(edge, x) smoothstep(e0, e1, x)
sin(x) cos(x) tan(x) asin(x) acos(x) atan(y, x)
pow(x, y) exp(x) exp2(x) log(x) log2(x) sqrt(x) inverseSqrt(x)
length(v) distance(a, b) dot(a, b) cross(a, b) normalize(v)
reflect(I, N) refract(I, N, eta) faceforward(N, I, Nref)
dFdx(x) dFdy(x) fwidth(x)  // derivatives (fragment only)

// TSL extras (not in GLSL)
oneMinus(x) negate(x) saturate(x) reciprocal(x) cbrt(x)
lengthSq(x) difference(x, y) equals(x, y)
pow2(x) pow3(x) pow4(x)
```

---

## Oscillators / Blend Modes

```ts
oscSine(t = time)  oscSquare(t = time)  oscTriangle(t = time)  oscSawtooth(t = time)
blendBurn(a, b)  blendDodge(a, b)  blendScreen(a, b)  blendOverlay(a, b)  blendColor(a, b)
```

---

## Textures

```ts
// Function syntax
texture(tex)             // sample at default UV → TextureNode<'vec4'>
texture(tex, uv)         // sample at UV
texture(tex, uv, level)  // sample with LOD
cubeTexture(tex, dir)    // cubemap

// Method syntax (on TextureNode instances — critical for PostProcessing)
texNode.sample(uv)       // sample at any UV → Node<'vec4'>
```

---

## UV Utilities

```ts
uv()  uv(index)
rotateUV(uv, rotation, center = vec2(0.5))
spherizeUV(uv, strength, center = vec2(0.5))
spritesheetUV(count, uv = uv(), frame = 0)
remap(node, inLow, inHigh, outLow = 0, outHigh = 1)
remapClamp(node, inLow, inHigh, outLow = 0, outHigh = 1)
```

---

## Varyings

```ts
const v = varying(expression, 'name')   // vertex → fragment interpolation
const v = vertexStage(expression)       // force vertex computation
```

---

## Shader Inputs

### Position
```ts
positionGeometry  positionLocal  positionWorld  positionView
positionWorldDirection  positionViewDirection
```

### Normal
```ts
normalGeometry  normalLocal  normalView  normalWorld
```

### Camera
```ts
cameraPosition  cameraNear  cameraFar
cameraViewMatrix  cameraProjectionMatrix  cameraNormalMatrix
```

### Screen
```ts
screenUV          // normalized [0,1]
screenCoordinate  // pixels
screenSize        // viewport dimensions (dynamic, updates on resize)
```

### Time
```ts
time       // elapsed seconds
deltaTime  // frame delta
```

### Other
```ts
uv()  vertexColor()  attribute('name', 'type')  instanceIndex
hash(seed)  range(min, max)
```

---

## NodeMaterial Types

```ts
MeshBasicNodeMaterial       // unlit
MeshStandardNodeMaterial    // PBR
MeshPhysicalNodeMaterial    // PBR + clearcoat, transmission
MeshPhongNodeMaterial       // Blinn-Phong
MeshLambertNodeMaterial     // Lambert
MeshToonNodeMaterial        // cel-shaded
SpriteNodeMaterial          // billboarded quads
PointsNodeMaterial          // point clouds
LineBasicNodeMaterial       // solid lines
```

### Common Properties (all materials)
```ts
.colorNode  .opacityNode  .positionNode  .normalNode
.outputNode  .fragmentNode  .vertexNode
```

### MeshStandardNodeMaterial
```ts
.roughnessNode  .metalnessNode  .emissiveNode  .aoNode  .envNode
```

### MeshPhysicalNodeMaterial (extends Standard)
```ts
.clearcoatNode  .sheenNode  .transmissionNode  .thicknessNode
.iorNode  .iridescenceNode  .anisotropyNode  .specularColorNode
```

### SpriteNodeMaterial / PointsNodeMaterial
```ts
.positionNode  .colorNode  .scaleNode  .rotationNode  // Sprite
.positionNode  .colorNode  .sizeNode                   // Points
```
