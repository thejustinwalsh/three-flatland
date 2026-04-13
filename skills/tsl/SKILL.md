---
name: tsl
description: Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with three/tsl imports, or debugging shader node graphs
---

# TSL (Three.js Shading Language)

**TSL is the CURRENT Three.js shader system (r150+). It replaces GLSL shaders, `onBeforeCompile`, and `ShaderMaterial`. All modern Three.js shader work uses TSL.**

## STOP — Read Before Writing Any Shader Code

Your training data contains 10+ years of GLSL patterns. **None of those apply here.**

- **No GLSL strings.** No `vertexShader:`, no `fragmentShader:`, no `#include`.
- **No `ShaderMaterial`.** Use `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`, etc.
- **No `onBeforeCompile`.** Node materials have `.colorNode`, `.positionNode`, etc.
- **No `WebGLRenderer`.** TSL targets `WebGPURenderer` via `three/webgpu`.
- **No `three/nodes`.** Deprecated. Use `three/tsl`.

## What TSL Actually Is

TSL is TypeScript/JavaScript that builds GPU shader **node graphs**. Code executes at **two distinct times**:

- **Build time**: TypeScript runs once, constructing a node graph
- **Run time**: Compiled WGSL executes per-pixel/vertex on GPU every frame

```ts
if (material.transparent) { return transparentShader }    // BUILD TIME — JS, runs once
If(value.greaterThan(0.5), () => { result.assign(1.0) })  // RUN TIME — GPU, every pixel
```

## Imports

```ts
import * as THREE from 'three/webgpu'           // NOT 'three'
import { Fn, vec3, float, uniform } from 'three/tsl'  // NOT 'three/nodes'

import type Node from 'three/src/nodes/core/Node.js'           // type imports from source path
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
```

**`await renderer.init()`** before any render or compute. Skipping is silent — nothing renders.

## Core Rules

### Nodes are immutable — use `.toVar()` to modify

```ts
const pos = positionLocal.toVar()       // mutable
pos.y.assign(pos.y.add(1))              // .assign(), .addAssign(), .mulAssign()
```

### Method chains for math — NOT operators

```ts
const result = a.add(b.mul(c))          // NOT: a + b * c
a.greaterThan(b)                        // NOT: a > b
```

### Capital `If` for GPU conditionals

```ts
If(cond, () => { ... })                 // GPU per-pixel — capital I
select(cond, valueIfTrue, valueIfFalse) // branchless ternary (preferred)
step(edge, x)  mix(a, b, t)  smoothstep(e0, e1, x)  // branchless math (fastest)
```

### Uniforms update via `.value`

```ts
const speed = uniform(1.0)              // UniformNode<'float', number>
speed.value = 2.0                       // GPU sees update instantly — NO recompile
```

### Fn() needs trailing `()` to invoke

```ts
material.colorNode = Fn(() => { return color })()  // <-- the ()
```

### Uniforms vs compile-time constants

```ts
const radius = uniform(5.0)  // Runtime — change .value freely
const SAMPLES = 16            // Compile-time — change requires shader rebuild
```

**Uniforms** for tuning knobs (radius, intensity, color). **Constants** for structural params (sample count, number of passes).

### Build-time vs run-time loops

```ts
// JS for-loop → unrolls at compile time (fixed count, pre-computed data)
for (let i = 0; i < samples.length; i++) { ... }

// TSL Loop() → GPU loop instruction (dynamic count from uniform)
Loop(count, ({ i }) => { ... })
```

## GLSL → TSL Transpiler

**The most valuable tool for porting shaders.** Run GLSL through the transpiler before guessing:

```ts
import GLSLDecoder from 'three/examples/jsm/transpiler/GLSLDecoder.js'
import TSLEncoder from 'three/examples/jsm/transpiler/TSLEncoder.js'

const decoder = new GLSLDecoder()
const encoder = new TSLEncoder()
encoder.iife = false
const ast = decoder.parse(glslString)  // requires void main()
console.log(encoder.emit(ast))
```

