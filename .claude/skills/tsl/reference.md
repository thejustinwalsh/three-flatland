# TSL Full API Reference

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
  pass, convertToTexture,
} from 'three/tsl'

// Type imports — always use `type` keyword, import from source paths
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import type PassNode from 'three/src/nodes/display/PassNode.js'
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
a.equal(b)           // a == b
a.notEqual(b)        // a != b
a.lessThan(b)        // a < b
a.greaterThan(b)     // a > b
a.lessThanEqual(b)   // a <= b
a.greaterThanEqual(b)// a >= b
```

### Logical

```ts
a.and(b)   a.or(b)   a.not()   a.xor(b)
```

### Bitwise

```ts
a.bitAnd(b)  a.bitOr(b)  a.bitXor(b)  a.bitNot()
a.shiftLeft(n)  a.shiftRight(n)
```

### Swizzle

```ts
v.x  v.y  v.z  v.w          // single component → Node<'float'>
v.xy  v.xyz  v.xyzw         // multiple → Node<'vec2'> / Node<'vec3'> / Node<'vec4'>
v.zyx  v.bgr                // reorder
v.xxx                       // duplicate
// Aliases: xyzw = rgba = stpq
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
import type UniformNode from 'three/src/nodes/core/UniformNode.js'

// Type is inferred from argument:
const u1 = uniform(0.5)                       // UniformNode<'float', number>
const u2 = uniform(new THREE.Color(0xff0000))  // UniformNode<'color', Color>
const u3 = uniform(new THREE.Vector2(0, 0))    // UniformNode<'vec2', Vector2>
const u4 = uniform(new THREE.Vector3(1, 2, 3)) // UniformNode<'vec3', Vector3>
const u5 = uniform(new THREE.Vector4())        // UniformNode<'vec4', Vector4>
const u6 = uniform(new THREE.Matrix4())        // UniformNode<'mat4', Matrix4>

// Update from JS
u1.value = 1.0

// Auto-update callbacks
u1.onFrameUpdate(() => performance.now() / 1000)
u1.onRenderUpdate(({ camera }) => camera.position.y)
u1.onObjectUpdate(({ object }) => object.position.y)
```

### Uniform union type (for dynamic storage)

```ts
type UniformNodeValue =
  | UniformNode<'float', number>
  | UniformNode<'vec2', Vector2>
  | UniformNode<'vec3', Vector3>
  | UniformNode<'vec4', Vector4>
```

---

## Functions

### Fn() Syntax

```ts
// No params — return type inferred
const myFn = Fn(() => {
  return positionLocal.toVar()
})

// Array parameters
const myFn = Fn(([a, b, c]) => {
  return a.add(b).mul(c)
})

// Object parameters with defaults
const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => {
  return color.mul(intensity)
})

// With defaults
const myFn = Fn(([t = time]) => { return t.sin() })

// Access build context (second param or first if no inputs)
const myFn = Fn(([input], { material, geometry, object, camera }) => {
  // JS conditionals here run at BUILD time
  if (material.transparent) { return input.mul(0.5) }
  return input
})
```

### Calling Functions

```ts
myFn(a, b, c)           // array params
myFn({ color: red })    // object params
myFn()                  // use defaults
```

### Inline Functions (no Fn wrapper)

```ts
// OK for simple expressions, no variables/conditionals
const simple = (t: Node<'float'>) => t.sin().mul(0.5).add(0.5)
```

---

## Attributes

```ts
// Explicit type param required for @types/three >= 0.183
const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
const instanceFlip = attribute<'vec2'>('instanceFlip', 'vec2')
const customFloat = attribute<'float'>('myFloat', 'float')
```

---

## Conditionals

### If/ElseIf/Else (CAPITAL I)

```ts
// CORRECT (inside Fn())
If(a.greaterThan(b), () => {
  result.assign(a)
}).ElseIf(a.lessThan(c), () => {
  result.assign(c)
}).Else(() => {
  result.assign(b)
})
```

### Switch/Case

```ts
Switch(mode)
  .Case(0, () => { out.assign(red) })
  .Case(1, () => { out.assign(green) })
  .Case(2, 3, () => { out.assign(blue) })  // multiple values
  .Default(() => { out.assign(white) })
// NOTE: No fallthrough, implicit break
```

### select() — Ternary (Preferred)

```ts
// Works outside Fn(), returns value directly
const result = select(condition, valueIfTrue, valueIfFalse)
```

### Math-Based (Preferred for Performance)

```ts
step(edge, x)           // x < edge ? 0 : 1
mix(a, b, t)            // a*(1-t) + b*t
smoothstep(e0, e1, x)   // smooth 0-1 transition
clamp(x, min, max)      // constrain range
saturate(x)             // clamp(x, 0, 1)

