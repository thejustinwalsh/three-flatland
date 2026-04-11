# GLSL to TSL Migration

**If you are writing GLSL, you are using the wrong API.** TSL replaces GLSL entirely. Every GLSL pattern has a TSL equivalent.

## Step 1: Run GLSL Through the Transpiler

**Before manually porting any GLSL, run it through Three.js's built-in transpiler.** This gives you the correct TSL patterns and catches coordinate convention issues.

```bash
# Create a test script (needs three.js installed)
cat > transpile.mjs << 'EOF'
import GLSLDecoder from 'three/examples/jsm/transpiler/GLSLDecoder.js'
import TSLEncoder from 'three/examples/jsm/transpiler/TSLEncoder.js'

const glsl = `YOUR GLSL HERE`

const decoder = new GLSLDecoder()
const encoder = new TSLEncoder()
encoder.iife = false
const ast = decoder.parse(glsl)
console.log(encoder.emit(ast))
EOF
node transpile.mjs
```

**Requirements:** Full shader with `void main()`. Standalone functions won't parse — wrap them.

**The transpiler output is a starting point, not final code.** You still need to:
- Replace `getWorldPos` with `getViewPosition()` (handles WebGL/WebGPU depth differences)
- Flip Y in projected UVs for WebGPU: `float(1).sub(projectedY)` 
- Use TempNode pattern for PostProcessing effects (transpiler doesn't know about this)
- WebGPU clip Z is 0..1 after perspective divide (NOT -1..1 like WebGL)

## Step 2: Adapt for Execution Context

The transpiler outputs vanilla TSL. Adapt based on where the shader runs:
- **Material node:** Use directly with `material.colorNode = Fn(() => { ... })()`
- **PostProcessing TempNode:** Wrap in TempNode pattern, use `depthNode.sample(uv)` for depth access

## GLSL Habits → TSL Equivalents

| GLSL Habit | TSL Replacement |
|------------|-----------------|
| `ShaderMaterial({ vertexShader, fragmentShader })` | `MeshStandardNodeMaterial` with `.positionNode`, `.colorNode` |
| `onBeforeCompile` | Set `.colorNode`, `.positionNode`, etc. directly |
| Raw GLSL strings | `Fn(() => { ... })()` node builders |
| `uniform float uTime;` | `const uTime = uniform(0.0)` then `uTime.value = t` |
| `varying vec2 vUv;` | `varying(expression, 'name')` or just `uv()` |
| `attribute vec3 aPosition;` | `attribute<'vec3'>('aPosition', 'vec3')` |
| `#include <common>` | Not needed — built-in nodes handle this |
| `#define PI 3.14159` | `const PI = float(Math.PI)` |
| `gl_Position = ...` | `material.positionNode = ...` |
| `void main() { ... }` | `Fn(() => { ... })()` |
| `float x = 1.0; x += 2.0;` | `const x = float(1.0).toVar(); x.addAssign(2.0)` |
| `if (x > 0.5) { ... }` | `If(x.greaterThan(0.5), () => { ... })` |
| `x > 0.5 ? a : b` | `select(x.greaterThan(0.5), a, b)` |
| `for (int i = 0; i < 10; i++)` | `Loop(10, ({ i }) => { ... })` |
| `mat2(a, b, c, d)` | Manual rotation: `rx = px*cos - py*sin`, `ry = px*sin + py*cos` — `mat2()` only takes `Matrix2` or `Node` |
| `texture2D(tex, uv)` | `texture(tex, uv)` |
| `gl_FragColor = ...` | `material.fragmentNode = ...` |

## Built-in Variable Mapping

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

## Example: Typed Material Shader

```ts
import * as THREE from 'three/webgpu'
import { Fn, uniform, vec3, vec4, float, time,
         normalWorld, positionWorld, positionLocal, cameraPosition,
         mix, pow, dot, normalize, max, sin } from 'three/tsl'

const baseColor = uniform(new THREE.Color(0x4488ff))
const fresnelPower = uniform(3.0)

const material = new THREE.MeshStandardNodeMaterial()

material.colorNode = Fn(() => {
  const viewDir = normalize(cameraPosition.sub(positionWorld))
  const NdotV = max(dot(normalWorld, viewDir), 0.0)
  const fresnel = pow(float(1.0).sub(NdotV), fresnelPower)
  const finalColor = mix(baseColor, vec3(1, 1, 1), fresnel)
  return vec4(finalColor, 1.0)
})()

material.positionNode = Fn(() => {
  const pos = positionLocal.toVar()
  pos.y.addAssign(sin(pos.x.mul(4.0).add(time.mul(2.0))).mul(0.1))
  return pos
})()
```
