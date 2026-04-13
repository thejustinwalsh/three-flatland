# @three-flatland/skia

## 0.1.0-alpha.3

### Minor Changes

- 4d6d65a: > Branch: feat-examples-tweakplane

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/22

  ### Build
  - Added `.size-limit.cjs` with esbuild plugin to handle WASM stubs and JSON imports from `@three-flatland/skia` during bundle analysis
  - Added `scripts/size-limit.mjs` — wrapper that filters missing entries for base-branch compat and appends raw + brotli sizes for Skia WASM binaries
  - `packages/skia/tsup.config.ts`: copies `wgpu-layouts.json` to `dist/` on build success (file was silently missing from published output)

  ### Bug fixes
  - `useSkiaContext` — moved `useThree` call unconditionally before all early returns to satisfy `react-hooks/rules-of-hooks`; hook now works correctly in all resolution paths (nearest context, alive singleton, pending init, fresh init)
  - Added comprehensive tests for all `useSkiaContext` resolution cases, including Suspense and strict-mode regression guards

  ### Examples
  - All plain Three.js examples reorganised from `examples/vanilla/` to `examples/three/`

  `@three-flatland/skia` now ships the `wgpu-layouts.json` asset in its dist output, fixing a silent runtime failure when loading WebGPU shaders.

## 0.1.0-alpha.2

### Minor Changes

- 5c61bd6: > Branch: feat-skia

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/19

  ### Initial Release — `@three-flatland/skia`

  **WASM Build & Backends**
  - Skia compiled to WASM via Zig from chrome/m147 submodule
  - WebGL backend with JS GL host shim for WASM WebGL imports
  - WebGPU (Dawn) backend with WASM32 struct definitions and Emscripten compatibility patches
  - SIMD enabled; WASM optimized with wasm-opt
  - Exception handling and custom font manager in WASM build
  - `SKIA_WASM_URL_GL` / `SKIA_WASM_URL_WGPU` env vars for bundler-time WASM URL overrides
  - `prepack.mjs` copies WASM assets into the package before publish

  **Drawing API**
  - `SkiaPaint` — fill/stroke, colors, gradients (multi-stop linear), blend modes
  - `SkiaPath` — vector paths with boolean ops, simplification, in-place transforms, path effects
  - `SkiaPathEffect` / `SkiaPathMeasure` — dash, path effects, path measurement
  - `SkiaDrawingContext` — canvas API (draw rect, oval, circle, line, path, image, text, SVG)
  - `SkiaImage` / `SkiaImageFilter` / `SkiaColorFilter` — image and filter support
  - `SkiaShader` — custom shaders
  - `SkiaTextBlob` — shaped text rendering
  - `SkiaSVG` — SVG rendering via SkSVGDOM
  - `SkiaPicture` — record and replay drawing commands

  **Font System**
  - New `SkiaTypeface` class — ref-counted typeface with dedup cache; call `.atSize(n)` for sized `SkiaFont` instances
  - `SkiaFont.fromData(ctx, bytes, size)` static factory for standalone font creation
  - `SkiaFontLoader` — Three.js `Loader` compatible, cached by URL, returns `SkiaTypeface`

  **Scene Graph (Three.js Objects)**
  - `SkiaCanvas` (`Object3D`) — main rendering surface; WebGL state save/restore around Skia draws
    - Overlay mode: blits Skia output over the 3D scene with premultiplied alpha
    - Texture mode: renders Skia into a `WebGLRenderTarget` / `GPURenderTarget`
    - `render(invalidate?)` — pass `true` to force redraw; `invalidate()` to mark dirty
  - `SkiaGroup` — group node for scene graph composition
  - Shape nodes: `SkiaRect`, `SkiaCircle`, `SkiaOval`, `SkiaLine`
  - Content nodes: `SkiaImageNode`, `SkiaSVGNode`, `SkiaTextNode`, `SkiaPathNode`, `SkiaTextPathNode`
  - `SkiaImageLoader` / `SkiaFontLoader` / `SkiaSVGLoader` — R3F `useLoader`-compatible loaders

  **React Integration**
  - `<SkiaCanvas>` R3F component — wraps `SkiaCanvas` with React context
  - `useSkiaContext()` — returns `SkiaContext` (never null); suspends via `React.use()` until init completes; wrap consumers in `<Suspense>`
  - `Skia.init(renderer)` stores the in-flight promise as `Skia.pending` for deferred resolution

  **WebGPU Blit Pipeline**
  - `SkiaBlitPipeline` — GPU blit from Skia (BGRA) to render target (RGBA) with optional alpha blend
  - Overlay mode uses `copyTextureToTexture` + alpha compositing onto the canvas surface

  ## BREAKING CHANGES
  - **`SkiaFontLoader` return type changed** — now returns `SkiaTypeface` instead of `SkiaFont`. Call `.atSize(size)` to obtain a `SkiaFont`. `SkiaFontLoaderOptions`, `loader.size`, and `SkiaFontLoader.defaultSize` have been removed.
  - **`SkiaFont` constructor is internal** — use `SkiaFont.fromData(ctx, data, size)` or `SkiaTypeface.atSize(size)` instead of `new SkiaFont(ctx, data, size)`.
  - **`useSkiaContext()` is no longer nullable** — the hook now returns `SkiaContext` (not `SkiaContext | null`) and uses React `use()` to suspend. Wrap consuming components in `<Suspense>`.
  - **`SkiaCanvas.render()` signature changed** — the `renderer` argument is removed; the renderer is now stored internally. Use `canvas.render()` or `canvas.render(true)` to force redraw.

  Initial release of `@three-flatland/skia`, providing Skia vector graphics rendering for Three.js with WebGL and WebGPU backends, a full drawing API, a scene graph, and React Three Fiber integration.
