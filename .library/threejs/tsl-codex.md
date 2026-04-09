# TSL Codex — Three.js Shading Language

The precise TSL reference. Covers the language, its type system, the node-graph semantics, control flow, built-in accessors, compute shaders, and integration with `NodeMaterial`. TypeScript-first.

> Verified against three.js r183 source at `src/nodes/`.
>
> **Imports** — every TSL symbol is exported from `three/tsl`:
> ```ts
> import { Fn, uniform, attribute, varying, varyingProperty, property,
>          texture, textureLoad, cubeTexture, storage, instancedArray,
>          vec2, vec3, vec4, ivec3, float, int, bool, mat3, mat4, color,
>          positionLocal, positionWorld, positionView, normalLocal, normalWorld,
>          uv, time, deltaTime, cameraPosition, modelWorldMatrix, modelViewMatrix,
>          modelViewProjection, screenUV, screenCoordinate, screenSize,
>          instanceIndex, frontFacing, If, Loop, Break, Continue, Return,
>          sin, cos, mix, smoothstep, clamp, length, normalize, dot, cross,
>          pow, exp, log, sqrt, reflect, refract, abs, floor, ceil, fract, sign,
>          reflector, pass, mrt, bloom, compute } from 'three/tsl';
> ```
>
> **Not every symbol is listed above** — TSL re-exports ~200 identifiers from `src/nodes/TSL.js`. Scan that file for anything missing here. The `src/Three.TSL.js` barrel lists the public surface.

---

## 1. Mental model (30 seconds)

TSL is a **JavaScript DSL that builds a typed node graph**, which `NodeBuilder` compiles to WGSL (WebGPU) or GLSL (WebGL fallback) on first use. You never write shader source strings; you compose typed nodes:

```ts
const displacement = positionLocal.y.mul(5).add(time).sin().mul(0.2);
material.positionNode = positionLocal.add(vec3(0, displacement, 0));
```

Every TSL expression is a `Node`. Nodes are typed (`'float'`, `'vec3'`, `'mat4'`, ...). The JS object for a node is wrapped in a `Proxy` (`src/nodes/tsl/TSLCore.js:296-315`) that exposes the fluent method API (`.mul`, `.sin`, `.xyz`, …) via `addMethodChaining`.

Graphs are built **once** — typically in a material constructor — and compiled on first use by the renderer. After compile, per-frame updates flow through **reactive uniforms** (`uniform(value).value = newValue`) which only upload a GPU buffer, not recompile.

Key consequences:

- **JS arithmetic does not work on nodes.** `a + b` coerces to string garbage. Use `a.add(b)`.
- **Build once, drive with uniforms.** Rebuilding graphs each frame thrashes the pipeline cache.
- **Control flow is imperative within `Fn()`**, declarative outside. `If`, `Loop`, `Break`, `Continue`, `Return` only work inside a stack (an `Fn()` body).
- **Types are inferred from arguments.** `vec3(1,2,3)` is three floats joined; `vec3(someVec4)` is a conversion.

---

## 2. TypeScript story

**There is no shipped `.d.ts` file for TSL in the three.js repo** (verified: `glob **/*.d.ts` returns nothing). `@types/three` on DefinitelyTyped has partial TSL declarations that lag behind the core repo. For rigorous TypeScript, either:

1. Install `@types/three@latest` and treat any missing symbols as `any`, or
2. Declare your own ambient module shim (recommended for production code):

