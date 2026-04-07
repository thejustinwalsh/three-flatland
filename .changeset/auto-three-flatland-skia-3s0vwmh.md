---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

**Core drawing API**
- New `SkiaPaint`, `SkiaPath`, `SkiaFont`, `SkiaTypeface` classes for Skia GPU drawing
- New `SkiaShader`, `SkiaTextBlob`, `SkiaPathEffect`, `SkiaPathMeasure` classes
- New `SkiaImageFilter`, `SkiaColorFilter` for blur, drop-shadow, and color-matrix effects
- New `SkiaPicture` and `SkiaPictureRecorder` for deferred/recorded drawing
- New `SkiaImage` and `SkiaDrawingContext` for GPU-accelerated 2D rendering
- In-place path boolean ops, simplification, and transformation (no extra allocation)
- `SkiaColorFilter.blend/matrix` and `SkiaImageFilter.blur/dropShadow` accept an `existing` param to skip re-creation when params are unchanged

**Three.js scene graph integration**
- `SkiaCanvas` (`Object3D`) renders Skia content into a Three.js scene via an offscreen framebuffer; supports both WebGL and WebGPU renderers
- Scene graph nodes: `SkiaRect`, `SkiaCircle`, `SkiaOval`, `SkiaLine`, `SkiaPathNode`, `SkiaTextNode`, `SkiaImageNode`, `SkiaTextPathNode`
- `SkiaGroup` for grouping and layering Skia draw nodes
- `SkiaNode` base class for custom Skia drawing nodes
- `SkiaFontLoader` and `SkiaImageLoader` (Three.js `Loader` subclasses) for asset loading
- `attachSkiaTexture` R3F attach helper — binds the canvas output texture to a material `map` property
- `getFBOId` utility for extracting the GL framebuffer handle from a Three.js render target

**React Three Fiber integration** (`@three-flatland/skia/react`)
- `<SkiaCanvas>` React wrapper component providing `SkiaContext` to children via React context
- `useSkiaContext()` hook to access the Skia context from any child component
- `useSkiaDraw()` hook for imperative per-frame drawing callbacks
- `SkiaReactContext` React context for manual context access
- JSX type augmentation for all Skia scene graph nodes (import from `/react` subpath)

**Backends**
- WebGL (Ganesh) backend: initialize with any `WebGL2RenderingContext` or Three.js renderer
- WebGPU (Graphite/Dawn) backend: initialize with a `GPUDevice`; `SkiaContext.backend` reports which is active
- `SkiaBackend` type (`'webgl' | 'wgpu' | 'auto'`) controls backend preference at init time
- WebGPU blit pipeline for compositing Skia textures into Three.js with alpha support

**Initialization API**
- `Skia.init(renderer, options?)` initializes the WASM module; concurrent calls are deduplicated and return the same promise
- `Skia.pending` getter exposes the in-flight init promise (null if not yet called)
- `Skia.preload()` for prefetching the WASM binary before init
- `Skia.context` getter returns the active `SkiaContext` or null

**Font handling**
- `SkiaTypeface` is now ref-counted with a per-context dedup cache; multiple `SkiaFont` instances at different sizes share the same underlying typeface
- `SkiaTypeface.atSize(size, context?)` creates (or returns cached) `SkiaFont` at a given point size
- `SkiaFontLoader` integrates with Three.js / R3F `useLoader` for URL-based font loading

**Build & packaging**
- WASM built from Skia **chrome/m147** pinned branch via Zig cross-compilation
- Dual WASM builds: `skia-gl` (WebGL/Ganesh) and `skia-wgpu` (WebGPU/Graphite); each loaded on demand
- SIMD and exception-handling enabled in WASM output for performance
- `skia-wasm` CLI binary (`bin/copy-wasm.mjs`) for copying WASM files into app `public/` directories
- `prepack` script ensures WASM artifacts are present before npm publish
- Third-party C dependencies vendored to eliminate build-time rate-limit failures
- Debug/release WASM variants excluded from the published package

Initial release of `@three-flatland/skia` — a lightweight Skia WASM package (~1 MB) providing GPU-accelerated 2D vector graphics, text, and image rendering for Three.js and React Three Fiber apps, supporting both WebGL and WebGPU backends.
