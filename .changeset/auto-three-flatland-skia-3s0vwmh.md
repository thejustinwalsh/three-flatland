---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

**Initial release of `@three-flatland/skia`** — GPU-accelerated 2D vector graphics via Skia compiled to WASM, integrated with Three.js and React Three Fiber.

**Rendering backends**

- WebGL2 (GL) backend: Skia GPU pipeline bridged to the browser's WebGL2 context via custom Zig/C++ shims and auto-generated GL bindings
- WebGPU (Dawn) backend: full WebGPU/Dawn WASM backend with Emscripten compatibility; `SkiaBlitPipeline` composites Skia surfaces onto WebGPU textures
- Runtime backend detection and selection via `loadSkia()` / `initSkia()`

**Three.js scene graph nodes**

- `SkiaCanvas` — root Object3D that owns the Skia surface and drives the render loop
- `SkiaGroup` — container node for grouping and clipping
- `SkiaRect`, `SkiaCircle`, `SkiaOval`, `SkiaLine` — primitive shape nodes
- `SkiaPathNode` — arbitrary vector path node
- `SkiaTextNode` — text rendering node
- `SkiaTextPathNode` — text laid out along a path
- `SkiaSVGNode` — renders SVG documents
- `SkiaImageNode` — renders decoded images
- Loaders: `SkiaFontLoader`, `SkiaSVGLoader`, `SkiaImageLoader`

**Core TypeScript API**

- `SkiaFont` / `SkiaTypeface` — ref-counted, dedup-cached typeface loading (TTF/OTF); `atSize()` creates sized `SkiaFont` instances
- `SkiaPaint` — stroke/fill paint with blend modes, color filters, image filters, path effects, shaders, and masking
- `SkiaPath` — full path API (move, line, arc, conic, cubic, close) plus boolean ops (`op`, `opInto`), simplification (`simplify`, `simplifyInto`), and matrix transforms (`transform`, `transformInto`)
- `SkiaShader` — runtime-effect and gradient shaders (multi-stop linear gradient support)
- `SkiaTextBlob` — pre-shaped text for efficient repeated rendering
- `SkiaImage` — decoded image wrapper
- `SkiaSVG` — parsed SVG document
- `DrawingContext` — low-level canvas draw calls (drawRect, drawPath, drawText, drawImage, etc.)
- Color filters, image filters, path effects, picture recording

**React Three Fiber integration**

- `<SkiaCanvas>` — R3F component wrapping `skiaCanvas`; provides `SkiaContext` to children via React context
- `SkiaReactContext` — React context consumed by `useSkiaContext()`
- `useSkiaContext()` hook — access the nearest `SkiaContext` in R3F trees

**WASM build infrastructure**

- Skia submodule pinned to chrome/m147; Zig build system (`build.zig`)
- Setup scripts: `setup.mjs`, `setup-skia.sh`, `build-wasm.mjs`
- SIMD enabled; Wasm exception handling; compiler optimizations (`-O3`, LTO)
- `HandleTable` with free-list for efficient WASM-side object memory management
- Auto-generated WGPU struct/enum definitions for WASM32 (`wgpu-structs.generated.ts`, `wgpu-enums.generated.ts`)
- `prepack` script copies `.wasm` binaries into the npm package before publish

**Examples**

- `examples/vanilla/skia` and `examples/react/skia` — standalone Vite examples registered in microfrontends.json

Initial release introduces the full `@three-flatland/skia` package: a Skia-to-WASM bridge with WebGL2 and WebGPU rendering backends, a Three.js scene graph for declarative 2D drawing, a React Three Fiber integration layer, and a complete TypeScript API covering paths, paint, fonts, shaders, images, and SVG.

