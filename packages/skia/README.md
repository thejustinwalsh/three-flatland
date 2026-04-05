# @three-flatland/skia

A lightweight alternative to [CanvasKit](https://skia.org/docs/user/modules/canvaskit/) &mdash; Skia's core GPU rendering in ~1 MB (brotli), compiled to WebAssembly with Zig. Vector graphics, text, image filters, shaders, and path effects — without the 2.9 MB CanvasKit tax.

<p align="center">
  <img src="./docs/hero.gif" alt="@three-flatland/skia browser demo" width="512" />
</p>

## Features

- **GPU-Accelerated Drawing** &mdash; Skia's Ganesh backend renders directly to WebGL2
- **Vector Graphics** &mdash; Paths, fills, strokes, gradients, arcs, rounded rects, circles, ovals, double rounded rects, clipping
- **PathOps** &mdash; Boolean path operations (union, intersect, difference, XOR, simplify)
- **Path Effects** &mdash; Dash, corner rounding, discrete jitter, trim, path stamps (1D and 2D), composition
- **Image Filters** &mdash; Blur, drop shadow, offset, morphology (dilate/erode), displacement map, blend, matrix transform, composition
- **Color Filters** &mdash; Blend, 4x5 color matrix, lerp, luma, per-channel lookup tables, gamma conversion
- **Shaders** &mdash; Perlin noise (fractal, turbulence), image tiling, all gradient types, solid color, blend
- **Text** &mdash; FreeType glyph rendering, font loading from TTF/OTF, text measurement, font metrics (ascent/descent/leading), glyph IDs and widths, text blobs
- **Images** &mdash; Draw raster images, image-rect cropping/scaling, pixel readback, browser-native decoding (no codecs in WASM)
- **Picture Recording** &mdash; Record drawing commands into immutable pictures for efficient replay
- **Three.js Integration** &mdash; Object3D scene graph (SkiaCanvas, SkiaGroup, shape nodes), R3F JSX support
- **~1 MB brotli** &mdash; less than half the size of CanvasKit (1,020 KB vs 2,195 KB)
- **90% test coverage** &mdash; 152 tests validate every API against the real WASM binary

## Installation

```bash
pnpm add @three-flatland/skia
```

## Building from Source

Requires [Zig](https://ziglang.org/download/) (v0.15.1+). All other tools are downloaded automatically.

```bash
pnpm --filter=@three-flatland/skia skia:setup
```

### Prerequisites

| Tool | Install |
|------|---------|
| Zig 0.15.1 | `brew install zig` (macOS) or [ziglang.org/download](https://ziglang.org/download/) |
| Python 3 | System package manager |
| C, C++ compilers | `xcode-select --install` (macOS) or `build-essential` (Linux) |

WASM toolchain (wasm-tools, wit-bindgen, wasm-opt) is installed locally to `.tools/` with pinned versions and SHA256 verification.

### Browser Test

```bash
npx serve packages/skia -p 3333
open http://localhost:3333/test/browser-test.html
```

## Guides

- [Three.js Integration](./docs/three.md) &mdash; Object3D scene graph, components, loaders, and effects
- [React Three Fiber](./docs/react.md) &mdash; JSX elements, hooks, and caveats

## How It Compares to CanvasKit

See [docs/canvaskit-comparison.md](./docs/canvaskit-comparison.md) for what we exclude and why.

## Skia Version

Pinned to Skia **chrome/m147** (Chrome 147 stable release branch).

## License

[MIT](./LICENSE)
