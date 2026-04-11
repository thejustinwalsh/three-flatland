# TSL TypeScript Reference

TSL types in `@types/three` are a work in progress (tracked at `three-types/three-ts-types#2049`). This reference covers what works, what doesn't, and the workarounds.

## tsconfig Requirements

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "customConditions": ["source"],
    "verbatimModuleSyntax": true
  }
}
```

**`customConditions: ["source"]`** is required — it tells TypeScript to resolve `three/src/*` imports via the `@types/three` source condition. Without it, source path imports won't find their type declarations.

## Import Patterns

### Runtime imports — from barrel exports

```ts
import * as THREE from 'three/webgpu'
import { Fn, vec3, float, uniform, mix, select } from 'three/tsl'
```

### Type imports — from source paths

Three.js exports `"./src/*": "./src/*"` in its `package.json` exports map. This is a **supported public API surface**, not internal access — bundlers resolve it through the exports map, not filesystem. All node types are imported this way:

```ts
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js'
import type NodeFrame from 'three/src/nodes/core/NodeFrame.js'
```

### Class imports — TempNode from source path

TempNode is not exported from `three/webgpu` barrel. Import from source:

```ts
import TempNode from 'three/src/nodes/core/TempNode.js'
```

This works because `three`'s package.json has `"./src/*": "./src/*"` in its exports map. Bundlers (Vite, Rollup, Webpack) resolve it via the exports map.

## Node Type System

All TSL nodes use the generic `Node<TNodeType>`:

```ts
Node<'float'>  Node<'vec2'>  Node<'vec3'>  Node<'vec4'>  Node<'color'>
Node<'int'>    Node<'uint'>  Node<'bool'>
Node<'mat2'>   Node<'mat3'>  Node<'mat4'>
```

**Critical:** Methods like `.add()`, `.mul()`, `.div()`, `.x`, `.xy` only exist on **parameterized** `Node<T>` — not on bare `Node`. If you cast to `Node` (unparameterized), you lose all the operator extensions. Always preserve the type parameter.

```ts
// WRONG — loses .div(), .x, etc.
const n = someNode as Node

// CORRECT — preserves extensions
const n = someNode as Node<'vec2'>
```

## Uniform Typing

`uniform()` infers both TSL type and JS value type:

```ts
const speed = uniform(1.0)                       // UniformNode<'float', number>
const tint = uniform(new Color(0xff0000))         // UniformNode<'color', Color>
const offset = uniform(new Vector2(0, 0))         // UniformNode<'vec2', Vector2>
const matrix = uniform(new Matrix4())             // UniformNode<'mat4', Matrix4>
```

For class properties, annotate explicitly:

```ts
radius: UniformNode<'float', number>
resolution: UniformNode<'vec2', Vector2>
projMatrix: UniformNode<'mat4', Matrix4>
```

## Input Type Unions

For function parameters that accept either JS literals or TSL nodes:

```ts
type FloatInput = number | Node<'float'>
type Vec2Input = [number, number] | Node<'vec2'>
type Vec3Input = [number, number, number] | Node<'vec3'>
```

Coerce at the call site:

```ts
const radiusNode = typeof radius === 'number' ? float(radius) : radius
```

## Extending TempNode in TypeScript

`@types/three` defines TempNode as `declare const` (not `class`), but `class extends TempNode` works when importing from the source path:

```ts
import TempNode from 'three/src/nodes/core/TempNode.js'
import { NodeUpdateType } from 'three/webgpu'
import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js'
import type NodeFrame from 'three/src/nodes/core/NodeFrame.js'

class MyEffectNode extends TempNode<'float'> {
  radius = uniform(5.0)

  constructor() {
    super('float')
    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override setup(builder: NodeBuilder) {
    // Build TSL shader here
    // depthNode.sample(uv) works in this context
    return this._textureNode
  }

  override updateBefore(frame: NodeFrame) {
    // Render to own RenderTarget here
    return undefined
  }
}
```

### Known Type Gaps When Extending TempNode

These are `@types/three` limitations, not TSL bugs. They need targeted casts:

| Issue | Workaround |
|-------|-----------|
| `passTexture(this, ...)` — expects `PassNode` | `passTexture(this as unknown as Parameters<typeof passTexture>[0], tex)` |
| `textureSize()` return not assignable to `.div()` | Cast: `textureSize(node, int(0)) as unknown as Node<'vec2'>` |
| `builder.getSharedContext()` not typed | `(builder as NodeBuilder & { getSharedContext(): Record<string, unknown> }).getSharedContext()` |
| `UniformNode` not assignable to `.div()` overloads | Cast: `this.resolution as Node<'vec2'>` |
| "Expression produces a union type that is too complex" | Annotate LHS: `const x: Node<'float'> = a.mul(b)` — breaks the union chain |

These are tracked in `three-types/three-ts-types#2049` and may be fixed in future `@types/three` releases.

### TextureNode for Depth/Normal

Type depth and normal inputs as `TextureNode`, not `Node`. This gives you `.sample(uv)` without casts:

```ts
class MyEffect extends TempNode<'float'> {
  depthNode: TextureNode
  normalNode: TextureNode | null

  constructor(depthNode: TextureNode, normalNode: TextureNode | null) {
    super('float')
    this.depthNode = depthNode
    this.normalNode = normalNode
  }

  setup(builder: NodeBuilder) {
    // .sample() is properly typed on TextureNode — no cast needed
    const depth = this.depthNode.sample(someUV).r
    const normal = this.normalNode?.sample(someUV).rgb.normalize()
  }
}
```

## DenoiseNode .r Access

`DenoiseNode` extends `TempNode<'vec4'>` but the types don't surface the `.r` swizzle accessor. Use `@ts-expect-error`:

```ts
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'

const denoised = denoise(aoTexture, depthNode, normalNode, camera)

// @ts-expect-error — .r exists at runtime via Node extensions
const aoValue = denoised.r
```

## Type Safety Summary

| Area | Status | Notes |
|------|--------|-------|
| Node consumption (`vec3`, `float`, etc.) | Fully typed | Works out of the box |
| Uniform creation/updates | Fully typed | Infers TSL + JS types |
| `Fn()` functions | Mostly typed | Some overloads still being refined |
| Material node properties | Fully typed | `.colorNode`, `.positionNode`, etc. |
| `attribute<T>()` generics | Fully typed | Required for @types/three >= 0.183 |
| TempNode subclassing | Works with source path import | `import TempNode from 'three/src/nodes/core/TempNode.js'` |
| `passTexture()` with TempNode | Needs cast | @types/three gap — expects PassNode |
| `textureSize()` return type | Needs cast | Not assignable to operator overloads |
| `builder.getSharedContext()` | Needs cast | Not in NodeBuilder type |
| Add-on nodes (GTAONode, DenoiseNode) | Untyped | JS-only, no @types/three declarations |
