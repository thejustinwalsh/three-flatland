# TSL PostProcessing Reference

**PostProcessing is where TSL gets dangerous.** Material nodes (`.colorNode`, `.positionNode`) work intuitively — you assign a node and it runs per-fragment. PostProcessing has hidden rules that will produce black screens, white screens, or red screens if you don't follow the correct patterns.

This reference was written after 6 failed iterations trying to port N8AO SSAO to TSL. Every rule here was learned from a real failure.

## The Two Execution Contexts

TSL code runs in **two completely different contexts**. Confusing them is the #1 source of PostProcessing bugs.

| | Material Nodes | PostProcessing |
|---|---|---|
| **Runs on** | Per-fragment with geometry context | Fullscreen quad after scene renders |
| **Has access to** | `positionLocal`, `normalWorld`, `uv()`, etc. | `screenUV`, scene textures via `pass()` |
| **Texture sampling** | `texture(tex, anyUV)` works freely | Complex effects need own render pass |
| **Depth access** | N/A (you ARE the geometry) | `depthNode.sample(uv)` — see rules below |
| **Example** | `material.colorNode = myNode` | `postProcessing.outputNode = myNode` |

**Rule:** If your effect samples depth or normals at neighbor pixels (AO, blur, edge detection), you CANNOT inline it into `PostProcessing.outputNode`. You need the TempNode custom pass pattern.

## Setting Up a PostProcessing Pipeline

```ts
import { pass, mrt, output, normalView, screenUV } from 'three/tsl'

// 1. Render scene → textures
const scenePass = pass(scene, camera)

// 2. MRT for multiple outputs (color + normals)
scenePass.setMRT(mrt({
  output: output,           // scene color
  normal: normalView,       // view-space normals (for AO, etc.)
}))

// 3. Access the results as TextureNodes
const scenePassColor = scenePass.getTextureNode('output')
const scenePassNormal = scenePass.getTextureNode('normal')
const scenePassDepth = scenePass.getTextureNode('depth')

// 4. Wire up PostProcessing
const postProcessing = new THREE.PostProcessing(renderer)
postProcessing.outputNode = scenePassColor  // or your effect chain
```

## CRITICAL: Depth Access Rules

**This WILL bite you.** There are multiple ways to access depth. Most don't work the way you expect.

| Method | Returns | Arbitrary UV? | Use for |
|--------|---------|--------------|---------|
| `scenePass.getTextureNode('depth')` | `TextureNode` | **YES** via `.sample(uv)` | Sampling depth at neighbor pixels |
| `scenePass.getLinearDepthNode()` | `Node<'float'>` | NO — current fragment only | Linear depth at current pixel |
| `scenePass.getViewZNode()` | `Node<'float'>` | NO — current fragment only | View-space Z at current pixel |
| `depthTextureNode.value` | raw `Texture` | **BROKEN — returns empty** | **DO NOT USE** |

### How to Read Depth at Any Screen Position

```ts
const depthNode = scenePass.getTextureNode('depth')

// At current fragment (simple)
const myDepth = depthNode.sample(screenUV).r

// At neighbor pixel (for AO, blur, edge detection)
const neighborDepth = depthNode.sample(screenUV.add(offset)).r
```

**WARNING:** `depthNode.value` returns an empty texture in PostProcessing context. This looks like a Three.js bug or intentional design — the underlying texture isn't populated until render time. Always use `.sample()`.

## Built-in PostProcessing Helpers

These are exported from `three/tsl` and handle view-space math correctly:

```ts
import {
  getViewPosition,    // (uv, depth, invProjMatrix) → Node<'vec3'>
  getScreenPosition,  // (viewPos, projMatrix) → Node<'vec2'>
  getNormalFromDepth,  // (uv, depthNode, invProjMatrix) → Node<'vec3'>
  screenSize,          // Node<'vec2'> — viewport dimensions in pixels (dynamic)
  convertToTexture,    // (node) → RTTNode — renders node to intermediate texture
  pass,                // (scene, camera) → PassNode
  mrt,                 // ({output, normal, ...}) → MRTNode
  passTexture,         // (passNode, texture) → PassTextureNode
} from 'three/tsl'
```

**`screenSize`** is essential — use it for dynamic texel sizes, never hardcode `window.innerWidth`:
```ts
const texelSize = vec2(float(1).div(screenSize.x), float(1).div(screenSize.y))
```

## Official TSL Effect Nodes

Three.js ships ready-to-use PostProcessing effects. Import from `three/addons/tsl/display/` (NOT `three/tsl`):

```ts
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'
```

### Complete GTAO + Denoise Example

This is the pattern that **actually works** — verified in StackBlitz:

