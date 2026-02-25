<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# three-flatland

High-performance 2D sprites, tilemaps, and effects for [Three.js](https://threejs.org/) — built for WebGPU with composable TSL shaders.

> **Alpha Release** — three-flatland is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/three-flatland)](https://www.npmjs.com/package/three-flatland)
[![license](https://img.shields.io/npm/l/three-flatland)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Why three-flatland?

Three.js is a 3D engine. Building 2D games on top of it means fighting the renderer — no batching, no sprite sheets, no layer ordering, no pixel-perfect rendering. three-flatland fixes all of that.

- **10,000+ sprites at 60fps** — automatic GPU batching, one draw call
- **WebGPU native** — TSL shaders, not GLSL strings. Effects that weren't possible before
- **Proper 2D pipeline** — layers, z-ordering, anchor points, pixel-art texture presets
- **Composable effects** — tint, outline, dissolve, palette swap, CRT, bloom — mix and match
- **Animation system** — spritesheet-driven with frame-perfect timing
- **Tilemap support** — Tiled and LDtk editor formats with animated tiles
- **React Three Fiber** — first-class R3F integration via `three-flatland/react`
- **Tree-shakeable** — import only what you use, deep imports for maximum control

## Install

```bash
npm install three-flatland@alpha
```

For React Three Fiber:

```bash
npm install three-flatland@alpha @react-three/fiber@alpha
```

### Requirements

- **three** >= 0.183.1 (WebGPU/TSL support)
- **koota** >= 0.1.0 (ECS for batch rendering)
- **React** >= 19 and **@react-three/fiber** >= 10.0.0-alpha.2 (optional, for R3F)

## Quick Start

### Three.js

```typescript
import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera } from 'three'
import { Sprite2D, SpriteGroup, TextureLoader } from 'three-flatland'

const scene = new Scene()
const camera = new OrthographicCamera(-400, 400, 300, -300, 0.1, 1000)
camera.position.z = 100

const renderer = new WebGPURenderer()
renderer.setSize(800, 600)
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
    <Canvas orthographic camera={{ zoom: 1, position: [0, 0, 100] }}>
      <Suspense>
        <Sprite />
      </Suspense>
    </Canvas>
  )
}
```

## Subpath Exports

Import only what you need:

```ts
// Everything
import { Sprite2D, SpriteGroup, AnimatedSprite2D } from 'three-flatland'

// By category
import { Sprite2D } from 'three-flatland/sprites'
import { AnimatedSprite2D } from 'three-flatland/animation'
import { Sprite2DMaterial } from 'three-flatland/materials'
import { SpriteSheetLoader, TextureLoader } from 'three-flatland/loaders'
import { SpriteGroup, SpriteBatch } from 'three-flatland/pipeline'
import { TileMap2D, TiledLoader, LDtkLoader } from 'three-flatland/tilemap'

// React (re-exports core + JSX types + attach helper)
import { Sprite2D, attachEffect, type EffectElement } from 'three-flatland/react'
```

## Companion Packages

| Package | Description |
|---------|-------------|
| [`@three-flatland/nodes`](https://www.npmjs.com/package/@three-flatland/nodes) | 50+ TSL shader nodes — tint, outline, dissolve, blur, CRT, palette swap, and more |
| [`@three-flatland/presets`](https://www.npmjs.com/package/@three-flatland/presets) | Pre-configured effect combinations (coming soon) |

## Documentation

Full docs, interactive examples, and API reference at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**

## License

[MIT](./LICENSE)

---

<sub>This README was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).</sub>