```ts
// three-tsl.d.ts
declare module 'three/tsl' {
  export type ShaderNodeObject<T = any> = T & {
    // Math
    add(...n: any[]): ShaderNodeObject;
    sub(...n: any[]): ShaderNodeObject;
    mul(...n: any[]): ShaderNodeObject;
    div(...n: any[]): ShaderNodeObject;
    mod(n: any): ShaderNodeObject;
    pow(n: any): ShaderNodeObject;
    negate(): ShaderNodeObject;

    // Comparison
    lessThan(n: any): ShaderNodeObject;
    lessThanEqual(n: any): ShaderNodeObject;
    greaterThan(n: any): ShaderNodeObject;
    greaterThanEqual(n: any): ShaderNodeObject;
    equal(n: any): ShaderNodeObject;
    notEqual(n: any): ShaderNodeObject;
    and(n: any): ShaderNodeObject;
    or(n: any): ShaderNodeObject;
    not(): ShaderNodeObject;

    // Trig
    sin(): ShaderNodeObject;
    cos(): ShaderNodeObject;
    tan(): ShaderNodeObject;
    asin(): ShaderNodeObject;
    acos(): ShaderNodeObject;
    atan(n?: any): ShaderNodeObject;

    // Other math
    abs(): ShaderNodeObject;
    floor(): ShaderNodeObject;
    ceil(): ShaderNodeObject;
    round(): ShaderNodeObject;
    fract(): ShaderNodeObject;
    sign(): ShaderNodeObject;
    min(n: any): ShaderNodeObject;
    max(n: any): ShaderNodeObject;
    clamp(a: any, b: any): ShaderNodeObject;
    mix(b: any, t: any): ShaderNodeObject;
    step(edge: any): ShaderNodeObject;
    smoothstep(a: any, b: any): ShaderNodeObject;
    exp(): ShaderNodeObject;
    log(): ShaderNodeObject;
    sqrt(): ShaderNodeObject;
    inverseSqrt(): ShaderNodeObject;

    // Vector ops
    length(): ShaderNodeObject;
    distance(n: any): ShaderNodeObject;
    dot(n: any): ShaderNodeObject;
    cross(n: any): ShaderNodeObject;
    normalize(): ShaderNodeObject;
    reflect(normal: any): ShaderNodeObject;
    refract(normal: any, eta: any): ShaderNodeObject;

    // Swizzles (subset — add more as needed)
    x: ShaderNodeObject; y: ShaderNodeObject; z: ShaderNodeObject; w: ShaderNodeObject;
    xy: ShaderNodeObject; xyz: ShaderNodeObject; xyzw: ShaderNodeObject;
    r: ShaderNodeObject; g: ShaderNodeObject; b: ShaderNodeObject; a: ShaderNodeObject;
    rgb: ShaderNodeObject; rgba: ShaderNodeObject;

    // Conversions
    toFloat(): ShaderNodeObject;
    toInt(): ShaderNodeObject;
    toUint(): ShaderNodeObject;
    toBool(): ShaderNodeObject;
    toVec2(): ShaderNodeObject;
    toVec3(): ShaderNodeObject;
    toVec4(): ShaderNodeObject;
    toColor(): ShaderNodeObject;
    toMat3(): ShaderNodeObject;
    toMat4(): ShaderNodeObject;

    // Variables & assignment
    toVar(name?: string): ShaderNodeObject;
    toVarying(name?: string): ShaderNodeObject;
    assign(value: any): ShaderNodeObject;
    addAssign(value: any): ShaderNodeObject;
    subAssign(value: any): ShaderNodeObject;
    mulAssign(value: any): ShaderNodeObject;
    divAssign(value: any): ShaderNodeObject;

    // Conditional
    select(a: any, b: any): ShaderNodeObject;

    // Discard (fragment-only)
    discard(conditional?: any): void;
  };

  // Type factories
  export const float: (value?: any) => ShaderNodeObject;
  export const int: (value?: any) => ShaderNodeObject;
  export const uint: (value?: any) => ShaderNodeObject;
  export const bool: (value?: any) => ShaderNodeObject;
  export const vec2: (...args: any[]) => ShaderNodeObject;
  export const vec3: (...args: any[]) => ShaderNodeObject;
  export const vec4: (...args: any[]) => ShaderNodeObject;
  export const color: (...args: any[]) => ShaderNodeObject;
  export const mat3: (...args: any[]) => ShaderNodeObject;
  export const mat4: (...args: any[]) => ShaderNodeObject;

  // Variable kinds
  export const uniform: (value: any, type?: string) => ShaderNodeObject;
  export const attribute: (name: string, nodeType?: string) => ShaderNodeObject;
  export const varying: (node: any, name?: string) => ShaderNodeObject;
  export const varyingProperty: (type: string, name: string) => ShaderNodeObject;
  export const property: (type: string, name?: string) => ShaderNodeObject;

  // Fn
  export function Fn<P extends readonly any[] = any[], R = any>(
    body: (params: P, builder?: any) => any,
    layout?: { name?: string; type?: string; inputs?: Array<{ name: string; type: string }> } | Record<string, string>
  ): ((...args: any[]) => ShaderNodeObject<R>) & { setLayout(l: any): any };

  // Control flow
  export function If(cond: any, body: () => void): {
    ElseIf(cond: any, body: () => void): any;
    Else(body: () => void): any;
  };
  export const Loop: (count: any, body?: (ctx: { i: ShaderNodeObject; j?: ShaderNodeObject }) => void) => ShaderNodeObject;
  export const Break: () => ShaderNodeObject;
  export const Continue: () => ShaderNodeObject;
  export const Return: () => ShaderNodeObject;

  // Built-in accessors
  export const positionGeometry: ShaderNodeObject;
  export const positionLocal: ShaderNodeObject;
  export const positionWorld: ShaderNodeObject;
  export const positionView: ShaderNodeObject;
  export const positionWorldDirection: ShaderNodeObject;
  export const normalLocal: ShaderNodeObject;
  export const normalWorld: ShaderNodeObject;
  export const normalView: ShaderNodeObject;
  export const tangentLocal: ShaderNodeObject;
  export const tangentWorld: ShaderNodeObject;
  export const bitangentLocal: ShaderNodeObject;
  export const bitangentWorld: ShaderNodeObject;
  export const cameraPosition: ShaderNodeObject;
  export const cameraViewMatrix: ShaderNodeObject;
  export const cameraProjectionMatrix: ShaderNodeObject;
  export const cameraNear: ShaderNodeObject;
  export const cameraFar: ShaderNodeObject;
  export const modelWorldMatrix: ShaderNodeObject;
  export const modelViewMatrix: ShaderNodeObject;
  export const modelNormalMatrix: ShaderNodeObject;
  export const modelViewProjection: ShaderNodeObject;
  export const screenUV: ShaderNodeObject;
  export const screenCoordinate: ShaderNodeObject;
  export const screenSize: ShaderNodeObject;
  export const viewportUV: ShaderNodeObject;
  export const time: ShaderNodeObject;
  export const deltaTime: ShaderNodeObject;
  export const instanceIndex: ShaderNodeObject;
  export const frontFacing: ShaderNodeObject;
  export const vertexColor: ShaderNodeObject;
  export const uv: (channel?: number) => ShaderNodeObject;

  // Textures
  export const texture: (tex: any, uv?: any, level?: any, bias?: any) => ShaderNodeObject & {
    sample(uv: any): ShaderNodeObject;
    load(uv: any): ShaderNodeObject;
    level(l: any): ShaderNodeObject;
    bias(b: any): ShaderNodeObject;
    grad(dx: any, dy: any): ShaderNodeObject;
    compare(ref: any): ShaderNodeObject;
    blur(amount: any): ShaderNodeObject;
    size(level?: any): ShaderNodeObject;
    offset(offset: any): ShaderNodeObject;
    uvNode: ShaderNodeObject;
  };
  export const textureLoad: (tex: any, uv: any) => ShaderNodeObject;
  export const cubeTexture: (cube: any, dir?: any) => ShaderNodeObject;
  export const storage: (buffer: any, type: string, count?: number) => ShaderNodeObject & {
    element(index: any): ShaderNodeObject;
    toReadOnly(): ShaderNodeObject;
    toWriteOnly(): ShaderNodeObject;
    toAttribute(): ShaderNodeObject;
  };
  export const instancedArray: (count: number, type?: string) => ShaderNodeObject;
  export const attributeArray: (count: number, type?: string) => ShaderNodeObject;
  export const workgroupArray: (type: string, count: number) => ShaderNodeObject;

  // Utility nodes
  export const reflector: (parameters?: { resolution?: number; bounces?: number }) => ShaderNodeObject & {
    target: import('three').Object3D;
    uvNode: ShaderNodeObject;
    reflector: { resolutionScale: number };
    rgb: ShaderNodeObject;
  };
  export const pass: (scene: import('three').Scene, camera: import('three').Camera, options?: any) => ShaderNodeObject & {
    getTextureNode(name?: string): ShaderNodeObject;
    setMRT(mrtNode: any): void;
  };
  export const mrt: (outputs: Record<string, any>) => any;

  // Compute
  export const compute: (shader: any, count: number | number[], workgroupSize?: number[]) => ShaderNodeObject;

  // Standalone math functions (most also work as methods)
  export const sin: (x: any) => ShaderNodeObject;
  export const cos: (x: any) => ShaderNodeObject;
  export const mix: (a: any, b: any, t: any) => ShaderNodeObject;
  export const smoothstep: (a: any, b: any, x: any) => ShaderNodeObject;
  export const clamp: (x: any, a: any, b: any) => ShaderNodeObject;
  export const length: (v: any) => ShaderNodeObject;
  export const normalize: (v: any) => ShaderNodeObject;
  export const dot: (a: any, b: any) => ShaderNodeObject;
  export const cross: (a: any, b: any) => ShaderNodeObject;
  export const pow: (a: any, b: any) => ShaderNodeObject;
  // ... extend as needed
}
```