```ts
import * as THREE from 'three/webgpu'
import { pass, mrt, output, normalView, vec4, float } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'

await renderer.init()

// Scene pass with MRT
const scenePass = pass(scene, camera)
scenePass.setMRT(mrt({ output: output, normal: normalView }))

const scenePassColor = scenePass.getTextureNode('output')
const scenePassNormal = scenePass.getTextureNode('normal')
const scenePassDepth = scenePass.getTextureNode('depth')

// GTAO — ambient occlusion
const aoPass = ao(scenePassDepth, scenePassNormal, camera)
aoPass.radius.value = 2.0          // AO radius (view-space)
aoPass.thickness.value = 2.0       // thickness
aoPass.distanceFallOff.value = 1.0
aoPass.distanceExponent.value = 2.0
aoPass.scale.value = 2.0           // intensity multiplier
aoPass.samples.value = 16
aoPass.resolutionScale = 0.5       // halfRes for performance

// Denoise — Poisson bilateral filter
const denoised = denoise(
  aoPass.getTextureNode(),
  scenePassDepth,
  scenePassNormal,
  camera
)
denoised.lumaPhi.value = 5
denoised.depthPhi.value = 5
denoised.normalPhi.value = 5
denoised.radius.value = 12

// IMPORTANT: AO result is in .r channel only (RedFormat render target)
// @ts-expect-error — .r exists at runtime via Node extensions
const aoValue = denoised.r

// Composite: multiply scene color by AO
const postProcessing = new THREE.PostProcessing(renderer)
postProcessing.outputNode = vec4(
  scenePassColor.r.mul(aoValue),
  scenePassColor.g.mul(aoValue),
  scenePassColor.b.mul(aoValue),
  float(1)
)
```

### Multi-Pass Denoise (Critical for Quality)

A single denoise pass leaves visible grain. N8AO uses 2 iterations with different sample rotation indices. Chain two DenoiseNodes:

```ts
// Iteration 1
const denoise1 = denoise(aoPass.getTextureNode(), scenePassDepth, scenePassNormal, camera)
denoise1.radius.value = 12
denoise1.index.value = 0  // rotation index for sample pattern

// Iteration 2 — chains off the first
const denoise2 = denoise(denoise1, scenePassDepth, scenePassNormal, camera)
denoise2.radius.value = 12
denoise2.index.value = 1  // different rotation = covers gaps from pass 1
```

Each pass rotates the Poisson sampling disk differently, so the second pass fills in the noise the first one missed.

### WebGPU vs WebGL Depth Conventions

**This is the #1 porting trap.** GLSL shaders assume WebGL conventions. TSL targets WebGPU. The depth handling is different:

| | WebGL | WebGPU |
|---|---|---|
| Clip Z range (after /w) | -1 to 1 | 0 to 1 |
| Depth buffer range | 0 to 1 | 0 to 1 |
| NDC to depth | `z * 0.5 + 0.5` | `z` (already 0..1) |
| UV Y direction | Bottom-up | Top-down (flipped) |

**When porting N8AO-style manual projection:**
```ts
// Project view-space position to clip space
const offset = projMat.mul(vec4(pos.x, pos.y, pos.z, float(1))).toVar()

// XY: NDC → UV (same as WebGL but Y is flipped for WebGPU)
const projectedUV = vec2(
  offset.x.div(offset.w).mul(0.5).add(0.5),
  float(1).sub(offset.y.div(offset.w).mul(0.5).add(0.5))  // Y FLIP
)

// Z: WebGPU clip Z is ALREADY 0..1 — do NOT apply * 0.5 + 0.5
const projectedZ = offset.z.div(offset.w)  // already 0..1
```

**Use `getViewPosition()` for depth→position reconstruction** — it handles the WebGL/WebGPU difference automatically. Only do manual projection for the FORWARD direction (position→screen).

### MSAA Incompatibility with TempNodes

`antialias: true` (MSAA, sampleCount=4) is **incompatible** with custom TempNode render targets (sampleCount=1). You'll get:

```
Attachment state of [RenderPipeline] is not compatible with [RenderPassEncoder].
sampleCount: 4 vs sampleCount: 1
```

**Fix:** Disable antialias on the renderer when using custom TempNodes. Use FXAA/TAA post-process instead if AA is needed.

### Ping-Pong for Multi-Iteration Effects

Multiple TempNode instances reading each other's outputs causes WebGPU texture synchronization errors:

```
[Texture] usage (TextureBinding|RenderAttachment) includes writable usage and another usage in the same synchronization scope.
```

**Fix:** Handle multiple iterations inside a SINGLE TempNode's `updateBefore()` using ping-pong render targets:

```ts
// Two render targets for ping-pong
_targetA = new RenderTarget(1, 1)
_targetB = new RenderTarget(1, 1)

updateBefore(frame) {
  for (let i = 0; i < this.iterations; i++) {
    const isEven = i % 2 === 0
    const material = isEven ? this._materialA : this._materialB
    const target = isEven ? this._targetA : this._targetB
    quadMesh.material = material
    renderer.setRenderTarget(target)
    quadMesh.render(renderer)
  }
  // Output from whichever target was last written
  this._textureNode.value = (this.iterations % 2 === 1)
    ? this._targetA.texture : this._targetB.texture
}
```

Material A reads from the initial input, material B reads from target A. Each render pass completes before the next starts.

