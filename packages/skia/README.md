<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/skia

GPU-accelerated 2D vector graphics for [three-flatland](https://www.npmjs.com/package/three-flatland) and [Three.js](https://threejs.org/) — Skia compiled to WASM with Zig. Includes a native WebGPU backend (Graphite/Dawn) alongside WebGL — a lightweight CanvasKit alternative at less than half the size.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/skia)](https://www.npmjs.com/package/@three-flatland/skia)
[![license](https://img.shields.io/npm/l/@three-flatland/skia)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Install

```bash
npm install @three-flatland/skia@alpha
```

### Requirements

- **three** >= 0.183.1 (WebGPU/TSL support)
- **React** >= 19.0.0 (for `@three-flatland/skia/react`)
- **@react-three/fiber** >= 10.0.0-alpha.2 (for React)

## Features

- **Dual Backend** — auto-detects WebGPU (Graphite/Dawn) or WebGL (Ganesh) from your Three.js renderer
- **Vector Graphics** — rects, circles, ovals, lines, paths, rounded rects, clipping
- **Path Operations** — boolean ops (union, intersect, difference, XOR), simplify, path effects
- **Text** — FreeType rendering, font loading (TTF/OTF), measurement, metrics, text on path
- **Gradients & Shaders** — linear, radial, sweep gradients, Perlin noise, image tiling
- **Image Filters** — blur, drop shadow, morphology, displacement, color matrix
- **Three.js Scene Graph** — `SkiaCanvas`, `SkiaGroup`, shape nodes as `Object3D` children
- **React Three Fiber** — `<SkiaCanvas>`, JSX shape elements, `useSkiaContext()`, `useLoader` for fonts, `attachSkiaTexture`
- **857 KB brotli** (WebGPU) / **1 MB** (WebGL) — vs CanvasKit's 2.2 MB (see [what we include and exclude](./docs/canvaskit-comparison.md))

## Quick Start

### Three.js

```typescript
import { Skia } from '@three-flatland/skia'
import { SkiaCanvas, SkiaRect, SkiaFontLoader } from '@three-flatland/skia/three'

const skia = await Skia.init(renderer) // auto-detects WebGPU or WebGL

const canvas = new SkiaCanvas({ renderer, width: 512, height: 512 })
const rect = new SkiaRect()
rect.x = 10; rect.y = 10; rect.width = 200; rect.height = 100
rect.fill = [1, 0, 0, 1]
canvas.add(rect)

// In your animation loop:
canvas.render(true) // true = invalidate + draw
material.map = canvas.texture
```

### React Three Fiber

```tsx
import { useLoader } from '@react-three/fiber/webgpu'
import { SkiaCanvas, SkiaRect, SkiaFontLoader, attachSkiaTexture } from '@three-flatland/skia/react'

function SkiaPanel() {
  const renderer = useThree((s) => s.gl)
  return (
    <mesh>
      <meshBasicMaterial transparent premultipliedAlpha>
        <SkiaCanvas attach={attachSkiaTexture} renderer={renderer} width={512} height={512}>
          <skiaRect x={10} y={10} width={200} height={100} fill={[1, 0, 0, 1]} />
        </SkiaCanvas>
      </meshBasicMaterial>
    </mesh>
  )
}

// Fonts: useLoader returns a SkiaTypeface, call .atSize() for sized font
function TextDemo() {
  const typeface = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
  const font = typeface.atSize(24)
  return <skiaTextNode text="Hello Skia" font={font} fill={[1, 1, 1, 1]} x={10} y={30} />
}
```

## Import Paths

| Path | Contents |
|------|----------|
| `@three-flatland/skia` | Core API — `Skia`, `SkiaPaint`, `SkiaPath`, `SkiaFont`, `SkiaTypeface` |
| `@three-flatland/skia/three` | Three.js scene graph — `SkiaCanvas`, `SkiaRect`, `SkiaGroup`, shape nodes, loaders |
| `@three-flatland/skia/react` | R3F integration — re-exports everything + `useSkiaContext`, `attachSkiaTexture`, JSX types |

## WASM Setup

**Vite works with zero config** — the WASM loads from `node_modules` automatically during development.

For production or non-Vite bundlers, copy the WASM files to your public directory:

```bash
npx skia-wasm public/skia
```

Then point Skia to them:

```typescript
// Option 1: explicit URL
const skia = await Skia.init(renderer, { wasmUrl: '/skia/skia-gl.wasm' })

// Option 2: env vars (replaced at build time by your bundler)
// webpack.config.js
new DefinePlugin({
  'process.env.SKIA_WASM_URL_GL': JSON.stringify('/skia/skia-gl.wasm'),
  'process.env.SKIA_WASM_URL_WGPU': JSON.stringify('/skia/skia-wgpu.wasm'),
})
```

## Building from Source

Requires [Zig 0.15.1](https://ziglang.org/download/). All other tools are downloaded automatically.

```bash
pnpm --filter=@three-flatland/skia skia:setup
```

| Prerequisite | Install |
|------|---------|
| Zig 0.15.1 | `brew install zig` (macOS) / [ziglang.org](https://ziglang.org/download/) |
| Python 3 | System package manager |
| C/C++ compiler | `xcode-select --install` (macOS) / `build-essential` (Linux) |

WASM toolchain (wasm-tools, wit-bindgen, wasm-opt) is installed locally to `.tools/` with pinned versions and SHA256 verification.

## Skia Version

Pinned to **chrome/m147** (Chrome 147 stable release branch).

## Documentation

Full docs, interactive examples, and API reference at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**

## License

[MIT](./LICENSE)

---

<sub>This README was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).</sub>
