# RFC: Effect Channel Dependencies — `requires` / `provides`

## Overview

three-flatland's effect system currently supports three effect types: `MaterialEffect` (per-sprite color transforms), `LightEffect` (per-Flatland lighting), and `PassEffect` (post-processing). These effects operate independently — they cannot share per-fragment data between each other.

This RFC introduces a **channel dependency system** where effects declare what per-fragment data they produce (`provides`) and consume (`requires`). The pipeline connects providers to consumers automatically, with correct batching and compile-time type safety.

**The first use case is normal maps for 2D lighting.** The system is general enough for height maps, roughness, emissive, and user-defined channels.

### Design Goals

- **Decoupled**: Sprites don't know about channels — they're a MaterialEffect concern
- **Compile-time safe**: Accessing an undeclared channel is a type error (not `undefined`)
- **Zero overhead**: Channels that aren't required by any active effect are never computed
- **Batch-aware**: Per-sprite texture constants (like normalMap) produce correct batch keys automatically
- **Extensible**: Users define custom channels and providers using the same infrastructure as presets
- **Core provides pipes, presets provide implementations**: Normal map providers live in `@three-flatland/presets`; the channel infrastructure lives in `three-flatland`

---

## Motivation

### The Normal Map Problem

2D lighting needs surface normals for directional shading (Lambertian diffuse, specular highlights). Normal data comes from two sources:

1. **Auto-generated**: Central difference gradient on the sprite's alpha channel (4 extra texture samples)
2. **Pre-baked**: A separate normal map texture sampled per-fragment

Both are per-fragment computations that the `LightEffect` needs but can't currently access. The `ColorTransformContext` passed to lighting only contains `{ color, atlasUV, worldPosition }`.

### Why Not Just Add `normalMap` to Sprite2D?

A naïve approach adds `normalMap` as a Sprite2D property and `normal` to ColorTransformContext. This works but:

- Couples the sprite to a specific lighting concern
- Requires modifying core types for every new channel (height, roughness, emissive)
- Doesn't leverage the MaterialEffect system or ECS batching
- Users can't define custom channels without modifying the core

### The Generalized Problem

Effects need to share per-fragment data:

| Producer | Data | Consumer |
|----------|------|----------|
| NormalMapProvider (MaterialEffect) | Surface normal `vec3` | LightEffect |
| HeightMapProvider (MaterialEffect) | Height `float` | ParallaxPassEffect |
| RoughnessProvider (MaterialEffect) | Roughness `float` | PBRLightEffect |
| EmissiveProvider (MaterialEffect) | Emissive `vec3` | BloomPassEffect |
| UserCustomProvider | Any | UserCustomEffect |

Each follows the same pattern: a MaterialEffect produces per-fragment data, a LightEffect or PassEffect consumes it, and the pipeline connects them.

---

## Architecture

### Current Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ _rebuildColorNode()                                         │
│                                                             │
│   Fn(() => {                                                │
│     // 1. Base color (includes colorTransform/lighting)     │
│     let color = _buildBaseColor().color  ← lighting here    │
│                                                             │
│     // 2. MaterialEffect chain                              │
│     for (effect of effects) {                               │
│       color = mix(color, effect.buildNode(color), enabled)  │
│     }                                                       │
│     return color                                            │
│   })                                                        │
└─────────────────────────────────────────────────────────────┘
```

**Problem**: `colorTransform` (lighting) runs inside `_buildBaseColor()` — BEFORE MaterialEffects. Channel providers can't resolve before the LightEffect consumes their data.

### New Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ _rebuildColorNode()                                         │
│                                                             │
│   Fn(() => {                                                │
│     // Phase 0: Base color (texture + tint, NO lighting)    │
│     let color = _buildBaseColor().color                     │
│                                                             │
│     // Phase 1: Resolve channels from provider effects      │
│     for (provider of effects.filter(e => e.provides)) {     │
│       channels[name] = provider.channelNode(name, ctx)      │
│     }                                                       │
│                                                             │
│     // Phase 2: Apply colorTransform (lighting) w/ channels │
│     color = colorTransform({ color, ...channels })          │
│                                                             │
│     // Phase 3: Chain color-transforming MaterialEffects     │
│     for (effect of effects.filter(e => !e.provides)) {      │
│       color = mix(color, effect.buildNode(color), enabled)  │
│     }                                                       │
│     return color                                            │
│   })                                                        │
└─────────────────────────────────────────────────────────────┘
```