**Pragmatics**: TSL's dynamic swizzles (`vec3.xxyy`, `vec3.zyx`) cannot be statically typed without generating all ~4^4 variations. Most production TypeScript projects type them as `any`-returning properties and rely on runtime correctness plus shader-compile errors. That is acceptable — TSL compile errors fire early, before any real rendering.

---

## 3. Type factories

All type factories are `ConvertType` instances (`src/nodes/tsl/TSLCore.js:1150-1176`). Call them as functions:

```ts
float(1.5)          // float literal
float()             // default float node (0)
int(42)
uint(0)
bool(true)
vec2(1, 2)
vec2(x, y)          // x, y can be nodes or numbers
vec3(1, 2, 3)
vec3(someVec4)      // conversion by shrinking
color(1, 0, 0)      // alias for vec3, preserves intent
vec4(color, 1.0)    // append component
mat3(c0, c1, c2)    // from column vectors
mat4(c0, c1, c2, c3)

// Integer vectors
ivec2(1, 2); ivec3(); ivec4();
uvec2(); uvec3(); uvec4();
bvec2(); bvec3(); bvec4();
```

**Type inference rules** (verified in `TSLCore.js:885-915`):
- `vec3(a, b, c)` with three scalars builds a `JoinNode` of three floats.
- `vec3(someVec3OrVec4)` with one node argument builds a `ConvertNode`.
- Mixed: `vec4(vec3, 1)` appends scalar to the vector.

**Conversions as methods** (added in `TSLCore.js:1180-1199`):

```ts
node.toFloat(); node.toInt(); node.toUint(); node.toBool();
node.toVec2(); node.toVec3(); node.toVec4();
node.toIVec2(); node.toIVec3(); node.toIVec4();
node.toUVec2(); node.toUVec3(); node.toUVec4();
node.toBVec2(); node.toBVec3(); node.toBVec4();
node.toMat2(); node.toMat3(); node.toMat4();
node.toColor();
```

Use conversions when the compiler complains about type mismatches. WGSL and GLSL are strict; TSL will emit an explicit cast.

---

## 4. Variable kinds

| Kind | Factory | Purpose | Update path |
|---|---|---|---|
| **uniform** | `uniform(value, type?)` | Per-object/material constant driven from JS | Write `.value`, GPU buffer re-uploaded |
| **attribute** | `attribute(name, type?)` | Per-vertex geometry data | Change `BufferAttribute.array` + `.needsUpdate` |
| **varying** | `varying(node)` or `varyingProperty(type, name)` | Vertex → fragment interpolation | Assigned in vertex stage |
| **property** | `property(type, name?)` | Mutable local within an `Fn()` body | `.assign()` inside the stack |
| **const** | `float(x)`, `vec3(...)` | Compile-time constant | Inlined |

### `uniform()`

```ts
const strength = uniform( 1.0 );            // float
const tintColor = uniform( color( 1, 0, 0 ) );
const matrix = uniform( 'mat4' );           // typed, value assigned later

// Build-time — use in graph
material.colorNode = tintColor.mul( strength );

// Run-time — update per frame, does NOT recompile
strength.value = Math.sin( performance.now() * 0.001 );
```

