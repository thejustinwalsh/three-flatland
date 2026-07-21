# @three-flatland/skia

## 0.1.0-alpha.5

### Patch Changes

- 17d0eae: > Branch: feat/nx-migration

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/197

  ### ffad0dd0ccd96ec1bddd637fb4a5e4a4269a7c9a

  fix: emit wgpu-layouts.json to dist root so consumers can bundle it
  The built dist/ts/wasm-loader-wgpu.js imports "../wgpu-layouts.json" (root:'src'
  places the external JSON asset at the dist ROOT, not mirrored under ts/), but the
  tsdown build:done hook copied it to dist/ts/wgpu-layouts.json — one directory below
  where the import points. Any consumer bundling @three-flatland/skia hit 'Could not
  resolve ../wgpu-layouts.json'. Copy it to dist/wgpu-layouts.json to match the
  emitted import. Surfaced by the consumer smoke test.
  Files: packages/skia/tsdown.config.ts
  Stats: 1 file changed, 6 insertions(+), 2 deletions(-)

  ### 1745f92f91d8fa491d89172b198942c7da941203

  fix: load test wasm from lib/ not the removed dist/skia-_/ path
  The final wasm relocated from dist/skia-_/ to lib/ in the binary-artifacts
  unification, but test/setup.ts (and the browser-test harness) still read the old
  dist/skia-gl/skia-gl.wasm path. On CI that file no longer exists, so every skia
  API test file failed to collect with ENOENT — only wasm-loader-shared.test.ts
  (which never opens the file) passed. Point both at lib/skia-\*.wasm, the tracked
  nx build output.

  Verified locally: 295 tests pass; the only remaining locals failures are the two
  font tests that read the skia submodule's resources/fonts/abc.ttf, absent on this
  machine — CI checks out submodules:true so they pass there.
  Files: packages/skia/test/browser-test.html, packages/skia/test/setup.ts
  Stats: 2 files changed, 6 insertions(+), 6 deletions(-)

  ### 7345ff8f15b3992f31a35913a213f6790d836d80

  fix: make --ensure freshness source-aware so CI recompiles on skia changes
  The old --ensure early-exit (and build-wasm.mjs --skip-if-fresh) skipped whenever
  lib/\*.wasm merely EXISTED, ignoring whether the wasm sources changed. So a skia-
  source PR would cache-miss nx, run setup.mjs --ensure, early-exit on the stale
  committed libs, and the commit-skia-libs job would commit nothing — the compiled
  libs never got rebuilt. That defeats the whole committed-libs flow.

  Now --ensure decides freshness by a content hash of the wasm sources (build.zig,
  build.zig.zon, src/zig, patches, vendor, wit + the skia submodule tree SHA; TS/
  production deliberately excluded so a pure-TS change never forces a multi-minute
  recompile). Fresh iff the libs exist AND lib/.wasm-sources.sha256 matches the
  current hash → skip; otherwise compile and rewrite the stamp. This is the single
  'script checks for libs, else builds' entry — no second graph target.
  - stamp is a build output + committed by the commit-skia-libs CI job, so a fresh
    checkout knows the committed libs match the committed sources
  - removed the dead/buggy build-wasm.mjs --skip-if-fresh (existsSync, not source-
    aware); build-wasm.mjs always compiles now, freshness lives in setup.mjs
  - added a --wasm-hash debug flag to diagnose CI rebuild decisions
  - seeded the stamp (verified the committed libs match current wasm sources)
    Files: .github/workflows/ci.yml, packages/skia/lib/.wasm-sources.sha256, packages/skia/package.json, packages/skia/scripts/build-wasm.mjs, packages/skia/scripts/setup.mjs
    Stats: 5 files changed, 456 insertions(+), 407 deletions(-)

  ### 957f9195e729420953cbfa7605f2c1a9619e309d

  fix: use committed wasm libs on non-building hosts, never remote-fetch
  The compiled lib/\*.wasm are committed to the repo now (CI rebuilds and commits
  them on skia changes), so the old remote-prebuilt fetch would overwrite the
  tracked libs with a stale published version and dirty git history. Drop it.

  On a host that can't compile (macOS 27 / ziglang#31658), setup.mjs and
  build-wasm.mjs now use the committed libs when present and fail hard when
  they're missing — never fetch. Remove the dead skia:fetch-wasm script and its
  stale prebuilt-wasm.json manifest; rename prebuilt-wasm.mjs to host-capability.mjs
  since only the canBuildWasm host probe survives.
  Files: packages/skia/package.json, packages/skia/prebuilt-wasm.json, packages/skia/scripts/build-wasm.mjs, packages/skia/scripts/host-capability.mjs, packages/skia/scripts/prebuilt-wasm.mjs, packages/skia/scripts/setup.mjs
  Stats: 6 files changed, 79 insertions(+), 178 deletions(-)

  ### 2db3d32297c43bfec1ac99b037315ef9a7093803

  fix: restore the setup.mjs --ensure build pipeline; revert phase-4a wasm CI
  The phase-4a "commit the wasm binaries" experiment broke skia: I had changed
  skia's `build` from `setup.mjs --ensure && tsdown` to bare `tsdown`, and wired a
  `build:wasm` nx target + commit-artifact CI job that ran `build-wasm.mjs`
  DIRECTLY. But build-wasm.mjs assumes setup already ran — setup.mjs is what runs
  setup-skia.sh (deps, PATCHES, GN, source extraction that generates
  skia_sources.zig for the wasm target). Skipping it made zig compile unpatched,
  platform-wrong skia (darwin ports: ApplicationServices.h, malloc/malloc.h) for
  wasm32-wasi → the build failed, and the build job's skia test failed for want of
  wasm.

  Restore the working flow (as main had it):
  - skia `build` = `node scripts/setup.mjs --ensure && tsdown` — the full pipeline
    builds the wasm from patched sources, then tsdown.
  - Replace the broken `build:wasm` nx target with an explicit `build` target that
    caches `lib/*.wasm` as outputs keyed on the wasm sources (build.zig, src/zig,
    patches, submodule SHA) — so nx rebuilds the binary ONLY when those change
    (the "only produce a new binary when it should" goal, via cache not commits).
  - Remove commit-artifact.yml, the ci.yml skia-wasm job, and the changes.yml
    skia_native filter.
  - test:skia: `run build:wasm` → `run build` (setup runs first).

  Also restore the CI build matrix to lts/\* + lts/-1 — the hedge that we still
  work on the previous LTS (I wrongly dropped it when bumping to node 24).
  Files: .github/workflows/changes.yml, .github/workflows/ci.yml, .github/workflows/commit-artifact.yml, package.json, packages/skia/package.json
  Stats: 5 files changed, 13 insertions(+), 180 deletions(-)