// Branchless conditional selection
mix(valueA, valueB, step(threshold, selector))
```

---

## Loops

```ts
// Basic
Loop(count, ({ i }) => { /* i is loop index */ })

// With options
Loop({ start: int(0), end: int(10), type: 'int', condition: '<' }, ({ i }) => {})

// Nested
Loop(10, 5, ({ i, j }) => {})

// Backward
Loop({ start: 10 }, ({ i }) => {})  // counts down

// While-style
Loop(value.lessThan(10), () => { value.addAssign(1) })

// Control
Break()     // exit loop
Continue()  // skip iteration
```

---

## Math Functions

```ts
// All available as: func(x) OR x.func()

// Basic
abs(x) sign(x) floor(x) ceil(x) round(x) trunc(x) fract(x)
mod(x, y) min(x, y) max(x, y) clamp(x, min, max) saturate(x)

// Interpolation
mix(a, b, t) step(edge, x) smoothstep(e0, e1, x)

// Trig
sin(x) cos(x) tan(x) asin(x) acos(x) atan(y, x)

// Exponential
pow(x, y) exp(x) exp2(x) log(x) log2(x) sqrt(x) inverseSqrt(x)

// Vector
length(v) distance(a, b) dot(a, b) cross(a, b) normalize(v)
reflect(I, N) refract(I, N, eta) faceforward(N, I, Nref)

// Derivatives (fragment only)
dFdx(x) dFdy(x) fwidth(x)

// TSL extras (not in GLSL)
oneMinus(x)     // 1 - x
negate(x)       // -x
saturate(x)     // clamp(x, 0, 1)
reciprocal(x)   // 1/x
cbrt(x)         // cube root
lengthSq(x)     // squared length (no sqrt)
difference(x, y) // abs(x - y)
equals(x, y)     // x == y
pow2(x) pow3(x) pow4(x) // x^2, x^3, x^4
```

---

## Oscillators

```ts
oscSine(t = time)      // sine wave 0-1-0
oscSquare(t = time)    // square wave 0/1
oscTriangle(t = time)  // triangle wave
oscSawtooth(t = time)  // sawtooth wave
```

---

## Blend Modes

```ts
blendBurn(a, b)    // color burn
blendDodge(a, b)   // color dodge
blendScreen(a, b)  // screen
blendOverlay(a, b) // overlay
blendColor(a, b)   // normal blend
```

---

## UV Utilities

```ts
uv()                                        // AttributeNode<'vec2'>, 0-1
uv(index)                                   // specific UV channel
matcapUV                                    // matcap texture coords
rotateUV(uv, rotation, center = vec2(0.5))  // rotate UVs
spherizeUV(uv, strength, center = vec2(0.5))// spherical distortion
spritesheetUV(count, uv = uv(), frame = 0)  // sprite animation
equirectUV(direction = positionWorldDirection) // equirect mapping
```

---

## Reflect

```ts
reflectView    // reflection in view space
reflectVector  // reflection in world space
```

---

## Interpolation Helpers

```ts
remap(node, inLow, inHigh, outLow = 0, outHigh = 1)      // remap range
remapClamp(node, inLow, inHigh, outLow = 0, outHigh = 1) // remap + clamp
```

---

## Random

```ts
hash(seed)      // pseudo-random float [0,1]
range(min, max) // random attribute per instance
```

---

## Arrays

```ts
// Constant array
const arr = array([vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)])
arr.element(i)    // dynamic index
arr[0]            // constant index only

// Uniform array (updatable from JS)
const arr = uniformArray([new THREE.Color(0xff0000)], 'color')
arr.array[0] = new THREE.Color(0x00ff00)  // update
```

---

## Varyings

```ts
// Compute in vertex, interpolate to fragment
const v = varying(expression, 'name')

// Optimize: force vertex computation
const v = vertexStage(expression)
```

---

## Textures

```ts
texture(tex)                    // sample at default UV → TextureNode<'vec4'>
texture(tex, uv)                // sample at UV
texture(tex, uv, level)         // sample with LOD
cubeTexture(tex, direction)     // cubemap
triplanarTexture(texX, texY, texZ, scale, pos, normal)
```

For typed texture node params in function signatures:

```ts
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'