Reactive uniforms (`src/nodes/core/UniformNode.js:227`) are first-class — they create a cached GPU buffer slot. Every uniform can have an update callback:

```ts
const elapsed = uniform( 0 ).onRenderUpdate( frame => frame.time );
```

`src/nodes/utils/Timer.js:10` defines the built-in `time` this way.

### `attribute()`

```ts
const customAttr = attribute( 'myData', 'vec3' );
// Access per-vertex data exposed by your BufferGeometry
```

Most geometry attributes already have named accessors: `positionGeometry` (raw), `positionLocal`, `normalGeometry`, `uv()`, `vertexColor` — prefer those over manual `attribute()` calls.

### `varying()` vs `varyingProperty()`

`varying(node)` turns an expression into a varying (one-shot, named automatically):
```ts
const vWorldPos = varying( positionWorld );         // vec3, auto-named
```

`varyingProperty(type, name)` creates an explicit varying slot you can assign inside a vertex-stage `Fn()`:
```ts
const vPos = varyingProperty( 'vec3', 'vWorldPos' );
material.vertexNode = Fn( () => {
  vPos.assign( positionWorld );
  return modelViewProjection;
} )();
// In fragment:
material.colorNode = Fn( () => vPos.normalize() )();
```

Use `varyingProperty` when you need a named slot accessible from both stages.

### `property()`

Mutable per-stage local variable. Only valid inside a stack (an `Fn` body):

```ts
Fn( () => {
  const acc = property( 'vec3', 'accumulator' );
  acc.assign( vec3( 0 ) );
  Loop( 10, ( { i } ) => {
    acc.addAssign( i.toFloat() );
  } );
  return acc;
} )();
```

### `toVar()` vs `toConst()`

`toVar()` hoists a node into a named shader local variable so it is evaluated once per invocation, even if used multiple times:
```ts
const depth = texture(tex, uv()).r.toVar('depth');
const effect1 = depth.mul(2);
const effect2 = depth.add(0.1);
// depth is evaluated once in the generated WGSL, reused twice
```

Without `toVar()`, the expression is inlined at every use site — wasteful for expensive computations. There is **no `toConst()`**; use `float()`, `vec3()` etc. for compile-time constants.

---

## 5. Swizzling

Swizzles are **getters** on every node (`TSLCore.js:59-210`). They return cached `SplitNode` instances:

```ts
v.x; v.y; v.z; v.w
v.xy; v.xyz; v.xyzw
v.r; v.g; v.b; v.a             // color channels (same slots)
v.rgb; v.rgba
v.xxxx; v.zyx; v.wwww          // any permutation/repetition of xyzw
```

**Swizzles are read-only.** To write to a subset of a vector, use the `setX` / `setY` / `setZ` / `setW` methods (for single components) or rebuild with `vec3(new_x, old_y, old_z)`.

---

## 6. Math operators and functions

**Operators** (no JS operator overloading — methods only):

| Method | Meaning |
|---|---|
| `a.add(b)` | `a + b` |
| `a.sub(b)` | `a - b` |
| `a.mul(b)` | `a * b` |
| `a.div(b)` | `a / b` |
| `a.mod(b)` | `a % b` |
| `a.pow(b)` | `a ** b` |
| `a.negate()` | `-a` |
| `a.lessThan(b)` / `a.lessThanEqual(b)` | `<`, `<=` |
| `a.greaterThan(b)` / `a.greaterThanEqual(b)` | `>`, `>=` |
| `a.equal(b)` / `a.notEqual(b)` | `==`, `!=` |
| `a.and(b)` / `a.or(b)` / `a.not()` | `&&`, `\|\|`, `!` |

**Compound assignment** (inside `Fn()` only, on `property()` nodes):
`addAssign`, `subAssign`, `mulAssign`, `divAssign`, `modAssign`, `assign`.

**Math functions** — almost all are dual-form (standalone import or chain method):

```
sin, cos, tan, asin, acos, atan, sinh, cosh, tanh
abs, sign, floor, ceil, round, trunc, fract
exp, log, exp2, log2, sqrt, inverseSqrt, pow
min, max, clamp, mix, step, smoothstep
length, distance, dot, cross, normalize, reflect, refract, faceForward
radians, degrees
any, all                                      (bvec reductions — standalone only)
lessThan, lessThanEqual, greaterThan, greaterThanEqual, equal, notEqual  (vector compare)
transpose, determinant, inverse               (matrices)
dFdx, dFdy, fwidth                            (fragment derivatives)
```

```ts
// Equivalent:
sin( x )
x.sin()

mix( a, b, t )
a.mix( b, t )

smoothstep( 0, 1, x )
x.smoothstep( 0, 1 )
```

The chain form reads better for deeply nested expressions; the standalone form reads better for isolated ops.

---

## 7. Control flow

All control flow requires a **stack context**, which is what `Fn()` establishes. Outside an `Fn()` body, `If` / `Loop` / `Break` / `Continue` / `Return` / `property().assign()` will throw.

### `If` / `ElseIf` / `Else`

```ts
Fn( () => {
  const x = property( 'float', 'x' );
  x.assign( 0 );

  If( someCond, () => {
    x.assign( 1 );
  } ).ElseIf( otherCond, () => {
    x.assign( 2 );
  } ).Else( () => {
    x.assign( 3 );
  } );

  return x;
} )();
```

`If` is a **statement**, not an expression — it does not return a value.

### `.select(a, b)` (ternary)

```ts
const result = cond.select( ifTrue, ifFalse );    // expression form
```