## 0.1.0-alpha.4

### Patch Changes

- 75fcf94: > Branch: feat/esm-oxc-migration

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/196
  - Fixed all real-source oxlint errors across the monorepo (0 errors remaining); `exhaustive-deps` kept as advisory warnings, matching prior eslint config
  - Applied oxlint autofixes and reformatting (unused imports/vars removed, `import type` enforced, floating promises voided, useless spreads removed)
  - Excluded e2e/spec test harnesses from lint scope (previously uncovered by eslint)
  - No functional/API changes — internal code-quality and tooling cleanup only, verified via typecheck (45/45) and build (46/46)

  No breaking changes.

  Internal lint and code-quality cleanup as part of the ESM/oxlint migration; no user-facing behavior changes.

- e8b5d17: > Branch: claude/skia-rendering-regression-b1d604

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/186
  - Fix blank/broken Skia rendering in Safari caused by a WASM init failure on MIME-type fallback paths (e.g. behind a cross-origin redirect)
    - `instantiateWasm` now streams from `res.clone()` so the original response body stays unread, letting the `res.arrayBuffer()` fallback succeed instead of throwing `TypeError: body stream already read`
    - Added regression tests modeling real single-read `Response` body semantics

  Fixes a Safari-specific blank render bug in `@three-flatland/skia`'s WASM loader where the MIME-type fallback path crashed instead of recovering.

- 739afb7: > Branch: fix/skia-prebuilt-wasm-fallback

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/164

  ### Fixes
  - Fix `skia:fetch-wasm` CLI entrypoint check silently no-op'ing on Windows — now uses a portable `resolve(argv[1]) === fileURLToPath(url)` comparison instead of a raw `file://` string match.
  - Fix hard-coded `:` PATH separator across `build-wasm`, `compare-builds`, `setup`, and `prebuilt-wasm` scripts (broke on Windows); now uses `path.delimiter`.
  - Fix `fetchPrebuiltWasm` silently reporting success when only some requested WASM variants were present in the manifest — now requires every requested variant to match before copying, preventing missing artifacts from going unnoticed.
  - Add timeouts to external command invocations (Zig probe: 15s, `npm pack`/`tar`: 60s/30s) and switch to `execFileSync` to avoid shell interpolation and indefinite hangs.

  Hardens the prebuilt-WASM fetch path against review feedback: fixes cross-platform bugs and prevents silent partial failures or hung processes during WASM setup.

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