`colorTransform` moves from `_buildBaseColor()` (Sprite2DMaterial) up to `_rebuildColorNode()` (EffectMaterial), running after channel resolution but before color-transforming effects.

### Data Flow Diagram

```
User code                          Core pipeline                   Shader graph
──────────                         ─────────────                   ────────────

flatland.setLighting(              Flatland stores
  new DefaultLightEffect()    ──→  requiredChannels = {'normal'}
)                                  propagates to all materials

sprite.addEffect(                  Material gets new identity
  new NormalMapProvider(tex)  ──→  (constants affect cache key)
)                                  registers effect + constants
                                   triggers _rebuildColorNode()

                                   _rebuildColorNode():
                                   ├─ Phase 0: sample diffuse  ──→ texture(map, atlasUV)
                                   ├─ Phase 1: resolve normal  ──→ NormalMapProvider.channelNode()
                                   │    → channels.normal           → texture(normalMap, atlasUV)
                                   ├─ Phase 2: apply lighting  ──→ colorTransform({..., normal})
                                   │    → ctx.normal.dot(lightDir)  → dot product per-fragment
                                   └─ Phase 3: color effects   ──→ mix(color, effectResult, en)
```

---

## API Design

### Consuming Channels — LightEffect `requires`

A `LightEffect` declares what channels it needs. The pipeline guarantees they're resolved before the lighting callback runs:

```typescript
import { createLightEffect } from 'three-flatland'

// ─── LightEffect that requires normals ──────────────────────

export const NormalLightEffect = createLightEffect({
  name: 'normalLight',
  schema: {
    lightHeight: 0.75,   // Z component for 3D light direction
    bands: 0,            // Cel-shading bands (0 = smooth)
  },
  requires: ['normal'] as const,
  light: ({ uniforms, lightStore }) => (ctx) => {
    // ctx.normal is typed as Node<'vec3'> — guaranteed by requires
    // ctx.color, ctx.atlasUV, ctx.worldPosition also available

    let totalLight = vec3(0, 0, 0)
    const lightCount = lightStore.lightCount

    Loop(lightCount, ({ i }) => {
      const lightData = lightStore.readLightData(i)
      const toLight = lightData.position.sub(ctx.worldPosition)
      const dist = toLight.length()

      // Extend 2D direction to 3D for normal-based diffuse
      const lightDir3D = vec3(toLight.normalize(), uniforms.lightHeight).normalize()
      const diffuse = ctx.normal.dot(lightDir3D).clamp(0, 1)

      // Attenuation
      const atten = float(1).div(float(1).add(lightData.decay.mul(dist.mul(dist))))
      totalLight.addAssign(lightData.color.mul(lightData.intensity).mul(atten).mul(diffuse))
    })

    return vec4(ctx.color.rgb.mul(totalLight), ctx.color.a)
  },
})
```

```typescript
// ─── LightEffect without requires ───────────────────────────

export const SimpleLightEffect = createLightEffect({
  name: 'simpleLight',
  schema: { ambientIntensity: 0.2 },
  // No requires — doesn't need any channels
  light: ({ uniforms }) => (ctx) => {
    // ctx.normal → TYPE ERROR: Property 'normal' does not exist
    // Only ctx.color, ctx.atlasUV, ctx.worldPosition available
    return vec4(ctx.color.rgb.mul(uniforms.ambientIntensity), ctx.color.a)
  },
})
```

### Providing Channels — MaterialEffect `provides`

A `MaterialEffect` declares what channels it produces. Channel data is computed per-fragment via `channelNode()`:

```typescript
import { createMaterialEffect } from 'three-flatland'
import { texture, vec3 } from 'three/tsl'
import type { Texture } from 'three'

// ─── Pre-baked normal map provider ──────────────────────────

export const NormalMapProvider = createMaterialEffect({
  name: 'normalMap',
  schema: {
    normalMap: () => null as Texture | null,  // Constant: per-instance texture
  },
  provides: ['normal'],
  channelNode(channelName, { atlasUV, constants }) {
    // Sample pre-baked normal map and decode from [0,1] to [-1,1]
    const tex = constants.normalMap as Texture
    const raw = texture(tex, atlasUV)
    return raw.xyz.mul(2).sub(1).normalize()
  },
  // No node() — this effect doesn't transform color
})
```

