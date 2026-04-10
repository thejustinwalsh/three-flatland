---
name: tsl
description: |
  Three.js Shading Language (TSL) reference for writing GPU shaders with JavaScript node graphs. Covers type constructors, operators, uniforms, Fn() functions, conditionals, loops, math, compute shaders, NodeMaterial types, and common patterns. Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with three/tsl imports, or debugging shader node graphs.
version: 1.0.0
category: graphics
triggers:
  - tsl
  - three/tsl
  - three shading language
  - node material
  - NodeMaterial
  - MeshStandardNodeMaterial
  - MeshPhysicalNodeMaterial
  - MeshBasicNodeMaterial
  - SpriteNodeMaterial
  - PointsNodeMaterial
  - colorNode
  - positionNode
  - normalNode
  - fragmentNode
  - outputNode
  - compute shader
  - storage buffer
  - StorageBufferAttribute
  - shader graph
  - shader node
  - webgpu shader
  - glsl to tsl
  - Fn(
  - uniform(
  - vec3(
  - float(
  - positionLocal
  - positionWorld
  - normalWorld
  - screenUV
  - instanceIndex
  - oscSine
  - oscSquare
  - smoothstep
  - mix(
  - select(
  - toVar
  - assign
  - three/webgpu
  - timerGlobal
  - timerLocal
  - timerDelta
author: three-flatland
license: MIT
source: https://threejsroadmap.com/blog/getting-ai-to-write-tsl-that-works
---

# TSL (Three.js Shading Language) Rules

---

## DO NOT USE - DEPRECATED/OBSOLETE (r181+)

**STOP. Read this section first. These will cause errors or warnings.**

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

---

## CRITICAL: What TSL Is

TSL is JavaScript that builds shader node graphs. Code executes at TWO times:
- **Build time**: JavaScript runs, constructs node graph
- **Run time**: Compiled WGSL/GLSL executes on GPU

```js
// BUILD TIME: JavaScript conditional (runs once when shader compiles)
if (material.transparent) { return transparent_shader; }

// RUN TIME: TSL conditional (runs every pixel/vertex on GPU)
If(value.greaterThan(0.5), () => { result.assign(1.0); });
```

---

## Imports

### NPM (Preferred)

```js
import * as THREE from 'three/webgpu';
import { Fn, vec3, float, uniform, /* ... */ } from 'three/tsl';
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
<script type="module">
import * as THREE from 'three/webgpu';
import { vec3, float, Fn, uniform } from 'three/tsl';
</script>
```

### WRONG Import Patterns

```js
// WRONG: Old path
import { vec3 } from 'three/nodes';
// CORRECT:
import { vec3 } from 'three/tsl';

// WRONG: WebGL renderer with TSL
import * as THREE from 'three';
// CORRECT: WebGPU renderer
import * as THREE from 'three/webgpu';
```

---

## Renderer Initialization

**CRITICAL: Always await renderer.init() before first render or compute.**

```js
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// REQUIRED before any rendering
await renderer.init();

// Now safe to render/compute
renderer.render(scene, camera);
```

---

## Type Constructors

| Constructor | Input | Output |
|-------------|-------|--------|
| `float(x)` | number, node | float |
| `int(x)` | number, node | int |
| `uint(x)` | number, node | uint |
| `bool(x)` | boolean, node | bool |
| `vec2(x,y)` | numbers, nodes, Vector2 | vec2 |
| `vec3(x,y,z)` | numbers, nodes, Vector3, Color | vec3 |
| `vec4(x,y,z,w)` | numbers, nodes, Vector4 | vec4 |
| `color(hex)` | hex number | vec3 |
| `color(r,g,b)` | numbers 0-1 | vec3 |
| `ivec2/3/4` | integers | signed int vector |
| `uvec2/3/4` | integers | unsigned int vector |
| `mat2/3/4` | numbers, Matrix | matrix |

### Type Conversions

```js
node.toFloat()  node.toInt()  node.toUint()  node.toBool()
node.toVec2()   node.toVec3() node.toVec4()  node.toColor()
```

---

## Operators

### Arithmetic (method chaining)

```js
a.add(b)      // a + b (supports multiple: a.add(b, c, d))
a.sub(b)      // a - b
a.mul(b)      // a * b
a.div(b)      // a / b
a.mod(b)      // a % b
a.negate()    // -a
```

### Assignment (for mutable variables)

```js
v.assign(x)        // v = x
v.addAssign(x)     // v += x
v.subAssign(x)     // v -= x
v.mulAssign(x)     // v *= x
v.divAssign(x)     // v /= x
```

### Comparison (returns bool node)

```js
a.equal(b)           // a == b
a.notEqual(b)        // a != b
a.lessThan(b)        // a < b
a.greaterThan(b)     // a > b
a.lessThanEqual(b)   // a <= b
a.greaterThanEqual(b)// a >= b
```

### Logical

```js
a.and(b)   a.or(b)   a.not()   a.xor(b)
```

### Bitwise

```js
a.bitAnd(b)  a.bitOr(b)  a.bitXor(b)  a.bitNot()
a.shiftLeft(n)  a.shiftRight(n)
```

### Swizzle

```js
v.x  v.y  v.z  v.w          // single component
v.xy  v.xyz  v.xyzw         // multiple components
v.zyx  v.bgr                // reorder
v.xxx                       // duplicate
// Aliases: xyzw = rgba = stpq
```

---

## Variables

### RULE: TSL nodes are immutable by default

```js
// WRONG: Cannot modify immutable node
const pos = positionLocal;
pos.y = pos.y.add(1);  // ERROR

// CORRECT: Use .toVar() for mutable variable
const pos = positionLocal.toVar();
pos.y.assign(pos.y.add(1));  // OK
```

### Variable Types

```js
const v = expr.toVar();           // mutable variable
const v = expr.toVar('name');     // named mutable variable
const c = expr.toConst();         // inline constant
const p = property('float');      // uninitialized property
```

---

## Uniforms

```js
// Create
const u = uniform(initialValue);
const u = uniform(new THREE.Color(0xff0000));
const u = uniform(new THREE.Vector3(1, 2, 3));
const u = uniform(0.5);

// Update from JS
u.value = newValue;

// Auto-update callbacks
u.onFrameUpdate(() => value);                    // once per frame
u.onRenderUpdate(({ camera }) => value);         // once per render
u.onObjectUpdate(({ object }) => object.position.y); // per object
```

---

## Functions

### Fn() Syntax

```js
// Array parameters
const myFn = Fn(([a, b, c]) => { return a.add(b).mul(c); });

// Object parameters
const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => {
  return color.mul(intensity);
});

// With defaults
const myFn = Fn(([t = time]) => { return t.sin(); });

// Access build context (second param or first if no inputs)
const myFn = Fn(([input], { material, geometry, object, camera }) => {
  // JS conditionals here run at BUILD time
  if (material.transparent) { return input.mul(0.5); }
  return input;
});
```

### Calling Functions

```js
myFn(a, b, c)           // array params
myFn({ color: red })    // object params
myFn()                  // use defaults
```

### Inline Functions (no Fn wrapper)

```js
// OK for simple expressions, no variables/conditionals
const simple = (t) => t.sin().mul(0.5).add(0.5);
```

---

## Conditionals

### If/ElseIf/Else (CAPITAL I)

```js
// WRONG
if(condition, () => {})    // lowercase 'if' is JavaScript

// CORRECT (inside Fn())
If(a.greaterThan(b), () => {
  result.assign(a);
}).ElseIf(a.lessThan(c), () => {
  result.assign(c);
}).Else(() => {
  result.assign(b);
});
```

### Switch/Case

```js
Switch(mode)
  .Case(0, () => { out.assign(red); })
  .Case(1, () => { out.assign(green); })
  .Case(2, 3, () => { out.assign(blue); })  // multiple values
  .Default(() => { out.assign(white); });
// NOTE: No fallthrough, implicit break
```

### select() - Ternary (Preferred)

```js
// Works outside Fn(), returns value directly
const result = select(condition, valueIfTrue, valueIfFalse);

// EQUIVALENT TO: condition ? valueIfTrue : valueIfFalse

// Example: clamp value with custom logic
const clamped = select(x.greaterThan(max), max, x);
```

### Math-Based (Preferred for Performance)

```js
step(edge, x)           // x < edge ? 0 : 1
mix(a, b, t)            // a*(1-t) + b*t
smoothstep(e0, e1, x)   // smooth 0-1 transition
clamp(x, min, max)      // constrain range
saturate(x)             // clamp(x, 0, 1)

// Pattern: conditional selection without branching
mix(valueA, valueB, step(threshold, selector))
```

---

## Loops

```js
// Basic
Loop(count, ({ i }) => { /* i is loop index */ });

// With options
Loop({ start: int(0), end: int(10), type: 'int', condition: '<' }, ({ i }) => {});

// Nested
Loop(10, 5, ({ i, j }) => {});

// Backward
Loop({ start: 10 }, ({ i }) => {});  // counts down

// While-style
Loop(value.lessThan(10), () => { value.addAssign(1); });

// Control
Break();     // exit loop
Continue();  // skip iteration
```

---

## Math Functions

```js
// All available as: func(x) OR x.func()

// Basic
abs(x) sign(x) floor(x) ceil(x) round(x) trunc(x) fract(x)
mod(x,y) min(x,y) max(x,y) clamp(x,min,max) saturate(x)

// Interpolation
mix(a,b,t) step(edge,x) smoothstep(e0,e1,x)

// Trig
sin(x) cos(x) tan(x) asin(x) acos(x) atan(y,x)

// Exponential
pow(x,y) exp(x) exp2(x) log(x) log2(x) sqrt(x) inverseSqrt(x)

// Vector
length(v) distance(a,b) dot(a,b) cross(a,b) normalize(v)
reflect(I,N) refract(I,N,eta) faceforward(N,I,Nref)

// Derivatives (fragment only)
dFdx(x) dFdy(x) fwidth(x)

// TSL extras (not in GLSL)
oneMinus(x)     // 1 - x
negate(x)       // -x
saturate(x)     // clamp(x, 0, 1)
reciprocal(x)   // 1/x
cbrt(x)         // cube root
lengthSq(x)     // squared length (no sqrt)
difference(x,y) // abs(x - y)
equals(x,y)     // x == y
pow2(x) pow3(x) pow4(x) // x^2, x^3, x^4
```

---

## Oscillators

```js
oscSine(t = time)      // sine wave 0-1-0
oscSquare(t = time)    // square wave 0/1
oscTriangle(t = time)  // triangle wave
oscSawtooth(t = time)  // sawtooth wave
```

---

## Blend Modes

```js
blendBurn(a, b)    // color burn
blendDodge(a, b)   // color dodge
blendScreen(a, b)  // screen
blendOverlay(a, b) // overlay
blendColor(a, b)   // normal blend
```

---

## UV Utilities

```js
uv()                                        // default UV coordinates (vec2, 0-1)
uv(index)                                   // specific UV channel
matcapUV                                    // matcap texture coords
rotateUV(uv, rotation, center = vec2(0.5))  // rotate UVs
spherizeUV(uv, strength, center = vec2(0.5))// spherical distortion
spritesheetUV(count, uv = uv(), frame = 0)  // sprite animation
equirectUV(direction = positionWorldDirection) // equirect mapping
```

---

## Reflect

```js
reflectView    // reflection in view space
reflectVector  // reflection in world space
```

---

## Interpolation Helpers

```js
remap(node, inLow, inHigh, outLow = 0, outHigh = 1)      // remap range
remapClamp(node, inLow, inHigh, outLow = 0, outHigh = 1) // remap + clamp
```

---

## Random

```js
hash(seed)      // pseudo-random float [0,1]
range(min, max) // random attribute per instance
```

---

## Arrays

```js
// Constant array
const arr = array([vec3(1,0,0), vec3(0,1,0), vec3(0,0,1)]);
arr.element(i)    // dynamic index
arr[0]            // constant index only

// Uniform array (updatable from JS)
const arr = uniformArray([new THREE.Color(0xff0000)], 'color');
arr.array[0] = new THREE.Color(0x00ff00);  // update
```

---

## Varyings

```js
// Compute in vertex, interpolate to fragment
const v = varying(expression, 'name');

// Optimize: force vertex computation
const v = vertexStage(expression);
```

---

## Textures

```js
texture(tex)                    // sample at default UV
texture(tex, uv)                // sample at UV
texture(tex, uv, level)         // sample with LOD
cubeTexture(tex, direction)     // cubemap
triplanarTexture(texX, texY, texZ, scale, pos, normal)
```

---

## Shader Inputs

### Position

```js
positionGeometry      // raw attribute
positionLocal         // after skinning/morphing
positionWorld         // world space
positionView          // camera space
positionWorldDirection // normalized
positionViewDirection  // normalized
```

### Normal

```js
normalGeometry   normalLocal   normalView   normalWorld
```

### Camera

```js
cameraPosition  cameraNear  cameraFar
cameraViewMatrix  cameraProjectionMatrix  cameraNormalMatrix
```

### Screen

```js
screenUV          // normalized [0,1]
screenCoordinate  // pixels
screenSize        // pixels
viewportUV  viewport  viewportCoordinate  viewportSize
```

### Time

```js
time              // elapsed time in seconds (float)
deltaTime         // time since last frame (float)
```

### Model

```js
modelDirection         // vec3
modelViewMatrix        // mat4
modelNormalMatrix       // mat3
modelWorldMatrix       // mat4
modelPosition          // vec3
modelScale             // vec3
modelViewPosition      // vec3
modelWorldMatrixInverse // mat4
```

### Other

```js
uv()  uv(index)           // texture coordinates
vertexColor()             // vertex colors
attribute('name', 'type') // custom attribute
instanceIndex             // instance/thread ID (for instancing and compute)
```

---

## NodeMaterial Types

### Available Materials

```js
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

### All Materials - Common Properties

```js
.colorNode      // vec4 - base color
.opacityNode    // float - opacity
.positionNode   // vec3 - vertex position (local space)
.normalNode     // vec3 - surface normal
.outputNode     // vec4 - final output
.fragmentNode   // vec4 - replace entire fragment stage
.vertexNode     // vec4 - replace entire vertex stage
```

### MeshStandardNodeMaterial

```js
.roughnessNode  // float
.metalnessNode  // float
.emissiveNode   // vec3 color
.aoNode         // float
.envNode        // vec3 color
```

### MeshPhysicalNodeMaterial (extends Standard)

```js
.clearcoatNode  .clearcoatRoughnessNode  .clearcoatNormalNode
.sheenNode  .transmissionNode  .thicknessNode
.iorNode  .iridescenceNode  .iridescenceThicknessNode
.anisotropyNode  .specularColorNode  .specularIntensityNode
```

### SpriteNodeMaterial

```js
.positionNode   // vec3 - world position of sprite center
.colorNode      // vec4 - color and alpha
.scaleNode      // float - sprite size (or vec2 for non-uniform)
.rotationNode   // float - rotation in radians
```

### PointsNodeMaterial

```js
.positionNode   // vec3 - point position
.colorNode      // vec4 - color and alpha
.sizeNode       // float - point size in pixels
```

---

## Compute Shaders

### Basic Compute (Standalone)

```js
import { Fn, instanceIndex, storage } from 'three/tsl';

// Create storage buffer
const count = 1024;
const array = new Float32Array(count * 4);
const bufferAttribute = new THREE.StorageBufferAttribute(array, 4);
const buffer = storage(bufferAttribute, 'vec4', count);

// Define compute shader
const computeShader = Fn(() => {
  const idx = instanceIndex;
  const data = buffer.element(idx);
  buffer.element(idx).assign(data.mul(2));
})().compute(count);

// Execute
renderer.compute(computeShader);              // synchronous (per-frame)
await renderer.computeAsync(computeShader);   // async (heavy one-off tasks)
```

### Compute to Render Pipeline

When compute shader output needs to be rendered (e.g., simulations, procedural geometry), use `StorageInstancedBufferAttribute` with `storage()` for writing and `attribute()` for reading.

```js
import { Fn, instanceIndex, storage, attribute, vec4 } from 'three/tsl';

const COUNT = 1000;

// 1. Create typed array and storage attribute
const dataArray = new Float32Array(COUNT * 4);
const dataAttribute = new THREE.StorageInstancedBufferAttribute(dataArray, 4);

// 2. Create storage node for compute shader (write access)
const dataStorage = storage(dataAttribute, 'vec4', COUNT);

// 3. Define compute shader
const computeShader = Fn(() => {
  const idx = instanceIndex;
  const current = dataStorage.element(idx);
  
  // Modify data...
  const newValue = current.xyz.add(vec3(0.01, 0, 0));
  
  dataStorage.element(idx).assign(vec4(newValue, current.w));
})().compute(COUNT);

// 4. Attach attribute to geometry for rendering
const geometry = new THREE.BufferGeometry();
// ... set up base geometry ...
geometry.setAttribute('instanceData', dataAttribute);

// 5. Read in material using attribute()
const material = new THREE.MeshBasicNodeMaterial();
material.positionNode = Fn(() => {
  const data = attribute('instanceData', 'vec4');
  return positionLocal.add(data.xyz);
})();

// 6. Create mesh
const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
scene.add(mesh);

// 7. Animation loop
await renderer.init();
function animate() {
  renderer.compute(computeShader);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

### Updating Buffers from JavaScript

```js
// Modify the underlying array
for (let i = 0; i < COUNT; i++) {
  dataArray[i * 4] = Math.random();
}
// Flag for GPU upload
dataAttribute.needsUpdate = true;
```

---

## Example: Basic Material Shader

```js
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, uv, time, 
         normalWorld, positionWorld, cameraPosition,
         mix, pow, dot, normalize, max } from 'three/tsl';

// Uniforms
const baseColor = uniform(new THREE.Color(0x4488ff));
const fresnelPower = uniform(3.0);

// Create material
const material = new THREE.MeshStandardNodeMaterial();

// Custom color with fresnel rim lighting
material.colorNode = Fn(() => {
  // Calculate fresnel
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const NdotV = max(dot(normalWorld, viewDir), 0.0);
  const fresnel = pow(float(1.0).sub(NdotV), fresnelPower);
  
  // Mix base color with white rim
  const rimColor = vec3(1.0, 1.0, 1.0);
  const finalColor = mix(baseColor, rimColor, fresnel);
  
  return vec4(finalColor, 1.0);
})();

// Animated vertex displacement
material.positionNode = Fn(() => {
  const pos = positionLocal.toVar();
  const wave = sin(pos.x.mul(4.0).add(time.mul(2.0))).mul(0.1);
  pos.y.addAssign(wave);
  return pos;
})();
```

---

## Example: Compute Shader Structure

```js
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec4, float, sin, time } from 'three/tsl';

const COUNT = 10000;

// Storage buffer
const dataArray = new Float32Array(COUNT * 4);
const dataAttribute = new THREE.StorageBufferAttribute(dataArray, 4);
const dataBuffer = storage(dataAttribute, 'vec4', COUNT);

// Uniforms for compute
const speed = uniform(1.0);

// Compute shader
const updateCompute = Fn(() => {
  const idx = instanceIndex;
  const data = dataBuffer.element(idx);
  
  // Read current values
  const position = data.xyz.toVar();
  const phase = data.w;
  
  // Update logic
  const offset = sin(time.mul(speed).add(phase)).mul(0.1);
  position.y.addAssign(offset);
  
  // Write back
  dataBuffer.element(idx).assign(vec4(position, phase));
});

const computeNode = updateCompute().compute(COUNT);

// In animation loop:
// renderer.compute(computeNode);
```

---

## Common Error Patterns

### ERROR: "If is not defined"

```js
// WRONG
if(condition, () => {})
// CORRECT
If(condition, () => {})  // capital I
```

### ERROR: Cannot assign

```js
// WRONG
const v = vec3(1,2,3);
v.x = 5;
// CORRECT
const v = vec3(1,2,3).toVar();
v.x.assign(5);
```

### ERROR: Type mismatch

```js
// WRONG
sqrt(intValue)
// CORRECT
sqrt(intValue.toFloat())
```

### ERROR: Uniform not changing

```js
// WRONG
myUniform = newValue;
// CORRECT
myUniform.value = newValue;
```

### ERROR: Import not found

```js
// WRONG
import { vec3 } from 'three/nodes';
import * as THREE from 'three';
// CORRECT
import { vec3 } from 'three/tsl';
import * as THREE from 'three/webgpu';
```

### ERROR: Compute data not visible in render

```js
// WRONG: Using storage() in render material
material.positionNode = storage(attr, 'vec4', count).element(idx).xyz;

// CORRECT: Use attribute() to read in render shaders
geometry.setAttribute('myData', attr);
material.positionNode = attribute('myData', 'vec4').xyz;
```

### ERROR: Nothing renders

```js
// WRONG: Rendering before init
renderer.render(scene, camera);

// CORRECT: Always await init first
await renderer.init();
renderer.render(scene, camera);
```

---

## Quick Patterns

### Fresnel

```js
const fresnel = Fn(() => {
  const NdotV = normalize(cameraPosition.sub(positionWorld)).dot(normalWorld).max(0);
  return pow(float(1).sub(NdotV), 5);
});
```

### Wave Displacement

```js
material.positionNode = Fn(() => {
  const p = positionLocal.toVar();
  p.y.addAssign(sin(p.x.mul(5).add(time)).mul(0.2));
  return p;
})();
```

### UV Scroll

```js
material.colorNode = texture(map, uv().add(vec2(time.mul(0.1), 0)));
```

### Conditional Value

```js
const result = select(value.greaterThan(0.5), valueA, valueB);
// OR branchless:
const result = mix(valueB, valueA, step(0.5, value));
```

### Gradient Mapping

```js
const t = smoothstep(float(0.0), float(1.0), inputValue);
const colorA = vec3(0.1, 0.2, 0.8);
const colorB = vec3(1.0, 0.5, 0.2);
const gradient = mix(colorA, colorB, t);
```

### Soft Falloff

```js
// Exponential falloff (good for glow, attenuation)
const falloff = exp(distance.negate().mul(rate));

// Inverse square falloff
const attenuation = float(1.0).div(distance.mul(distance).add(1.0));
```

### Circular Mask (for sprites/points)

```js
const uvCentered = uv().sub(0.5).mul(2.0);  // -1 to 1
const dist = length(uvCentered);
const circle = smoothstep(float(1.0), float(0.8), dist);
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
