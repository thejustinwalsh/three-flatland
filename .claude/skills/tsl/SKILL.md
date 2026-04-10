---
name: tsl
description: Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with three/tsl imports, or debugging shader node graphs
---

# TSL (Three.js Shading Language)

## Overview

TSL is JavaScript that builds GPU shader node graphs. The critical mental model: code executes at **two times** — JavaScript runs at **build time** to construct the node graph, then compiled WGSL executes on the GPU at **run time**.

```js
// BUILD TIME: JavaScript conditional (runs once when shader compiles)
if (material.transparent) { return transparent_shader; }

// RUN TIME: TSL conditional (runs every pixel/vertex on GPU)
If(value.greaterThan(0.5), () => { result.assign(1.0); });
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

```js
import * as THREE from 'three/webgpu';
import { Fn, vec3, float, uniform, /* ... */ } from 'three/tsl';
```

**CRITICAL:** Always `await renderer.init()` before first render or compute.

## Essential Patterns

### Variables — Immutable by Default

```js
// WRONG: Cannot modify immutable node
const pos = positionLocal;
pos.y = pos.y.add(1);  // ERROR

// CORRECT: Use .toVar() for mutable variable
const pos = positionLocal.toVar();
pos.y.assign(pos.y.add(1));  // OK
```

### Fn() Functions

```js
const myFn = Fn(([a, b, c]) => { return a.add(b).mul(c); });

// Object params with defaults
const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => {
  return color.mul(intensity);
});

// Build context access (second param)
const myFn = Fn(([input], { material, geometry, object, camera }) => {
  if (material.transparent) { return input.mul(0.5); } // JS conditional = build time
  return input;
});
```

### Conditionals — Capital I

```js
// WRONG: lowercase 'if' is JavaScript
if(condition, () => {})

// CORRECT: TSL If (inside Fn())
If(a.greaterThan(b), () => {
  result.assign(a);
}).Else(() => {
  result.assign(b);
});

// Preferred: select() works outside Fn()
const result = select(condition, valueIfTrue, valueIfFalse);

// Branchless (best performance)
mix(valueA, valueB, step(threshold, selector))
```

### Uniforms

```js
const u = uniform(0.5);          // create
u.value = newValue;              // update from JS (NOT: u = newValue)
u.onFrameUpdate(() => value);    // auto-update callback
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

## Quick Patterns

```js
// Fresnel
const NdotV = normalize(cameraPosition.sub(positionWorld)).dot(normalWorld).max(0);
const fresnel = pow(float(1).sub(NdotV), 5);

// Wave displacement
const p = positionLocal.toVar();
p.y.addAssign(sin(p.x.mul(5).add(time)).mul(0.2));

// UV scroll
material.colorNode = texture(map, uv().add(vec2(time.mul(0.1), 0)));

// Circular mask (sprites/points)
const dist = length(uv().sub(0.5).mul(2.0));
const circle = smoothstep(float(1.0), float(0.8), dist);
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