```typescript
// ─── Auto-generated normal from alpha gradient ──────────────

export const AutoNormalProvider = createMaterialEffect({
  name: 'autoNormal',
  schema: {
    strength: 1.0,    // Uniform: adjustable per-sprite
  },
  provides: ['normal'],
  channelNode(channelName, { atlasUV, attrs }) {
    // Central difference gradient on alpha channel
    // 4 neighbor samples → dx, dy → normalize(vec3(-dx, -dy, 1))
    const texelSize = float(1).div(256)
    const alphaL = texture(spriteTex, atlasUV.sub(vec2(texelSize, 0))).a
    const alphaR = texture(spriteTex, atlasUV.add(vec2(texelSize, 0))).a
    const alphaD = texture(spriteTex, atlasUV.sub(vec2(0, texelSize))).a
    const alphaU = texture(spriteTex, atlasUV.add(vec2(0, texelSize))).a
    const dx = alphaR.sub(alphaL).mul(attrs.strength)
    const dy = alphaU.sub(alphaD).mul(attrs.strength)
    return vec3(dx.negate(), dy.negate(), float(1)).normalize()
  },
})
```

### User-Defined Channels

Users can define custom channels using the same system. Module augmentation extends the type map:

```typescript
// my-channels.ts
import type { Node } from 'three/src/nodes/core/Node.js'

// Extend the channel type map
declare module 'three-flatland' {
  interface ChannelNodeMap {
    roughness: Node<'float'>
    emissive: Node<'vec3'>
  }
}

// ─── Custom roughness provider ──────────────────────────────

export const RoughnessProvider = createMaterialEffect({
  name: 'roughness',
  schema: {
    roughnessMap: () => null as Texture | null,
    defaultRoughness: 0.5,
  },
  provides: ['roughness'],
  channelNode(channelName, { atlasUV, constants, attrs }) {
    const tex = constants.roughnessMap as Texture | null
    if (tex) {
      return texture(tex, atlasUV).r
    }
    return attrs.defaultRoughness
  },
})

// ─── Custom PBR light that consumes roughness + normal ──────

export const PBRLightEffect = createLightEffect({
  name: 'pbrLight',
  schema: { lightHeight: 0.75 },
  requires: ['normal', 'roughness'] as const,
  light: ({ uniforms }) => (ctx) => {
    // ctx.normal: Node<'vec3'> — guaranteed
    // ctx.roughness: Node<'float'> — guaranteed
    // Blinn-Phong with roughness-based specular
    const shininess = float(1).sub(ctx.roughness).mul(128)
    // ...
  },
})
```

### End-to-End Usage — Vanilla Three.js

```typescript
import { WebGPURenderer } from 'three/webgpu'
import { NearestFilter } from 'three'
import { Flatland, Light2D, Sprite2D, SpriteSheetLoader } from 'three-flatland'
import { DefaultLightEffect, NormalMapProvider, AutoNormalProvider } from '@three-flatland/presets'

async function main() {
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const flatland = new Flatland({ viewSize: 300, clearColor: 0x0a0a12 })

  // ─── Activate lighting (requires 'normal' channel) ────────
  flatland.setLighting(new DefaultLightEffect())

  // ─── Load assets ───────────────────────────────────────────
  const knightSheet = await SpriteSheetLoader.load('./sprites/knight.json')
  const knightNormalMap = await new TextureLoader().loadAsync('./sprites/knight_normal.png')
  knightNormalMap.minFilter = NearestFilter
  knightNormalMap.magFilter = NearestFilter

  // ─── Sprite with pre-baked normal map ──────────────────────
  const knight = new Sprite2D({
    texture: knightSheet.texture,
    frame: knightSheet.getFrame('idle_0'),
    lit: true,
  })
  // Add normal map as a MaterialEffect — sprite doesn't "care" about normals
  const normalEffect = new NormalMapProvider()
  normalEffect.normalMap = knightNormalMap  // Set the constant's texture
  knight.addEffect(normalEffect)

  knight.scale.set(64, 64, 1)
  flatland.add(knight)

  // ─── Sprite with auto-generated normals (from alpha) ──────
  const crate = new Sprite2D({
    texture: crateTexture,
    lit: true,
  })
  crate.addEffect(new AutoNormalProvider())  // Generates normals from alpha gradient
  crate.scale.set(48, 48, 1)
  crate.position.set(80, 0, 0)
  flatland.add(crate)

  // ─── Sprite with NO normal provider ────────────────────────
  // Lighting still applies (ambient, etc.) but no directional shading
  const background = new Sprite2D({ texture: bgTexture, lit: true })
  flatland.add(background)

  // ─── Lights ────────────────────────────────────────────────
  flatland.add(new Light2D({
    type: 'point',
    position: [-80, 50],
    color: 0xff6600,
    intensity: 1.2,
    distance: 150,
  }))
  flatland.add(new Light2D({
    type: 'ambient',
    color: 0x111122,
    intensity: 0.15,
  }))

  // ─── Render loop ──────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate)
    flatland.render(renderer)
  }
  animate()
}

main()
```