Use this for simple ternaries; it produces `select(cond, b, a)` in WGSL or `cond ? a : b` in GLSL.

### `Loop`

```ts
// Count form
Loop( 10, ( { i } ) => {
  // i is an int node, 0..9
} );

// Range + type
Loop( { start: 0, end: 10, type: 'int' }, ( { i } ) => {
  // explicit type
} );

// While (condition form)
Loop( someInt.lessThan( 10 ), () => {
  someInt.addAssign( 1 );
} );

// Nested in one call
Loop( 10, 5, ( { i, j } ) => {
  // i in 0..9, j in 0..4
} );
```

`Break()` and `Continue()` are statement functions — call them for side effect:
```ts
Loop( 100, ( { i } ) => {
  If( i.greaterThan( 50 ), () => Break() );
  // ...
} );
```

### `Return`

Early return from an `Fn()` body:
```ts
const clamp01 = Fn( ( [ x ] ) => {
  If( x.lessThan( 0 ), () => Return() );
  If( x.greaterThan( 1 ), () => Return() );
  return x;
} );
```

### `.discard()` (fragment only)

```ts
Fn( () => {
  const alpha = texture( tex, uv() ).a;
  alpha.lessThan( 0.5 ).discard();
  return vec4( 1 );
} )();
```

---

## 8. `Fn` — function declaration

`Fn(jsFunc, layout?)` (`src/nodes/tsl/TSLCore.js:1058-1084`) creates a reusable shader function. It returns a `Proxy` that is callable and forwards method access to the underlying `FnNode`.

**Four common forms:**

```ts
// 1. Inline, single call site — parameters via array destructuring
const myFn = Fn( ( [ a, b ] ) => a.add( b ) );
const result = myFn( float( 1 ), float( 2 ) );

// 2. With explicit formal function (generates a WGSL function definition)
const myFnTyped = Fn(
  ( [ a, b ] ) => a.add( b ),
  { name: 'myAdd', type: 'float', inputs: [
      { name: 'a', type: 'float' },
      { name: 'b', type: 'float' },
  ] }
);

// 3. Shorthand layout (key-value)
const myFnShort = Fn(
  ( [ a, b ] ) => a.add( b ),
  { a: 'float', b: 'float', return: 'float' }
);

// 4. Destructured parameters (named)
const myFnNamed = Fn( ( { uv, intensity } ) => {
  return texture( tex, uv ).mul( intensity );
} );
myFnNamed( { uv: uv(), intensity: float( 0.5 ) } );
```

**Rules:**
- **Without a layout**, the function body is **inlined** at every call site. Good for short helpers.
- **With a layout**, the function is emitted as a formal shader function definition and called. Better for reuse-heavy code and for controlling recompilation scope.
- The **last expression in the body is the return value**. `return` the node you want to emit.
- A **second parameter** to the callback is the `NodeBuilder`, used rarely for advanced cases (e.g., querying the current stage).
- Call a built `Fn` with **argument nodes** — they can be numbers, but are typed-coerced. Prefer explicit `float(1)` / `vec3(0,0,0)` for clarity.
- **`myFn()` (no args)** applied to a zero-arg `Fn` is the standard pattern when building a material's `vertexNode` or `colorNode`:
  ```ts
  material.colorNode = Fn( () => vec3( 1, 0, 0 ) )();
  ```

---

## 9. Built-in accessors

All from `src/nodes/accessors/*`, re-exported in `src/nodes/TSL.js`.

### Position

| Name | Type | Stage | Description |
|---|---|---|---|
| `positionGeometry` | vec3 | vertex | Raw `attribute('position')` |
| `positionLocal` | vec3 | vertex | Local space (respects morph/skin) |
| `positionWorld` | vec3 | fragment/vertex | Transformed to world space |
| `positionView` | vec3 | fragment/vertex | Transformed to view space |
| `positionWorldDirection` | vec3 | fragment/vertex | Direction from camera to fragment |
| `positionViewDirection` | vec3 | fragment/vertex | View-space direction |

### Normal

| Name | Type | Description |
|---|---|---|
| `normalGeometry` | vec3 | Raw `attribute('normal')` |
| `normalLocal` | vec3 | Local space |
| `normalWorld` | vec3 | World space |
| `normalView` | vec3 | View space |

### Tangent / bitangent

`tangentLocal`, `tangentWorld`, `tangentView`, `bitangentLocal`, `bitangentWorld`, `bitangentView`.

### UV / color

| Name | Type | Description |
|---|---|---|
| `uv(channel = 0)` | vec2 | Geometry UV attribute (0 = `uv`, 1 = `uv1`, ...) |
| `vertexColor` | vec4 | `attribute('color')` |

### Camera

| Name | Type |
|---|---|
| `cameraPosition` | vec3 (world) |
| `cameraViewMatrix` | mat4 |
| `cameraProjectionMatrix` | mat4 |
| `cameraNear` | float |
| `cameraFar` | float |

### Model / object

| Name | Type |
|---|---|
| `modelWorldMatrix` | mat4 |
| `modelViewMatrix` | mat4 |
| `modelNormalMatrix` | mat3 |
| `modelViewProjection` | vec4 (precomputed clip-space position) |

### Screen / viewport (fragment only)

| Name | Type | Description |
|---|---|---|
| `screenUV` | vec2 | Current fragment UV (0..1) |
| `screenCoordinate` | vec2 | Pixel coordinate |
| `screenSize` | vec2 | Viewport size |
| `viewportUV` | vec2 | Same as `screenUV` in most contexts |

### Time / frame