### mat2 Constructor Limitation

TSL's `mat2()` only accepts `Matrix2` or a single `Node` — NOT 4 individual components like GLSL's `mat2(a, b, c, d)`. Do manual 2D rotation instead:

```ts
// WRONG — TSL mat2 doesn't take 4 args
const rotMat = mat2(cosA, sinA.negate(), sinA, cosA)

// CORRECT — manual 2D rotation
const rotX = float(px).mul(cosA).sub(float(py).mul(sinA))
const rotY = float(px).mul(sinA).add(float(py).mul(cosA))
```

### Common Gotchas

**Screen-space radius + halfRes:** When both are enabled, halve the radius. The resolution uniform reflects the half-res target, so pixel-based radius needs adjustment: `trueRadius = radius * 0.5`.

**Red screen from AO:** GTAONode renders to a `RedFormat` render target. Only `.r` has data. Displaying the texture directly shows red because G and B are 0. Fix: extract `.r` and spread to RGB.

**Black screen:** AO intensity too high — every pixel reads as fully occluded. Start with low intensity values and increase.

**White screen:** Depth not reaching the AO shader. Verify depth works first by visualizing `scenePass.getLinearDepthNode()`.

## The TempNode Custom Pass Pattern

**When you need a custom screen-space effect** that samples depth at neighbor UVs (AO, blur, edge detection, SSAO), you MUST use this pattern. You cannot inline it into `PostProcessing.outputNode`.

GTAONode and DenoiseNode both use this pattern internally:

```ts
import { TempNode, QuadMesh, NodeMaterial, RenderTarget, NodeUpdateType } from 'three/webgpu'
import { Fn, passTexture } from 'three/tsl'

class MyEffectNode extends TempNode {
  updateBeforeType = NodeUpdateType.FRAME
  _renderTarget = new RenderTarget(1, 1)
  _material = new NodeMaterial()
  _textureNode = passTexture(this, this._renderTarget.texture)
  _quadMesh = new QuadMesh()

  getTextureNode() { return this._textureNode }

  updateBefore(frame) {
    const { renderer } = frame
    // Resize to match screen
    const size = renderer.getDrawingBufferSize(new Vector2())
    this._renderTarget.setSize(size.width, size.height)

    // Render the effect to our own render target
    this._quadMesh.material = this._material
    renderer.setRenderTarget(this._renderTarget)
    this._quadMesh.render(renderer)
    renderer.setRenderTarget(null)
  }

  setup(builder) {
    // TSL shader code — runs as fullscreen quad
    // CAN use depthNode.sample(arbitraryUV) here!
    this._material.fragmentNode = Fn(() => {
      const depth = this.depthNode.sample(someUV).r
      // ... effect logic ...
      return result
    })()
    return this._textureNode
  }
}
```

### TypeScript: Making TempNode Extensible

`@types/three` defines TempNode as `declare const` (not `class`), so `class extends TempNode` fails in TypeScript. All official Three.js TSL nodes (GTAONode, DenoiseNode) are vanilla JS because of this. The TSL types are a work in progress — tracked at `three-types/three-ts-types#2049`.

**Solution: Module augmentation.** Add this `.d.ts` file to your project:

```ts
// three-tsl-extend.d.ts
import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js'
import type NodeFrame from 'three/src/nodes/core/NodeFrame.js'
import type { NodeUpdateType } from 'three/src/nodes/core/constants.js'
import type Node from 'three/src/nodes/core/Node.js'

declare module 'three/src/nodes/core/TempNode.js' {
  export default class TempNode<TNodeType = unknown> {
    constructor(type?: TNodeType | null)
    nodeType: string | null
    updateBeforeType: NodeUpdateType
    isTempNode: true
    setup(builder: NodeBuilder): Node | null | undefined
    updateBefore(frame: NodeFrame): boolean | undefined
    dispose(): void
  }
}
```

Then import from the source path:

```ts
import TempNode from 'three/src/nodes/core/TempNode.js'

class MyEffectNode extends TempNode<'float'> {
  constructor() {
    super('float')
    this.updateBeforeType = NodeUpdateType.FRAME
  }
  // setup() and updateBefore() now type-check properly
}
```

**Key:** Target `three/src/nodes/core/TempNode.js` (source path), NOT `three/webgpu`. Augmenting `three/webgpu` clobbers all other exports from that module.

**Why this works and inlining doesn't:** The TempNode renders to its own RenderTarget via QuadMesh. The depth texture from the scene pass IS available in this context because the scene has already been rendered. When you inline into `PostProcessing.outputNode`, the depth texture binding may not be correct.

## Render-to-Texture (convertToTexture)

For simpler multi-pass effects (blur, color grading chains), use `convertToTexture()` to create intermediate textures:

```ts
import { convertToTexture } from 'three/tsl'

// Render a node to a texture, then sample it at different UVs
const intermediateTexture = convertToTexture(someColorNode)
const blurredSample = intermediateTexture.sample(offsetUV)
```

This is simpler than TempNode but less control. Good for chaining blur passes.