### End-to-End Usage — React Three Fiber

```tsx
import { Suspense, useRef, useEffect, useMemo } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  Flatland, Light2D, Sprite2D,
  SpriteSheetLoader, TextureLoader,
  attachLighting,
} from 'three-flatland/react'
import {
  DefaultLightEffect,
  NormalMapProvider,
  AutoNormalProvider,
} from '@three-flatland/presets'
import '@three-flatland/presets/react'

extend({ Flatland, Sprite2D, Light2D, DefaultLightEffect, NormalMapProvider, AutoNormalProvider })

function LitKnight() {
  const spriteRef = useRef<Sprite2D>(null)
  const sheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const normalMap = useLoader(TextureLoader, './sprites/knight_normal.png')

  return (
    <sprite2D
      ref={spriteRef}
      texture={sheet.texture}
      frame={sheet.getFrame('idle_0')}
      scale={[64, 64, 1]}
      lit
    >
      {/* Normal map provider — attached as a child effect */}
      <normalMapProvider attach="effects" normalMap={normalMap} />
    </sprite2D>
  )
}

function LitCrate() {
  return (
    <sprite2D texture={crateTexture} scale={[48, 48, 1]} position={[80, 0, 0]} lit>
      {/* Auto-generate normals from alpha gradient */}
      <autoNormalProvider attach="effects" strength={1.0} />
    </sprite2D>
  )
}

function Scene() {
  const flatlandRef = useRef<Flatland>(null)
  const { renderer, size } = useThree()

  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  useFrame(() => {
    flatlandRef.current?.render(renderer as unknown as WebGPURenderer)
  }, { phase: 'render' })

  return (
    <flatland ref={flatlandRef} viewSize={300} clearColor={0x0a0a12}>
      <defaultLightEffect attach={attachLighting} />

      <light2D lightType="point" position={[-80, 50, 0]}
        color={0xff6600} intensity={1.2} distance={150} />
      <light2D lightType="ambient" color={0x111122} intensity={0.15} />

      <LitKnight />
      <LitCrate />
    </flatland>
  )
}

export default function App() {
  return (
    <Canvas renderer={{ antialias: false }}>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}
```

---

## Type System Design

### Channel Type Map

```typescript
// packages/three-flatland/src/materials/channels.ts

import type Node from 'three/src/nodes/core/Node.js'

/**
 * Maps well-known channel names to their TSL node types.
 * Users extend via module augmentation for custom channels.
 */
export interface ChannelNodeMap {
  normal: Node<'vec3'>
}

/**
 * Narrows a type by adding required channel properties.
 * Known channels use mapped types; unknown channels fall back to Node.
 */
export type WithRequiredChannels<C extends readonly string[]> = {
  [K in C[number]]: K extends keyof ChannelNodeMap ? ChannelNodeMap[K] : Node
}
```

### ColorTransformContext — Unchanged

```typescript
// packages/three-flatland/src/materials/Sprite2DMaterial.ts

/**
 * Context passed to colorTransform callbacks.
 * NO optional channel fields — channels are added via intersection types
 * at the createLightEffect generic boundary only.
 */
export interface ColorTransformContext {
  color: Node<'vec4'>
  atlasUV: Node<'vec2'>
  worldPosition: Node<'vec2'>
}

export type ColorTransformFn = (ctx: ColorTransformContext) => Node<'vec4'>
```

### LightEffect Generic Signature