function myEffect(tex: TextureNode<'vec4'>, inputUV: Node<'vec2'>): Node<'vec4'> {
  return texture(tex, inputUV)
}
```

---

## Shader Inputs

### Position

```ts
positionGeometry      // AttributeNode<'vec3'> — raw attribute
positionLocal         // Node<'vec3'> — after skinning/morphing
positionWorld         // Node<'vec3'>
positionView          // Node<'vec3'>
positionWorldDirection // Node<'vec3'> — normalized
positionViewDirection  // Node<'vec3'> — normalized
```

### Normal

```ts
normalGeometry   normalLocal   normalView   normalWorld  // all Node<'vec3'>
```

### Camera

```ts
cameraPosition  // Node<'vec3'>
cameraNear      // Node<'float'>
cameraFar       // Node<'float'>
cameraViewMatrix  cameraProjectionMatrix  cameraNormalMatrix
```

### Screen

```ts
screenUV          // ScreenNode<'vec2'> — normalized [0,1]
screenCoordinate  // ScreenNode<'vec2'> — pixels
screenSize        // ScreenNode<'vec2'> — pixels
viewportUV  viewport  viewportCoordinate  viewportSize
```

### Time

```ts
time              // UniformNode<'float', number> — elapsed seconds
deltaTime         // UniformNode<'float', number> — frame delta
```

### Model

```ts
modelDirection          // Node<'vec3'>
modelViewMatrix         // Node<'mat4'>
modelNormalMatrix        // Node<'mat3'>
modelWorldMatrix        // Node<'mat4'>
modelPosition           // Node<'vec3'>
modelScale              // Node<'vec3'>
modelViewPosition       // Node<'vec3'>
modelWorldMatrixInverse  // Node<'mat4'>
```

### Other

```ts
uv()  uv(index)           // AttributeNode<'vec2'>
vertexColor()             // vertex colors
attribute('name', 'type') // custom attribute (use generic: attribute<'vec4'>(...))
instanceIndex             // IndexNode — instance/thread ID
```

---

## NodeMaterial Types

### Available Materials

```ts
MeshBasicNodeMaterial      // unlit, fastest
MeshStandardNodeMaterial   // PBR with roughness/metalness
MeshPhysicalNodeMaterial   // PBR + clearcoat, transmission, etc.
MeshPhongNodeMaterial      // Blinn-Phong shading
MeshLambertNodeMaterial    // Lambert diffuse
MeshToonNodeMaterial       // cel-shaded
MeshMatcapNodeMaterial     // matcap shading
MeshNormalNodeMaterial     // visualize normals
SpriteNodeMaterial         // billboarded quads
PointsNodeMaterial         // point clouds
LineBasicNodeMaterial      // solid lines
LineDashedNodeMaterial     // dashed lines
```

### All Materials — Common Properties

```ts
.colorNode      // Node<'float'> | Node<'vec2'> | Node<'vec3'> | Node<'vec4'> | Node<'color'> | null
.opacityNode    // Node | null
.positionNode   // Node | null — vertex position (local space)
.normalNode     // Node | null — surface normal
.outputNode     // Node | null — final output
.fragmentNode   // Node | null — replace entire fragment stage
.vertexNode     // Node | null — replace entire vertex stage
```

### MeshStandardNodeMaterial

```ts
.roughnessNode  // Node | null
.metalnessNode  // Node | null
.emissiveNode   // Node | null — vec3 color
.aoNode         // Node | null
.envNode        // Node | null — vec3 color
```

### MeshPhysicalNodeMaterial (extends Standard)

```ts
.clearcoatNode  .clearcoatRoughnessNode  .clearcoatNormalNode
.sheenNode  .transmissionNode  .thicknessNode
.iorNode  .iridescenceNode  .iridescenceThicknessNode
.anisotropyNode  .specularColorNode  .specularIntensityNode
```

### SpriteNodeMaterial

```ts
.positionNode   // Node | null — world position of sprite center
.colorNode      // Node | null — color and alpha
.scaleNode      // Node | null — sprite size
.rotationNode   // Node | null — rotation in radians
```

### PointsNodeMaterial

```ts
.positionNode   // Node | null — point position
.colorNode      // Node | null — color and alpha
.sizeNode       // Node | null — point size in pixels
```

---

## Compute Shaders

### Storage Buffer Types

```ts
import { storage, instanceIndex, Fn, vec4 } from 'three/tsl'

