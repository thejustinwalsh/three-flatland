<p align="center">
  <img src="./assets/repo-banner.png" alt="three-flatland banner" width="100%" />
</p>

# three-flatland

2D sprites, tilemaps, and TSL-composable effects for Three.js, built for WebGPU.

> [!IMPORTANT]
> **Early Alpha** — three-flatland is in active development. The library targets GPU-driven 2D rendering on WebGPU; the API will evolve as the underlying systems settle. Open an issue or comment on [GitHub](https://github.com/thejustinwalsh/three-flatland/issues) to shape what gets built.

## Features

- **2D primitives on the Three.js scene graph.** `Sprite2D`, `AnimatedSprite2D`, `SpriteGroup`, and `TileMap2D` as plain `Object3D` subclasses. Transform hierarchy and render order are independent (`layer` + `zIndex`).
- **TSL-native effect composition.** Effects are TSL node graphs that ride on a shared material. Sprites in a batch stay batched as effects come and go.
- **Sprite batching via ECS.** A `koota`-backed batch system keeps archetypes optimal; per-sprite uniforms pack into shared GPU buffers.
- **Spritesheet animation with frame-precise timing.** `AnimationController` handles play/pause/onComplete; declare named animations against a sheet.
- **Tilemap loaders for [Tiled](https://www.mapeditor.org/) and [LDtk](https://ldtk.io/).** Animated tiles supported.
- **Render to texture for 2D-on-3D.** The `Flatland` class composes a 2D scene with an orthographic camera and optional `RenderTarget`; sample the result on any 3D material (`mesh.material.map = flatland.texture`).
- **React Three Fiber integration** via `three-flatland/react`. Re-exports the core surface plus JSX type augmentation; `attachEffect` covers the add/remove lifecycle.
- **Tree-shakeable subpath exports.** `three-flatland/sprites`, `/animation`, `/loaders`, `/pipeline`, `/tilemap`, `/materials`. Import only what you use.

## Installation

```bash
# Core library (Three.js)
npm install three-flatland@alpha three koota

# For React Three Fiber
npm install three-flatland@alpha @react-three/fiber@alpha react react-dom

# TSL shader nodes
npm install @three-flatland/nodes@alpha
```

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

const texture = await TextureLoader.load('/sprite.png')

// SpriteGroup handles automatic batching
const group = new SpriteGroup()
scene.add(group)

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

extend({ Sprite2D, SpriteGroup })

function Sprite() {
  const texture = useLoader(TextureLoader, '/sprite.png')
  return (
    <spriteGroup>
      <sprite2D texture={texture} anchor={[0.5, 0.5]} />
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

## Core Concepts

### Layers and Z-Ordering

Unlike traditional 3D engines, three-flatland separates transform hierarchy from render order:

```typescript
import { Sprite2D, Layers } from 'three-flatland'

// Scene graph controls position inheritance
const player = new THREE.Group()
const shadow = new Sprite2D({ texture: shadowTex })
const body = new Sprite2D({ texture: bodyTex })
player.add(shadow, body)

// Render order is explicit and independent
shadow.layer = Layers.SHADOWS   // Renders first
body.layer = Layers.ENTITIES    // Renders on top

// Shadow moves with player but always renders below
player.position.x += 10
```

### Animation

```typescript
import { AnimatedSprite2D, SpriteSheetLoader } from 'three-flatland'

const sheet = await SpriteSheetLoader.load('/sprites/player.json')

const player = new AnimatedSprite2D({
  spriteSheet: sheet,
  animationSet: {
    animations: {
      idle: { frames: ['idle_0', 'idle_1', 'idle_2'], fps: 8 },
      run: { frames: ['run_0', 'run_1', 'run_2', 'run_3'], fps: 12 },
      attack: { frames: ['attack_0', 'attack_1'], fps: 15, loop: false },
    },
  },
  animation: 'idle',
})

player.update(deltaMs)
player.play('run')
player.play('attack', { onComplete: () => player.play('idle') })
```

### Composable TSL Effects

```typescript
import { createMaterialEffect } from 'three-flatland'
import { tintAdditive } from '@three-flatland/nodes'
import { vec4 } from 'three/tsl'

const DamageFlash = createMaterialEffect({
  name: 'damageFlash',
  schema: { intensity: 1 } as const,
  node: ({ inputColor, attrs }) => {
    const flashed = tintAdditive(inputColor, [1, 1, 1], attrs.intensity)
    return vec4(flashed.rgb.mul(inputColor.a), inputColor.a)
  },
})

const flash = new DamageFlash()
sprite.addEffect(flash)
flash.intensity = 0.8 // Animate per frame
```

## Packages

| Package | Description |
|---------|-------------|
| [`three-flatland`](https://www.npmjs.com/package/three-flatland) | Core library. Sprites, materials, animation, loaders, tilemaps, render pipeline. |
| [`three-flatland/react`](https://www.npmjs.com/package/three-flatland) | React Three Fiber subpath. Re-exports core plus JSX type augmentation. |
| [`@three-flatland/nodes`](https://www.npmjs.com/package/@three-flatland/nodes) | TSL shader nodes for effects (per-category subpaths). |
| [`@three-flatland/skia`](https://www.npmjs.com/package/@three-flatland/skia) | Skia compiled to WASM. GPU vector graphics, text, paths, image filters. |
| [`@three-flatland/tweakpane`](https://www.npmjs.com/package/@three-flatland/tweakpane) | Tweakpane v4 theme + React hooks (transitioning to a devtools package). |
| [`@three-flatland/presets`](https://www.npmjs.com/package/@three-flatland/presets) | Pre-configured effect combinations (in development). |

## Requirements

- **three** >= 0.183.1 (TSL/WebGPU support)
- **koota** >= 0.6.5 (ECS for batch rendering)
- **React** >= 19.0.0 (for `three-flatland/react`, uses `use()` hook)
- **@react-three/fiber** >= 10.0.0-alpha.2 (for React, WebGPU support)

## Documentation

Full docs, interactive examples, and API reference at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**.

## When not to reach for three-flatland

- **3D scenes.** Use Three.js directly. three-flatland adds nothing for non-2D work and the batching system assumes orthographic-style 2D composition.
- **WebGL-1-only targets.** TSL targets WebGPU and WebGL 2; legacy WebGL 1 is out of scope.
- **DOM-overlay UI.** For HTML UI layered over a canvas, use the DOM. three-flatland is a renderer, not a UI toolkit.

## Roadmap

- [x] Core sprite system (Sprite2D, materials, loaders)
- [x] Animation system (AnimatedSprite2D, AnimationController)
- [x] 2D render pipeline with ECS-driven batching
- [x] TSL effect nodes (composable shader nodes)
- [x] Tilemap support (Tiled, LDtk)
- [x] React Three Fiber integration
- [x] Skia GPU text rendering via WASM
- [x] Render targets for 2D-on-3D (via `Flatland` class)
- [ ] Effect presets

## License

[MIT](./LICENSE)