```typescript
// packages/three-flatland/src/lights/LightEffect.ts

interface LightEffectConfig<
  S extends EffectSchema,
  C extends readonly string[] = readonly []
> {
  name: string
  schema: S
  requires?: C
  needsShadows?: boolean
  /** light callback receives narrowed context based on requires */
  light: (context: LightEffectBuildContext<S>) =>
    (ctx: ColorTransformContext & WithRequiredChannels<C>) => Node<'vec4'>
  init?: (this: LightEffectInstance<S>, ctx: LightEffectRuntimeContext) => void
  update?: (this: LightEffectInstance<S>, ctx: LightEffectRuntimeContext) => void
  resize?: (this: LightEffectInstance<S>, width: number, height: number) => void
  dispose?: (this: LightEffectInstance<S>) => void
}

export function createLightEffect<
  const S extends EffectSchema,
  const C extends readonly string[] = readonly []
>(config: LightEffectConfig<S, C>): LightEffectClass<S> {
  // ...
  const EffectClass = class extends LightEffect {
    static readonly lightName = name
    static readonly lightSchema = schema as EffectSchema
    static override readonly requires = (config.requires ?? []) as readonly string[]

    static override buildLightFn(context: LightEffectBuildContext): ColorTransformFn {
      // Cast is safe: pipeline guarantees channels are resolved before calling
      return lightFn(context as LightEffectBuildContext<S>) as unknown as ColorTransformFn
    }
    // ... lifecycle hooks
  }
  return EffectClass as unknown as LightEffectClass<S>
}
```

The `as unknown as ColorTransformFn` cast is the single controlled boundary where the narrowed type is widened. This is safe because the pipeline (EffectMaterial._rebuildColorNode) guarantees all declared channels are resolved before calling the transform.

### MaterialEffect Channel Provider

```typescript
// packages/three-flatland/src/materials/MaterialEffect.ts

interface MaterialEffectConfig<S extends EffectSchema> {
  name: string
  schema: S
  provides?: readonly string[]
  channelNode?: (
    channelName: string,
    context: {
      atlasUV: Node<'vec2'>
      constants: EffectConstants<S>
      attrs: { [K in UniformKeys<S>]: SchemaToNodeType<S[K]> }
    }
  ) => Node
  node?: (context: EffectNodeContext<S>) => Node<'vec4'>  // Optional for providers
}
```

---

## Batching and Material Identity

### Current System

```
Sprite2DMaterial.getShared() cache key:  ${textureId}:${transparent}:${ctId}
computeRunKey(layer, materialId)  →  8-bit layer + 16-bit materialId
```

Effects don't participate in batch keys. All effect data varies per-sprite via packed instance buffers (effectBuf0..N).

### The Constants Problem

`buildNode()` is static (called once per material). Currently `constants: {}` is passed (empty). Constants are per-effect-instance, stored in JavaScript — but the shader needs them at build time.

If different sprites have different normalMap textures, they need different shader graphs (different `texture()` nodes). This means different materials.

### Solution: Constants Participate in Material Identity

1. `registerEffect(effectClass, constants)` stores constants on the material
2. `_rebuildColorNode()` passes stored constants to `buildNode()` and `channelNode()`
3. `getShared()` key includes effect constant data (texture IDs, etc.)
4. Different constants → different materials → different `batchId` → different batches

```typescript
// Expanded getShared key
static getShared(options: {
  map?: Texture
  transparent?: boolean
  colorTransform?: ColorTransformFn
  effects?: Array<{ class: typeof MaterialEffect; constants: Record<string, unknown> }>
}): Sprite2DMaterial {
  const textureId = options.map?.id ?? -1
  const transparent = options.transparent ?? true
  const ctId = getColorTransformId(options.colorTransform)
  const effectsKey = options.effects
    ?.map(e => `${e.class.effectName}:${constantsKey(e.constants)}`)
    .join('|') ?? ''

  const key = `${textureId}:${transparent}:${ctId}:${effectsKey}`
  // ...
}
```

### addEffect Material Switch

When `sprite.addEffect(effect)` is called with an effect that has constants (texture references):

