# CanvasKit vs @three-flatland/skia

Both ship Skia compiled to WebAssembly. CanvasKit is Google's official build via Emscripten. We compile with Zig, targeting a smaller binary with only the features needed for 2D vector graphics.

## What CanvasKit Has That We Don't

| Feature | Why Excluded |
|---|---|
| **WebGPU (Graphite)** | Planned |
| **CPU Fallback** | GPU-only; WebGL2 is universal |
| **SVG Rendering** | Only SVG Paths; full SVG excluded |
| **Brotli (WOFF2)** | ~50 KB gz; use TTF/OTF instead |
| **Text Shaping (HarfBuzz)** | ~100 KB gz; complex script shaping (Arabic, Devanagari) not in scope |
| **Paragraph Layout (skparagraph)** | ~150 KB gz; use browser layout for paragraph text |
| **Internationalization (ICU)** | ~400 KB gz; Unicode tables |
| **Lottie Animations (Skottie)** | ~200 KB gz; use a dedicated Lottie player |
| **Image Codecs (PNG/JPEG/WebP)** | ~150 KB gz; browser decodes natively |
| **Canvas: drawPoints** | Use paths for point rendering |
| **Canvas: drawVertices** | Use Three.js for geometry |
| **Canvas: drawAtlas** | Use Three.js for sprite batching |
| **Canvas: drawPatch (Coons)** | Niche; not in scope |
| **Shader: SkSL runtime effects** | Custom shader runtime; not in scope |
| **ImageFilter: runtime shader** | Depends on SkSL |

## What We Add

| Feature | Why |
|---|---|
| **WASM SIMD** | 96% browser support; CanvasKit disables it. Accelerates path tessellation and color math |
| **Native WASM exceptions** | Smaller than Emscripten's JS-based setjmp shim |
| **wasm-opt post-processing** | Whole-program dead code elimination + size optimization |
| **Three.js scene graph** | Object3D nodes, loaders, R3F JSX — CanvasKit has no framework integration |

## Size Comparison

Measured from `canvaskit-wasm@0.41.0` on npm vs our build output.

| | Unpacked | Gzipped | Brotli |
|---|---|---|---|
| **CanvasKit** | 6.8 MB | 2,834 KB | 2,195 KB |
| **@three-flatland/skia** | 3.2 MB | 1,271 KB | 1,020 KB |
| **Savings** | 53% smaller | 55% smaller | 54% smaller |

## Compiler

| | CanvasKit | @three-flatland/skia |
|---|---|---|
| **Toolchain** | Emscripten (emcc) | Zig (clang backend) |
| **Optimization** | Default release | ReleaseSmall (`-Oz`) |
| **Post-link optimizer** | None | wasm-opt `-Oz` |

## WASM Features

| Feature | CanvasKit | @three-flatland/skia |
|---|:---:|:---:|
| **SIMD (128-bit)** | Disabled | Enabled |
| **Tail Call** | Disabled | Enabled |
| **setjmp/longjmp** | Emscripten JS shim | Native WASM exception instructions |

## Compiler Flags

| Flag | CanvasKit | @three-flatland/skia | Purpose |
|---|:---:|:---:|---|
| `-fno-math-errno` | No | Yes | Skip errno checks on math calls |
| `-fno-signed-zeros` | No | Yes | Treat -0.0 as +0.0 |
| `-ffp-contract=fast` | Off | Yes | Allow fused multiply-add |
| `-DSKVX_DISABLE_SIMD` | Yes | No | We enable WASM SIMD |