| Name | Type | Updates |
|---|---|---|
| `time` | float | Elapsed seconds; defined in `src/nodes/utils/Timer.js:10` |
| `deltaTime` | float | Seconds since last frame |

### Instancing / compute

| Name | Type | Where |
|---|---|---|
| `instanceIndex` | uint | Vertex stage (for `InstancedMesh`) or compute (global invocation id) |
| `frontFacing` | bool | Fragment only |

---

## 10. Textures

### `texture(tex, uv?, level?, bias?)`

Primary texture sampling (`src/nodes/accessors/TextureNode.js:897`):

```ts
const t = texture( myTexture, uv() );                       // sampled, auto lod
const t = texture( myTexture, uv() ).level( float( 2 ) );   // explicit LOD
const t = texture( myTexture, uv() ).bias( float( 0.5 ) );  // lod bias
const t = texture( myTexture, uv() ).grad( dx, dy );        // explicit gradients
const t = texture( myTexture, uv() ).blur( float( 1 ) );    // mipmap-based blur
const t = texture( myTexture, uv() ).compare( refValue );   // depth comparison
const s = texture( myTexture, uv() ).size( float( 0 ) );    // textureSize at lod 0
const o = texture( myTexture, uv() ).offset( ivec2( 1, 0 ) );  // texel offset
```

**Method chaining clones the node internally** (`TextureNode.js:634-640`); each call returns a new node. Safe to reuse the base.

### `textureLoad(tex, coord)`

Integer-coordinate fetch (no filtering, no mip):

```ts
const px = textureLoad( myTexture, ivec2( 10, 20 ) );
```

Use in compute or when you need pixel-perfect reads.

### `cubeTexture(cube, direction)`

```ts
const sky = cubeTexture( envMap, normalWorld );
```

### Storage textures (compute write targets)

```ts
import { StorageTexture } from 'three/webgpu';
import { textureStore } from 'three/tsl';

const storageTex = new StorageTexture( 512, 512 );

const writeFn = Fn( () => {
  const coord = ivec2( instanceIndex.mod( 512 ), instanceIndex.div( 512 ) );
  textureStore( storageTex, coord, vec4( 1, 0, 0, 1 ) );
} )().compute( 512 * 512, [ 16 ] );

await renderer.computeAsync( writeFn );
```

---

## 11. Storage buffers and GPGPU

### `instancedArray(count, type)`

Creates a per-instance storage buffer you can read/write from compute shaders and sample from graphics shaders.

```ts
import { instancedArray, storage, Fn, instanceIndex, vec3 } from 'three/tsl';

const positions = instancedArray( 1024, 'vec3' );

// Initialize on the CPU
for ( let i = 0; i < 1024; i++ ) {
  positions.array.set( [ Math.random(), Math.random(), Math.random() ], i * 3 );
}
positions.needsUpdate = true;

// Compute shader reads and writes
const integrate = Fn( () => {
  const pos = positions.element( instanceIndex );
  pos.assign( pos.add( vec3( 0, -0.01, 0 ) ) );
} )().compute( 1024, [ 64 ] );

// Each frame
renderer.compute( integrate );

// Use the same buffer in a graphics shader via a material
material.positionNode = positions.element( instanceIndex );
```

### `storage(buffer, type, count)`

Wrap an existing `StorageBufferAttribute`:

```ts
import { StorageBufferAttribute } from 'three/webgpu';
const buf = new StorageBufferAttribute( new Float32Array( 1024 * 4 ), 4 );
const storageNode = storage( buf, 'vec4', 1024 );
```

Convenience chains on storage nodes: `.toReadOnly()`, `.toWriteOnly()`, `.toAttribute()` (for feeding into a vertex shader as an attribute).

### Compute builtins

| Accessor | Type | Meaning |
|---|---|---|
| `instanceIndex` | uint | Global invocation ID |
| `workgroupId` | uvec3 | Current workgroup in dispatch grid |
| `localId` | uvec3 | Thread position within workgroup |
| `globalId` | uvec3 | `workgroupId * workgroupSize + localId` |
| `invocationLocalIndex` | uint | Linear local id |

### Barriers

```ts
import { workgroupBarrier, storageBarrier, textureBarrier } from 'three/tsl';

workgroupBarrier();     // sync threads in current workgroup
storageBarrier();       // sync storage writes across workgroups (WebGPU semantics)
textureBarrier();       // sync storage texture writes
```

### Atomics

```ts
import { atomicAdd, atomicMin, atomicMax, atomicStore, atomicLoad } from 'three/tsl';

const counters = instancedArray( 256, 'uint' );
const incFn = Fn( () => {
  atomicAdd( counters.element( 0 ), 1 );
} )().compute( 1024, [ 64 ] );
```

Atomics are statement functions; they emit a shader call whether or not you capture the return value.

### Workgroup shared memory

```ts
import { workgroupArray } from 'three/tsl';

const sharedBuf = workgroupArray( 'float', 64 );

const sortFn = Fn( () => {
  sharedBuf.element( localId.x ).assign( /* ... */ );
  workgroupBarrier();
  // ... read from sharedBuf ...
} )().compute( 1024, [ 64 ] );
```

### Running compute

```ts
// Sync (must be after init)
renderer.compute( computeNode, dispatchCount? );

// Async
await renderer.computeAsync( computeNode );

// Readback
const data = await renderer.getArrayBufferAsync( buffer );
```

See `src/nodes/gpgpu/ComputeNode.js`. `dispatchCount` can be a scalar (linear), `[x, y]`, `[x, y, z]`, or an `IndirectStorageBufferAttribute` for indirect dispatch.