```typescript
addEffect(effect: MaterialEffect): this {
  const EffectClass = effect.constructor as typeof MaterialEffect
  const constants = effect._constants

  // Does this effect have constants that affect shader graph?
  if (Object.keys(constants).length > 0) {
    const existingConstants = this.material._effectConstants.get(EffectClass.effectName)
    if (!existingConstants || !constantsMatch(existingConstants, constants)) {
      // Get/create a new shared material with these constants
      const newMaterial = Sprite2DMaterial.getShared({
        map: this._texture,
        colorTransform: this.material.colorTransform,
        effects: this._buildEffectsList(EffectClass, constants),
      })
      this._switchToMaterial(newMaterial)
      // This updates SpriteMaterialRef.materialId
      // → batchReassignSystem moves sprite to correct batch
    }
  }

  // ... rest of existing addEffect flow (register, set enable bit, add trait)
}
```

### Batch Grouping Example

```
Scene: 10 sprites
├── 4 knights with normalMap texture A  → material M1 (diffuse + normalMap=A)  → batch B1
├── 3 knights with normalMap texture B  → material M2 (diffuse + normalMap=B)  → batch B2
├── 2 crates with auto-normal           → material M3 (diffuse + autoNormal)   → batch B3
└── 1 background with no normal         → material M4 (diffuse only)           → batch B4

Draw calls: 4 (one per batch)
```

---

## Pipeline Implementation

### EffectMaterial._rebuildColorNode() — The 4-Phase Pipeline

```typescript
// packages/three-flatland/src/materials/EffectMaterial.ts

_rebuildColorNode(): void {
  if (!this._canBuildColor()) return

  const buildBaseColor = this._buildBaseColor.bind(this)
  const colorTransformFn = this._colorTransform       // Moved from Sprite2DMaterial
  const requiredChannels = this._requiredChannels      // Set by Flatland

  // Pre-build packed buffer TSL nodes (outside Fn)
  const numVec4s = this._effectTier / 4
  const bufNodes: Node<'vec4'>[] = []
  for (let i = 0; i < numVec4s; i++) {
    bufNodes.push(attribute<'vec4'>(`effectBuf${i}`, 'vec4'))
  }

  // Pre-build per-effect data (outside Fn)
  const effectData = this._effects.map(effectClass => ({
    effectClass,
    bitIndex: this._effectBitIndex.get(effectClass.effectName)!,
    attrs: this._buildEffectAttrs(effectClass, bufNodes),
    constants: this._effectConstants.get(effectClass.effectName) ?? {},
  }))

  this.colorNode = Fn(() => {
    const baseResult = buildBaseColor()
    if (!baseResult) return vec4(0, 0, 0, 0)

    let color: Node<'vec4'> = baseResult.color
    const atlasUV = baseResult.uv

    // ─── Phase 1: Resolve channels from provider effects ────
    const resolvedChannels: Record<string, Node> = {}
    for (const { effectClass, attrs, constants } of effectData) {
      if (!effectClass.provides || !effectClass.channelNode) continue
      for (const ch of effectClass.provides) {
        if (requiredChannels.has(ch) && !resolvedChannels[ch]) {
          resolvedChannels[ch] = effectClass.channelNode(ch, { atlasUV, constants, attrs })
        }
      }
    }

    // ─── Phase 2: Apply colorTransform (lighting) with channels ─
    if (colorTransformFn) {
      const ctx = Object.assign(
        { color, atlasUV, worldPosition: positionWorld.xy },
        resolvedChannels,
      )
      color = colorTransformFn(ctx as ColorTransformContext)
    }

    // ─── Phase 3: Chain color-transforming MaterialEffects ───
    if (effectData.length > 0) {
      const flags = getPackedComponent(bufNodes, 0)
      for (const { effectClass, bitIndex, attrs, constants } of effectData) {
        if (effectClass.provides) continue  // Skip channel providers

        const divisor = float(1 << bitIndex)
        const shifted = floor(flags.div(divisor))
        const enabled = mod(shifted, float(2.0))

        const effectResult = effectClass._node({
          inputColor: color,
          inputUV: atlasUV,
          attrs,
          constants,  // Fixed: was {} — now passes stored constants
        })

        color = mix(color, effectResult, enabled)
      }
    }

    return color
  })() as typeof this.colorNode
}
```

### Sprite2DMaterial._buildBaseColor() — Simplified

