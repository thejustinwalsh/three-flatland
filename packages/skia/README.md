# @three-flatland/skia

GPU-accelerated 2D vector graphics for [Three.js](https://threejs.org/) — Skia compiled to WASM with Zig. Includes a native WebGPU backend (Graphite/Dawn) alongside WebGL — CanvasKit's npm package ships WebGL only. A lightweight alternative at less than half the size.

Part of the [**three-flatland**](https://github.com/thejustinwalsh/three-flatland) ecosystem.

> **Alpha** — API is stabilizing. Expect minor breaking changes between releases.

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

## Install

```bash
npm install @three-flatland/skia@alpha
```

Peer dependencies: `three >= 0.183.1`. For React: `@react-three/fiber >= 10.0.0-alpha.2`, `react >= 19`.

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

// Fonts: useLoader returns a SkiaTypeface, call .atSize() for sized fonts
function TextDemo() {
  const typeface = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
  const font = typeface.atSize(24)
  return <skiaTextNode text="Hello Skia" font={font} fill={[1, 1, 1, 1]} x={10} y={30} />
}
```

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

## Import Paths

| Path | Contents |
|------|----------|
| `@three-flatland/skia` | Core API — `Skia`, `SkiaPaint`, `SkiaPath`, `SkiaFont`, `SkiaTypeface` |
| `@three-flatland/skia/three` | Three.js scene graph — `SkiaCanvas`, `SkiaRect`, `SkiaGroup`, shape nodes, loaders |
| `@three-flatland/skia/react` | R3F integration — re-exports everything + `useSkiaContext`, `attachSkiaTexture`, JSX types |

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

- [Skia Guide](https://thejustinwalsh.com/three-flatland/guides/skia/) — full API walkthrough
- [Skia Example](https://thejustinwalsh.com/three-flatland/examples/skia/) — interactive demo
- [Three.js Integration](./docs/three.md) — scene graph, components, loaders
- [React Three Fiber](./docs/react.md) — JSX elements, hooks, attach helpers
- [CanvasKit Comparison](./docs/canvaskit-comparison.md) — what we include, exclude, and why
- [Architecture](./docs/ARCHITECTURE.md) — build system, WASM pipeline, internals
- [three-flatland](https://github.com/thejustinwalsh/three-flatland) — parent project

## License

[MIT](./LICENSE)
