# @three-flatland/skia

A lightweight alternative to [CanvasKit](https://skia.org/docs/user/modules/canvaskit/) &mdash; Skia's core GPU rendering compiled to a ~1 MB gzipped WASM binary, built with Zig.

Ships only what matters: GPU-accelerated path rendering, SVG, and text shaping. No animation runtime, no paragraph layout, no Lottie &mdash; just the Skia drawing primitives you actually need, at a fraction of the size.

## Features

- **Vector Graphics** &mdash; Full Skia path rendering: fills, strokes, gradients, path ops, SVG path strings
- **SVG** &mdash; Parse and render SVG documents directly on the GPU
- **Text & Fonts** &mdash; FreeType + HarfBuzz text shaping (planned)
- **GPU Accelerated** &mdash; Skia's Ganesh backend renders to WebGL2 with no CPU fallback
- **~1 MB gzipped** &mdash; vs CanvasKit's ~3 MB gzipped &mdash; ships only core drawing + SVG + PathOps
- **No Emscripten** &mdash; Built with Zig for smaller output and a cleaner WASM module

## Installation

```bash
pnpm add @three-flatland/skia
```

## Building from Source

Requires [Zig](https://ziglang.org/download/) (v0.15.1+). All other tools are downloaded automatically.

```bash
# Full setup: install tools, configure Skia, build WASM
pnpm --filter=@three-flatland/skia setup

# Or step by step:
pnpm --filter=@three-flatland/skia setup:check   # Verify prerequisites
pnpm --filter=@three-flatland/skia setup:tools    # Download pinned WASM tools
pnpm --filter=@three-flatland/skia setup          # Full pipeline
```

### Prerequisites

| Tool | Install |
|------|---------|
| Zig 0.15.1 | `brew install zig` (macOS) or [ziglang.org/download](https://ziglang.org/download/) |
| Python 3 | System package manager |
| C compiler | `xcode-select --install` (macOS) or `build-essential` (Linux) |
| Git | System package manager |

WASM toolchain (wasm-tools, wit-bindgen, wasm-opt) is installed locally to `.tools/` with pinned versions and SHA256 verification.

### Browser Test

```bash
npx serve packages/skia -p 3333
open http://localhost:3333/test/browser-test.html
```

## Skia Version

Pinned to Skia **chrome/m147** (Chrome 147 stable release branch). Version and commit tracked in `package.json` under `skiaDependencies`.

## Architecture

```
Browser JS  ←→  WebGL2 Context
    ↕ (GL import bridge)
Skia WASM   ←→  Ganesh GL Backend
    ↕ (Zig C bindings)
Skia C++    ←→  skia_c_api.cpp
```

- **GL Bridge**: JS polyfill layer that maps `emscripten_gl*` WASM imports to WebGL2 API calls, handling WebGL/OpenGL ES string format differences and extension discovery
- **C API**: Thin C wrapper (`skia_c_api.h`) exposing Skia's C++ API to Zig
- **WIT Interface**: Component Model types for the Skia API surface

## License

[MIT](./LICENSE)