```typescript
// packages/three-flatland/src/materials/Sprite2DMaterial.ts
// colorTransform removed — now handled in Phase 2 of _rebuildColorNode()

protected override _buildBaseColor(): { color: Node<'vec4'>; uv: Node<'vec2'> } | null {
  const mapTexture = this._spriteTexture!

  // ... UV flip, atlas remap (unchanged) ...

  const texColor = texture(mapTexture, atlasUV)
  let tintedRGB = texColor.rgb.mul(instanceColor.rgb)
  if (globalUniforms) tintedRGB = tintedRGB.mul(globalUniforms.globalTintNode)
  const finalAlpha = texColor.a.mul(instanceColor.a)

  // Alpha test / premultiplied alpha (unchanged)
  let color: Node<'vec4'>
  if (this._premultipliedAlpha) {
    color = vec4(tintedRGB.mul(finalAlpha), finalAlpha)
  } else {
    If(texColor.a.lessThan(float(0.01)), () => { Discard() })
    color = vec4(tintedRGB, finalAlpha)
  }

  // NO colorTransform here — moved to _rebuildColorNode Phase 2

  return { color, uv: atlasUV }
}
```

### Flatland Propagation

```typescript
// packages/three-flatland/src/Flatland.ts

private _requiredChannels: ReadonlySet<string> = new Set()

setLighting(lightEffect: LightEffect | null): this {
  // ... existing attach/detach logic ...

  if (lightEffect) {
    const ctor = lightEffect.constructor as typeof LightEffect
    this._requiredChannels = new Set(ctor.requires ?? [])
    // ... existing build + wrap lightFn ...
  } else {
    this._requiredChannels = new Set()
    // ...
  }
  return this
}

// In render(), the _lightingDirty block:
if (this._lightingDirty) {
  this._lightingDirty = false
  const fn = this._wrappedLightFn
  const channels = fn ? this._requiredChannels : new Set<string>()
  for (const mat of this._spriteMaterials) {
    mat.colorTransform = fn
    mat.requiredChannels = channels  // Triggers shader rebuild
  }
}
```

---

## Files Changed

### Core (`packages/three-flatland/src/`)

| File | Change |
|------|--------|
| `materials/channels.ts` | **New** — `ChannelNodeMap`, `WithRequiredChannels` types |
| `materials/EffectMaterial.ts` | Move `colorTransform` + `requiredChannels` here; 4-phase `_rebuildColorNode()`; `_effectConstants` storage; fix `constants: {}` |
| `materials/Sprite2DMaterial.ts` | Remove colorTransform from `_buildBaseColor()`; expand `getShared()` key |
| `materials/MaterialEffect.ts` | Add `provides`, `channelNode` to base class + factory |
| `lights/LightEffect.ts` | Add `requires` to base class + factory; generic signature `<S, C>` |
| `sprites/Sprite2D.ts` | `addEffect()` handles material switch for constant-bearing effects |
| `Flatland.ts` | Store + propagate `requiredChannels` |

### Presets (`packages/presets/src/lighting/`)

| File | Change |
|------|--------|
| `NormalMapProvider.ts` | **New** — MaterialEffect providing 'normal' from texture |
| `AutoNormalProvider.ts` | **New** — MaterialEffect providing 'normal' from alpha gradient |
| `DefaultLightEffect.ts` | Add `requires: ['normal']`, `lightHeight` uniform, diffuse from `ctx.normal` |
| `DirectLightEffect.ts` | Same pattern as DefaultLightEffect |

---

## Open Questions

1. **Fallback when no provider**: If LightEffect requires `'normal'` but sprite has no normal provider, what happens? Options: (a) flat `vec3(0,0,1)` fallback in the pipeline, (b) skip the channel (runtime property access on ctx returns `undefined`), (c) the LightEffect handles it. Leaning toward (a) — pipeline provides a flat default so effects don't need null checks.

2. **PassEffect requires**: Should `PassEffect` also support `requires`? Screen-space effects might want normal buffer data. Different mechanism (render targets) — likely a future extension.

3. **Channel providers that also transform color**: Can a MaterialEffect both `provides` channels AND participate in the color chain? Current design skips providers in Phase 3. If needed, add a `colorPassthrough: false` flag to opt into both.

4. **React `attach` pattern for effects**: The JSX examples show `<normalMapProvider attach="effects" />`. Need to verify R3F's attach mechanism works with the `addEffect`/`removeEffect` lifecycle.

5. **Hot-swapping constants**: What happens when a user changes `normalEffect.normalMap = newTexture` after it's attached? This would need to trigger a material switch. Currently constants are set once in the constructor. May need a setter that triggers re-evaluation.