---

## 12. Plugging TSL into `NodeMaterial`

### Plug-in properties (recommended)

```ts
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform, positionLocal, sin, time, vec3 } from 'three/tsl';

const material = new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.8 });

const amplitude = uniform( 0.1 );
material.positionNode = positionLocal.add(
  vec3( 0, sin( time.mul( 2 ) ).mul( amplitude ), 0 )
);

// Every frame — does NOT recompile
amplitude.value = 0.1 + 0.05 * Math.sin( performance.now() * 0.001 );
```

**Plug-in properties preserve lighting, fog, shadows, and tonemapping.** Use them for 80% of customizations.

### Full `fragmentNode` override

```ts
import { NodeMaterial } from 'three/webgpu';
import { Fn, texture, uv, vec4 } from 'three/tsl';

const material = new NodeMaterial();
material.fragmentNode = Fn( () => {
  return vec4( texture( myTex, uv() ).rgb, 1 );
} )();
```

**`fragmentNode` replaces the entire fragment stage** — no lighting, no fog, no post-processing. Returns vec4 RGBA.

### Full `vertexNode` override

```ts
import { NodeMaterial } from 'three/webgpu';
import { Fn, modelViewProjection } from 'three/tsl';

const material = new NodeMaterial();
material.vertexNode = Fn( () => modelViewProjection )();
```

Must return vec4 clip-space position.

### Shadow-related plug-ins

```ts
material.castShadowNode = vec4( shadowColor.rgb, shadowAlpha );
material.castShadowPositionNode = displacedPosition;
material.maskShadowNode = someFloat.greaterThan( 0.5 );
material.receivedShadowNode = Fn( ( [ color ] ) => color.mul( 0.5 ) );
```

`castShadowNode` requires `renderer.shadowMap.transmitted = true`.

---

## 13. Post-processing with `pass()`

```ts
import { PostProcessing } from 'three/webgpu';
import { pass, mrt } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const postProcessing = new PostProcessing( renderer );

// Build a pass that renders the scene
const scenePass = pass( scene, camera );
const sceneColor = scenePass.getTextureNode( 'output' );

// Optional: multiple render targets
scenePass.setMRT( mrt( {
  output: /* color output */,
  emissive: /* emissive node */,
} ) );
const emissiveTex = scenePass.getTextureNode( 'emissive' );

// Compose effects
const bloomed = bloom( sceneColor, 0.8, 0.5 );

// Final output
postProcessing.outputNode = sceneColor.add( bloomed );

// Render loop — DO NOT call renderer.render(scene, camera) manually
renderer.setAnimationLoop( () => {
  postProcessing.render();
} );
```

Notes:
- `pass()` is `src/nodes/display/PassNode.js:1012`. It creates a `PassNode` that renders its `scene` + `camera` into an internal render target.
- `postProcessing.outputNode` is the root of the post-processing graph. Set it once.
- `postProcessing.render()` handles all nested passes.

---

## 14. Reflections with `reflector()`

```ts
import { Mesh, PlaneGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import { reflector, mix, vec3 } from 'three/tsl';

const material = new MeshStandardNodeMaterial({ roughness: 0, metalness: 1 });

const mirror = reflector();                             // creates RTT + virtual camera
mirror.target.rotateX( -Math.PI / 2 );                  // align to plane
mirror.reflector.resolutionScale = 0.5;                 // cheaper reflections

const plane = new Mesh( new PlaneGeometry( 10, 10 ), material );
plane.add( mirror.target );                             // CRITICAL: add to scene graph

material.colorNode = mix( vec3( 0.05, 0.1, 0.2 ), mirror.rgb, 0.9 );
```

- `reflector()` is `src/nodes/utils/ReflectorNode.js:627`.
- **Must add `mirror.target` to the scene graph** or the virtual camera's world matrix never updates.
- `mirror.uvNode` is mutable — distort it for water-like ripples:
  ```ts
  mirror.uvNode = mirror.uvNode.add( distortion );
  ```

---

## 15. Debugging

- **Inspect generated WGSL**: open the browser DevTools WebGPU tab. Each pipeline has a "Module" entry with the compiled source.
- **Label nodes for debugging**: `myUniform.setName( 'myLabel' )` shows up in the output.
- **Warnings are routed through three.js's console function**: use `setConsoleFunction` (see `common-patterns-and-helpers.md` §9) to capture them.
- **`NodeMaterial` compile errors** are reported synchronously from `setup(builder)`. If a TSL expression has a type mismatch, you will see it on first frame.
- **Stale pipelines**: if you reassign a plug-in node, the old pipeline is abandoned and GC'd with the material. Not a leak, but a perf hit on the next draw.

---

## 16. Non-obvious gotchas