// storage() overloads by type string:
// storage(attr, 'float', count) → StorageBufferNode<'float'>
// storage(attr, 'vec2', count)  → StorageBufferNode<'vec2'>
// storage(attr, 'vec3', count)  → StorageBufferNode<'vec3'>
// storage(attr, 'vec4', count)  → StorageBufferNode<'vec4'>
```

### Basic Compute (Standalone)

```ts
const count = 1024
const array = new Float32Array(count * 4)
const bufferAttribute = new THREE.StorageBufferAttribute(array, 4)
const buffer = storage(bufferAttribute, 'vec4', count)  // StorageBufferNode<'vec4'>

const computeShader = Fn(() => {
  const idx = instanceIndex
  const data = buffer.element(idx)
  buffer.element(idx).assign(data.mul(2))
})().compute(count)

// Execute
renderer.compute(computeShader)              // synchronous (per-frame)
await renderer.computeAsync(computeShader)   // async (heavy one-off tasks)
```

### Compute to Render Pipeline

Use `StorageInstancedBufferAttribute` with `storage()` for writing and `attribute()` for reading:

```ts
const COUNT = 1000

// 1. Create storage attribute
const dataArray = new Float32Array(COUNT * 4)
const dataAttribute = new THREE.StorageInstancedBufferAttribute(dataArray, 4)

// 2. Storage node for compute (write access)
const dataStorage = storage(dataAttribute, 'vec4', COUNT)

// 3. Compute shader
const computeShader = Fn(() => {
  const idx = instanceIndex
  const current = dataStorage.element(idx)
  const newValue = current.xyz.add(vec3(0.01, 0, 0))
  dataStorage.element(idx).assign(vec4(newValue, current.w))
})().compute(COUNT)

// 4. Attach to geometry for rendering
const geometry = new THREE.BufferGeometry()
geometry.setAttribute('instanceData', dataAttribute)

// 5. Read in material via attribute() — NOT storage()
const material = new THREE.MeshBasicNodeMaterial()
material.positionNode = Fn(() => {
  const data = attribute<'vec4'>('instanceData', 'vec4')
  return positionLocal.add(data.xyz)
})()

// 6. Create mesh and animate
const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
scene.add(mesh)

await renderer.init()
function animate() {
  renderer.compute(computeShader)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()
```

### Updating Buffers from JavaScript

```ts
for (let i = 0; i < COUNT; i++) {
  dataArray[i * 4] = Math.random()
}
dataAttribute.needsUpdate = true
```

---

## Example: Typed Material Shader

```ts
import * as THREE from 'three/webgpu'
import { Fn, uniform, vec3, vec4, float, time,
         normalWorld, positionWorld, positionLocal, cameraPosition,
         mix, pow, dot, normalize, max, sin } from 'three/tsl'

const baseColor = uniform(new THREE.Color(0x4488ff))  // UniformNode<'color', Color>
const fresnelPower = uniform(3.0)                      // UniformNode<'float', number>

const material = new THREE.MeshStandardNodeMaterial()

material.colorNode = Fn(() => {
  const viewDir = normalize(cameraPosition.sub(positionWorld))
  const NdotV = max(dot(normalWorld, viewDir), 0.0)
  const fresnel = pow(float(1.0).sub(NdotV), fresnelPower)

  const rimColor = vec3(1.0, 1.0, 1.0)
  const finalColor = mix(baseColor, rimColor, fresnel)
  return vec4(finalColor, 1.0)
})()

material.positionNode = Fn(() => {
  const pos = positionLocal.toVar()
  const wave = sin(pos.x.mul(4.0).add(time.mul(2.0))).mul(0.1)
  pos.y.addAssign(wave)
  return pos
})()
```

---

## GLSL to TSL Migration

| GLSL | TSL |
|------|-----|
| `position` | `positionGeometry` |
| `transformed` | `positionLocal` |
| `transformedNormal` | `normalLocal` |
| `vWorldPosition` | `positionWorld` |
| `vColor` | `vertexColor()` |
| `vUv` / `uv` | `uv()` |
| `vNormal` | `normalView` |
| `viewMatrix` | `cameraViewMatrix` |
| `modelMatrix` | `modelWorldMatrix` |
| `modelViewMatrix` | `modelViewMatrix` |
| `projectionMatrix` | `cameraProjectionMatrix` |
| `diffuseColor` | `material.colorNode` |
| `gl_FragColor` | `material.fragmentNode` |
| `texture2D(tex, uv)` | `texture(tex, uv)` |
| `textureCube(tex, dir)` | `cubeTexture(tex, dir)` |
| `gl_FragCoord` | `screenCoordinate` |
| `gl_PointCoord` | `uv()` in SpriteNodeMaterial/PointsNodeMaterial |
| `gl_InstanceID` | `instanceIndex` |