**Handles:** `texture2D` → `.sample()`, math operators → method chains, uniforms, loops.
**Does NOT handle:** WebGL vs WebGPU depth conventions, `getViewPosition`/`getScreenPosition` helpers, TempNode orchestration.

**Workflow:** Transpile → adapt for WebGPU (Y flip, clip Z 0..1 not -1..1) → verify visually.

## Two Execution Contexts

| | Material Nodes | PostProcessing |
|---|---|---|
| Runs on | Per-fragment with geometry | Fullscreen quad after scene renders |
| Depth access | N/A (you ARE the geometry) | `depthNode.sample(uv)` |
| Complex effects | Just assign node | Needs TempNode + own RenderTarget |

Screen-space effects that sample neighbors (AO, blur, edge detection) **need the TempNode pattern** — see [postprocessing.md](postprocessing.md).

## Common Error Patterns

| Error | GLSL/JS Instinct | TSL Way |
|-------|-------------------|---------|
| "If is not defined" | `if(cond, fn)` | `If(cond, fn)` — capital I |
| Cannot assign to node | `v.x = 5` | `v.x.assign(5)` after `.toVar()` |
| Uniform not changing | `u = val` | `u.value = val` |
| Nothing renders | Render before init | `await renderer.init()` |
| Import not found | `'three/nodes'` or `'three'` | `'three/tsl'` and `'three/webgpu'` |
| Attribute type error | `attribute('n', 'vec4')` | `attribute<'vec4'>('n', 'vec4')` |
| Depth texture empty | `depthNode.value` | `depthNode.sample(uv).r` |
| Screen-space black/white | Inline in PostProcessing | TempNode + RenderTarget |
| `.add()` not found | Cast to bare `Node` | Keep `Node<'vec2'>` — don't lose generic |
| mat2(a,b,c,d) | GLSL 4-arg mat2 | Manual 2D rotation — TSL `mat2()` only takes `Matrix2` |

## Reference Files

| File | Contents |
|------|----------|
| [nodes.md](nodes.md) | Type constructors, operators, math, uniforms, Fn(), attributes, conditionals, loops, shader inputs, NodeMaterials, textures |
| [postprocessing.md](postprocessing.md) | pass(), MRT, depth access, TempNode pattern, WebGPU depth conventions, ping-pong, MSAA gotcha, GTAO+Denoise example |
| [compute.md](compute.md) | Storage buffers, compute shaders, compute-to-render pipeline |
| [typescript.md](typescript.md) | tsconfig, TempNode subclassing in TS, known @types/three gaps + workarounds |
| [migration.md](migration.md) | GLSL→TSL transpiler workflow, habit mapping tables, built-in variable mapping |

## Summary — TSL Rules

1. **`'three/tsl'`** and **`'three/webgpu'`**. Not `'three/nodes'`. Not `'three'`.
2. **`await renderer.init()`** before any render or compute.
3. **`.toVar()`** then **`.assign()`** to modify nodes. Never `=`.
4. **`.add()`, `.mul()`** for math. Not `+`, `*`.
5. **Capital `If`** for GPU conditionals. Lowercase `if` is build-time only.
6. **`uniform.value = x`** to update. Not `uniform = x`.
7. **`Fn(() => { ... })()`** — trailing `()` to invoke.
8. **`attribute<'vec4'>(...)`** — explicit generic for @types/three >= 0.183.
9. **`depthNode.sample(uv)`** for PostProcessing depth. Never `.value`.
10. **TempNode + RenderTarget** for screen-space effects. Can't inline.
11. **Transpile GLSL first** — don't guess depth conventions.
12. **`screenSize`** for dynamic resolution. Never hardcode `window.innerWidth`.

<!-- Sources:
  - https://threejsroadmap.com/blog/getting-ai-to-write-tsl-that-works
  - https://github.com/three-types/three-ts-types (issue #2049)
  - https://threejs.org/examples/webgpu_tsl_transpiler.html
-->
