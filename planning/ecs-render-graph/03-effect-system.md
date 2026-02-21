# ECS Render Graph - Effect System

## Overview

The effect system bridges the ECS (per-sprite data) with TSL (GPU shader programs). `defineEffect()` is the single registration point that declares:

1. A Koota trait (the per-sprite data shape)
2. Instance attribute layout (how that data maps to GPU buffers)
3. A TSL node factory (the shader function that reads the attribute)

## defineEffect() API

```typescript
import { defineEffect } from '@three-flatland/core'

const DissolveEffect = defineEffect({
  // Name used for the instance attribute
  name: 'dissolve',

  // Trait schema: defines the SoA data stored per-entity
  trait: { progress: 0 },

  // Instance attribute declaration: maps trait fields to GPU attributes
  attributes: [
    { name: 'dissolve', type: 'float', field: 'progress', default: 0 },
  ],

  // TSL node factory: receives attribute nodes, returns a color transform
  // inputColor is the vec4 coming from the previous effect in the chain
  node({ inputColor, inputUV, attrs }) {
    const progress = attrs.dissolve  // float attribute node
    // ... TSL shader logic ...
    return modifiedColor  // vec4
  },
})
```

## EffectDescriptor Interface

```typescript
interface InstanceAttrDeclaration {
  /** GPU attribute name (used in TSL as `attribute(name)`) */
  name: string
  /** Attribute type */
  type: 'float' | 'vec2' | 'vec3' | 'vec4'
  /** Which trait field this maps from */
  field: string
  /** Default value */
  default: number | number[]
}

interface EffectDescriptor<T extends Record<string, number>> {
  /** Effect name (must be unique per material) */
  name: string

  /** Trait schema. Defines per-entity data stored in SoA layout. */
  trait: T

  /** Instance attribute declarations. Maps trait fields to GPU buffers. */
  attributes: InstanceAttrDeclaration[]

  /** TSL node factory. Builds the shader subgraph for this effect. */
  node(ctx: EffectNodeContext): TSLNode
}

interface EffectNodeContext {
  /** The input color from the previous effect in the chain (vec4) */
  inputColor: TSLNode
  /** The UV coordinates */
  inputUV: TSLNode
  /** Named attribute nodes, keyed by InstanceAttrDeclaration.name */
  attrs: Record<string, TSLNode>
}
```

## Return Value

`defineEffect()` returns an object with:

```typescript
interface Effect<T extends Record<string, number>> {
  /** The Koota trait (created from the schema) */
  Trait: TraitDef<T>
  /** The effect descriptor (passed to material) */
  descriptor: EffectDescriptor<T>
}
```

## Usage Example: Dissolve Effect

### Definition

```typescript
// effects/dissolve.ts
import { defineEffect } from '@three-flatland/core'

export const DissolveEffect = defineEffect({
  name: 'dissolve',
  trait: { progress: 0 },
  attributes: [
    { name: 'dissolve', type: 'float', field: 'progress', default: 0 },
  ],
  node({ inputColor, inputUV, attrs }) {
    const progress = attrs.dissolve
    const noiseUV = inputUV.mul(float(4))
    const noise = hash(noiseUV)  // procedural noise
    If(noise.lessThan(progress), () => { Discard() })
    return inputColor
  },
})
```

### Material Setup

```typescript
import { Sprite2DMaterial } from '@three-flatland/core'
import { DissolveEffect } from './effects/dissolve'

const material = new Sprite2DMaterial({ map: texture })
material.addEffect(DissolveEffect.descriptor)
```

### Per-Sprite Control

```typescript
const sprite = new Sprite2D({ material, texture })
// Via ECS trait (if user is working with entities directly):
sprite.entity.set(DissolveEffect.Trait, { progress: 0.5 })

// Via convenience API (Sprite2D wraps the trait write):
sprite.setInstanceValue('dissolve', 0.5)
```

## Material Integration

### How Sprite2DMaterial Accepts Effects

```typescript
class Sprite2DMaterial extends MeshBasicNodeMaterial {
  private _effects: EffectDescriptor[] = []

  addEffect(effect: EffectDescriptor): this {
    this._effects.push(effect)

    // Register instance attributes from the effect's declarations
    for (const attr of effect.attributes) {
      this._instanceAttributes.set(attr.name, {
        name: attr.name,
        type: attr.type,
        defaultValue: attr.default,
      })
    }

    // Rebuild the colorNode chain
    this._rebuildColorNode()
    return this
  }

  private _rebuildColorNode() {
    // Base color node: texture sample with UV/flip/tint (existing logic)
    let color = this._buildBaseColorNode()

    // Chain effects in order
    for (const effect of this._effects) {
      const attrNodes: Record<string, TSLNode> = {}
      for (const attr of effect.attributes) {
        attrNodes[attr.name] = attribute(attr.name, attr.type)
      }
      color = effect.node({
        inputColor: color,
        inputUV: this._currentUV,
        attrs: attrNodes,
      })
    }

    this.colorNode = color
    this.needsUpdate = true
  }
}
```

### Effect Chain Order

Effects are applied in `addEffect()` call order. Each effect receives the output of the previous effect as `inputColor`. The chain is:

```
texture sample -> tint/alpha -> effect[0] -> effect[1] -> ... -> final colorNode
```

## Instance Attribute Auto-Registration

When `addEffect()` is called, the effect's `attributes` array is iterated and each entry is registered with `Sprite2DMaterial._instanceAttributes`. This means:

- `SpriteBatch` automatically allocates `InstancedBufferAttribute` arrays for effect attributes.
- `bufferSyncSystem` automatically syncs the effect's trait data to the GPU buffer.
- No manual `addInstanceFloat()` calls needed.

## Relationship to Existing Node Functions

The current TSL node functions in `packages/core/src/nodes/` (e.g., `dissolve()`, `tint()`, `saturate()`) remain available as low-level building blocks. `defineEffect()` is a higher-level abstraction that wraps a node function with ECS integration. Users can use either approach:

- **Low-level**: Build a custom `colorNode` manually using node functions, manage uniforms yourself.
- **High-level**: Use `defineEffect()` for automatic ECS trait + GPU attribute + shader wiring.
