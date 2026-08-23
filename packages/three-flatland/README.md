<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# three-flatland

2D sprites, tilemaps, and TSL-composable effects for [Three.js](https://threejs.org/), built for WebGPU.

> **Alpha Release** — three-flatland is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/three-flatland)](https://www.npmjs.com/package/three-flatland)
[![license](https://img.shields.io/npm/l/three-flatland)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Built into Three.js, not on top of it

three-flatland exposes 2D primitives as plain `Object3D` subclasses on the Three.js scene graph. No parallel renderer, no shadow `Scene`, no coordination layer.

- **2D primitives as `Object3D` subclasses.** `Sprite2D`, `SpriteGroup`, `AnimatedSprite2D`, `TileMap2D`. Live in the same scene as meshes, lights, and cameras.
- **Independent transform + render order.** `layer` and `zIndex` decouple z-sorting from parent hierarchy, so a child sprite can render below its parent.
- **10,000+ sprites at 60fps.** ECS-driven batch archetypes, packed GPU buffers, branch-pruned uber-shader.
- **TSL shaders through `WebGPURenderer`.** Three.js compiles the node graphs for WebGPU or its WebGL 2 compatibility backend.
- **Pixel-perfect by default.** `FlatlandConfig` coordinates texture loading, integer camera scale, and projected-pivot snapping; override the whole pipeline or one subsystem.
- **Composable effects.** Tint, outline, dissolve, palette swap, CRT, bloom — combine on a shared material; sprites in a batch stay batched as effects come and go.
- **Animation system.** `AnimatedSprite2D` + `AnimationController` for spritesheet-driven, frame-precise playback with completion callbacks.
- **Tilemap support.** Loaders for [Tiled](https://www.mapeditor.org/) and [LDtk](https://ldtk.io/) editor formats; animated tiles included.
- **2D-on-3D via render targets.** The `Flatland` class wraps a 2D scene with an orthographic camera and an optional `RenderTarget`; the resulting texture mounts on any 3D material for HUDs, dialogue panels, or in-world signage.
- **React Three Fiber integration.** `three-flatland/react` re-exports the core surface with JSX type augmentation. `extend()`-friendly classes, `attachEffect` lifecycle helper.
- **Tree-shakeable subpath exports.** Import per-category, deep imports for surgical bundles.

## Install

```bash
npm install three-flatland three
```

For React Three Fiber:

```bash
npm install three-flatland @react-three/fiber@10.0.0-alpha.3
```

### Requirements

- **three** ^0.185.1 (WebGPU/TSL support)
- **React** ~19.2.0 and **@react-three/fiber** 10.0.0-alpha.3 (optional, for R3F)

## Quick Start

### Three.js

```typescript
import { WebGPURenderer } from 'three/webgpu'
import { Scene } from 'three'
import { PixelPerfectCamera, Sprite2D, SpriteGroup, TextureLoader } from 'three-flatland'

const scene = new Scene()
const camera = new PixelPerfectCamera({ viewSize: 600 })

const renderer = new WebGPURenderer()
renderer.setSize(800, 600)
camera.setDrawingBufferSize(renderer.domElement.width, renderer.domElement.height)
renderer.setViewport(camera.getLogicalViewport(renderer.getPixelRatio()))
document.body.appendChild(renderer.domElement)
await renderer.init()

// Load texture with pixel-art defaults
const texture = await TextureLoader.load('/sprite.png')

// Create a sprite group for automatic batching
const group = new SpriteGroup()
scene.add(group)

// Create sprites
const sprite = new Sprite2D({ texture, anchor: [0.5, 0.5] })
group.add(sprite)

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
```

### React Three Fiber

```tsx
import { Canvas, extend, useLoader } from '@react-three/fiber/webgpu'
import { Suspense } from 'react'
import { Sprite2D, SpriteGroup, TextureLoader } from 'three-flatland/react'
import { usePixelPerfectCamera } from 'three-flatland/react'
// attachEffect manages effect add/remove lifecycle on the parent sprite
// EffectElement gives your custom effect JSX props with full type safety
import { attachEffect, type EffectElement } from 'three-flatland/react'
import { createMaterialEffect } from 'three-flatland'
import { tintAdditive } from '@three-flatland/nodes'
import { vec4 } from 'three/tsl'

// Define a reusable shader effect with typed, animatable properties
const DamageFlash = createMaterialEffect({
  name: 'damageFlash',
  schema: { intensity: 0 } as const,
  node: ({ inputColor, attrs }) => {
    const flashed = tintAdditive(inputColor, [1, 1, 1], attrs.intensity)
    return vec4(flashed.rgb.mul(inputColor.a), inputColor.a)
  },
})

// Register three-flatland classes + your effects with R3F
extend({ Sprite2D, SpriteGroup, DamageFlash })

function Camera() {
  usePixelPerfectCamera({ viewSize: 600 })
  return null
}

// Declare JSX types for your custom effects
declare module '@react-three/fiber' {
  interface ThreeElements {
    damageFlash: EffectElement<typeof DamageFlash>
  }
}

function Sprite() {
  const texture = useLoader(TextureLoader, '/sprite.png')
  return (
    <spriteGroup>
      {/* attachEffect auto-calls addEffect/removeEffect on mount/unmount */}
      <sprite2D texture={texture} anchor={[0.5, 0.5]}>
        <damageFlash attach={attachEffect} intensity={0.8} />
      </sprite2D>
    </spriteGroup>
  )
}

export default function App() {
  return (
    <Canvas orthographic>
      <Camera />
      <Suspense>
        <Sprite />
      </Suspense>
    </Canvas>
  )
}
```

## Capacity hints

When a scene's approximate sprite population is known, pass `expectedSprites` to the `SpriteGroup` or `Flatland` constructor:

```ts
const group = new SpriteGroup({ expectedSprites: 16_384 })
const flatland = new Flatland({ expectedSprites: 16_384 })
```

The value reserves hot CPU-side enrollment storage. It is advisory rather than a cap: enrollment continues automatically past the hint. `clear()` keeps the reservation for reuse, while `dispose()` releases it.

React Three Fiber receives constructor-only options through stable `args`:

```tsx
import { useMemo } from 'react'
import type { SpriteGroupOptions } from 'three-flatland/react'

const groupArgs = useMemo(() => [{ expectedSprites: 16_384 }] satisfies [SpriteGroupOptions], [])

return <spriteGroup args={groupArgs}>{/* sprites */}</spriteGroup>
```

`expectedSprites` is not a mutable JSX property. Change the memoized constructor args when the expected population changes so React Three Fiber reconstructs the object.

## Subpath Exports

Import only what you need:

```ts
// Everything
import { Sprite2D, SpriteGroup, AnimatedSprite2D } from 'three-flatland'

// By category
import { Sprite2D, AnimatedSprite2D } from 'three-flatland/sprites'
import { AnimationController } from 'three-flatland/animation'
import { Sprite2DMaterial } from 'three-flatland/materials'
import { SpriteSheetLoader, TextureLoader } from 'three-flatland/loaders'
import { PixelPerfectCamera } from 'three-flatland/cameras'
import { FlatlandConfig } from 'three-flatland/config'
import { SpriteGroup, SpriteBatch } from 'three-flatland/pipeline'
import { TileMap2D, TiledLoader, LDtkLoader } from 'three-flatland/tilemap'

// React (re-exports core + JSX types + attach helper)
import { Sprite2D, attachEffect, type EffectElement } from 'three-flatland/react'
```

## Companion Packages

| Package                                                                                | Description                                                                       |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`@three-flatland/nodes`](https://www.npmjs.com/package/@three-flatland/nodes)         | 50+ TSL shader nodes. Tint, outline, dissolve, blur, CRT, palette swap, and more. |
| [`@three-flatland/skia`](https://www.npmjs.com/package/@three-flatland/skia)           | Skia compiled to WASM. GPU vector graphics, text, paths, image filters.           |
| [`@three-flatland/tweakpane`](https://www.npmjs.com/package/@three-flatland/tweakpane) | Tweakpane v4 theme + React hooks (transitioning to a devtools package).           |
| [`@three-flatland/presets`](https://www.npmjs.com/package/@three-flatland/presets)     | Pre-configured effect combinations (in development).                              |

## When not to reach for three-flatland

- **3D scenes.** Use Three.js directly. The batching system assumes orthographic-style 2D composition and adds nothing for non-2D work.
- **WebGL-1-only targets.** `WebGPURenderer` can use Three.js's WebGL 2 node backend when WebGPU is unavailable; legacy WebGL 1 is out of scope.
- **DOM-overlay UI.** Use the DOM. three-flatland is a renderer, not a UI toolkit.

## Documentation

Full docs, interactive examples, and API reference at **[tjw.dev/three-flatland](https://tjw.dev/three-flatland/)**.

## License

[MIT](./LICENSE)
