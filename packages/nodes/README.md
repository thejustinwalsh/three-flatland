<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/nodes

Composable TSL shader nodes for [three-flatland](https://www.npmjs.com/package/three-flatland) and Three.js WebGPU. Tint, outline, dissolve, blur, CRT, palette swap, dithering, and more — all built with Three Shader Language.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/nodes)](https://www.npmjs.com/package/@three-flatland/nodes)
[![license](https://img.shields.io/npm/l/@three-flatland/nodes)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Install

```bash
npm install @three-flatland/nodes@alpha
```

### Requirements

- **three** >= 0.183.1 (WebGPU/TSL support)

## Node Categories

| Category | Nodes | Import |
|----------|-------|--------|
| **Sprite** | `sampleSprite`, `spriteUV`, `outline8`, `pixelate`, `uvFlip`, `uvRotate`, `uvScale`, `uvOffset` | `@three-flatland/nodes/sprite` |
| **Color** | `tint`, `tintAdditive`, `hueShift`, `saturate`, `brightness`, `contrast`, `colorRemap` | `@three-flatland/nodes/color` |
| **Alpha** | `alphaTest`, `alphaMask`, `dissolve`, `dissolvePixelated`, `dissolveDirectional`, `fadeEdge` | `@three-flatland/nodes/alpha` |
| **Blur** | `blurBox`, `blurGaussian`, `blurKawase`, `blurRadial`, `blurMotion`, `bloom` | `@three-flatland/nodes/blur` |
| **Retro** | `palettize`, `posterize`, `quantize`, `bayerDither`, `colorReplace`, `consolePalettes` | `@three-flatland/nodes/retro` |
| **Display** | `scanlines`, `crtEffects`, `lcd`, `phosphorMask` | `@three-flatland/nodes/display` |
| **Analog** | `chromaticAberration`, `videoArtifacts` | `@three-flatland/nodes/analog` |
| **Distortion** | `distort`, `distortNoise`, `wave` | `@three-flatland/nodes/distortion` |
| **VFX** | `flash`, `pulse`, `shimmer`, `sparkle`, `trail`, `afterimage` | `@three-flatland/nodes/vfx` |
| **Upscale** | `eagle`, `scale2x`, `hq2x` | `@three-flatland/nodes/upscale` |

## Quick Start

### With three-flatland Material Effects

```typescript
import { createMaterialEffect } from 'three-flatland'
import { tintAdditive, hueShift, outline8 } from '@three-flatland/nodes'
import { vec4 } from 'three/tsl'

// Create a reusable damage flash effect
const DamageFlash = createMaterialEffect({
  name: 'damageFlash',
  schema: { intensity: 1 } as const,
  node: ({ inputColor, attrs }) => {
    const flashed = tintAdditive(inputColor, [1, 1, 1], attrs.intensity)
    return vec4(flashed.rgb.mul(inputColor.a), inputColor.a)
  },
})

// Add to any sprite
const flash = new DamageFlash()
sprite.addEffect(flash)

// Animate in your game loop
flash.intensity = Math.max(0, 1 - elapsed / 0.3)
```

### Standalone TSL

Nodes work with any Three.js WebGPU material:

```typescript
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { texture, uv, Fn } from 'three/tsl'
import { outline8, hueShift } from '@three-flatland/nodes'

const material = new MeshBasicNodeMaterial({ transparent: true })
material.colorNode = Fn(() => {
  const color = texture(myTexture, uv())
  const shifted = hueShift(color, time)
  return outline8(shifted, uv(), myTexture, {
    color: [1, 0, 0, 1],
    thickness: 0.003,
  })
})()
```

## Deep Imports

Every node is individually importable for maximum tree-shaking:

```typescript
// Import by category
import { hueShift, tint } from '@three-flatland/nodes/color'
import { dissolve } from '@three-flatland/nodes/alpha'
import { bloom } from '@three-flatland/nodes/blur'

// Or import everything
import { hueShift, dissolve, bloom } from '@three-flatland/nodes'
```

## Documentation

Full docs, interactive examples, and API reference at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**

## License

[MIT](./LICENSE)

---

<sub>This README was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).</sub>