1. **JS arithmetic on nodes produces strings.** `vec3(1,0,0) + vec3(0,1,0)` evaluates to something like `"[object Object][object Object]"`. Always use `.add()`, `.sub()`, etc.
2. **Fn without layout is inlined; with layout is a function.** The layout form is required when you want the compiler to deduplicate calls or when you care about WGSL function boundaries.
3. **`currentStack` is global.** `.assign()`, `If`, `Loop`, `Break`, `Return` all read a module-level `currentStack` variable (`TSLCore.js:14, 1088-1100`). Outside a `Fn()` body it is `null` and these calls throw.
4. **`varyingProperty()` assignments must be in the vertex stage.** Assigning in fragment compiles but behaves as undefined — fragments cannot write to varyings.
5. **Swizzles are getters, not methods.** `v.xyz` works; `v.xyz()` errors.
6. **`texture()` chained calls clone the node.** `tex.level(2).bias(0.5)` does not mutate `tex`; it returns a new node. Reusable.
7. **`Loop` with a `while`-style condition reads the condition every iteration in compiled shader semantics.** If the condition captures a mutating `property()`, mutate it inside the body or you get an infinite loop.
8. **Atomic ops only synchronize atomic reads/writes.** Regular reads/writes are not ordered. Use `storageBarrier()` before reading a value another thread may have updated non-atomically.
9. **`workgroupBarrier()` only synchronizes within a workgroup.** Cross-workgroup sync requires `storageBarrier()` plus guaranteed ordering at the dispatch level.
10. **Changing `material.colorNode = ...` invalidates the compiled pipeline.** Reassigning plug-in nodes triggers recompilation. Avoid in hot loops.
11. **`uniform(value)` creates a new node each call.** Two `uniform(1.0)` calls are independent — writing `.value` on one does not affect the other. Cache the reference.
12. **Compute dispatch counts must be multiples of workgroup size** or you need an early-out guard:
    ```ts
    Fn( () => {
      If( instanceIndex.greaterThanEqual( count ), () => Return() );
      // ... real work ...
    } )().compute( count, [ 64 ] );
    ```
13. **`positionNode` displacement breaks CPU-side bounding spheres.** Frustum culling uses the CPU sphere; your displaced mesh will clip at the edges. Set `frustumCulled = false` or grow the sphere.
14. **`instanceIndex` means different things in different stages.** In a vertex shader with an `InstancedMesh`, it is the instance; in a compute shader, it is the global invocation. Read in context.
15. **Cached const nodes**: small int/float/bool constants are cached (`TSLCore.js:829-867`) — `float(0) === float(0)` is true, but `float(1.7) === float(1.7)` is false. Do not rely on identity equality for larger constants.
16. **`storage(buffer).toAttribute()` feeds a storage buffer as a vertex attribute.** This is the only path from a compute-written buffer to per-vertex data without readback. It's how particles animate on-GPU.
17. **`receivedShadowNode` is a function, not a node.** Assign `Fn(([color]) => ...)`, not a plain vec4 (`NodeMaterial.js:1344` handling).
18. **`pass()` captures `scene` and `camera` by reference.** Modifying the scene between post-processing frames works; swapping the scene reference does not — create a new `pass()`.
19. **Node-graph identity matters for caching.** Two visually-equivalent graphs produce two distinct pipelines. Reuse node references when you want pipeline cache hits.
20. **`Fn` proxies cannot be `JSON.stringify`'d.** They are live `Proxy` objects with non-serializable state. Save the factory JS, not the built node.

---

## 17. Anti-patterns

- **Rebuilding TSL graphs every frame.** Forces recompile; tanks FPS.
- **Reassigning `material.colorNode` to animate** instead of using a `uniform()`.
- **`a + b` on nodes.** Silently wrong. Always `.add()`.
- **Mixing `Fn()` bodies across stages.** A vertex-stage `Fn` cannot reference fragment-only nodes like `screenUV` and vice versa. Split them.
- **Forgetting to add `reflector.target` to the scene graph.** Mirror never updates.
- **Using `const myConst = float(1.5)` inside a hot loop.** Hoist constants outside; they are shared anyway.
- **Calling `renderer.render(scene, camera)` inside a `PostProcessing.render()` loop.** Double renders.
- **Calling `.dispose()` on a node material while meshes still reference it.** Next draw crashes.
- **Using raw WGSL via `CodeNode`** for something TSL supports natively. `CodeNode` exists (`src/nodes/code/CodeNode.js`) but should be a last resort — it bypasses type checking and cache key generation.
- **Returning nothing from an `Fn()` used as a `colorNode`.** The node type will be `void` and the compile will error obliquely. Always return an explicit vec3/vec4.
- **Assuming TSL types match WGSL types 1:1.** `color()` is `vec3` in WGSL but annotated `'color'` internally for colorspace tracking. Use `toVec3()` if you hit a type mismatch.

---

## 18. Quick-reference cheatsheet

```ts
// Setup
import { Fn, uniform, texture, Loop, If, positionLocal, normalWorld, uv, time,
         vec3, vec4, float, mix, sin } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

// Uniforms
const tint = uniform( vec3( 1, 0, 0 ) );
const intensity = uniform( 1 );

// Graph
const displaced = positionLocal.add( normalWorld.mul( sin( time ).mul( 0.1 ) ) );

const material = new MeshStandardNodeMaterial( { roughness: 0.5 } );
material.positionNode = displaced;
material.colorNode = mix(
  texture( myTex, uv() ).rgb,
  tint,
  intensity.mul( sin( time ).mul( 0.5 ).add( 0.5 ) )
);

// Per-frame update — NO recompile
renderer.setAnimationLoop( () => {
  intensity.value = performance.now() * 0.0001;
  renderer.render( scene, camera );
} );

// Fn-based reusable helper
const fresnel = Fn( ( [ n, v, power ] ) => {
  return float( 1 ).sub( n.dot( v ).max( 0 ) ).pow( power );
} );

// Compute
import { instancedArray, instanceIndex, compute } from 'three/tsl';
const buf = instancedArray( 1024, 'vec4' );
const kernel = Fn( () => {
  const p = buf.element( instanceIndex );
  p.assign( p.add( vec4( 0, -0.01, 0, 0 ) ) );
} )().compute( 1024, [ 64 ] );

renderer.compute( kernel );
```
