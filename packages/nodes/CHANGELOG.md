# @three-flatland/nodes

## 0.1.0-alpha.8

### Minor Changes

- ea7ec3d: > Branch: feat/oklch-color-main

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/123

  ### e1167303647acd572b4cfdd6ea435f6410bdbe90

  fix: correct Color color-space semantics, exact sRGB transfer, TSL dedup
  Review-cycle fixes for the ported suite (this is its first review):

  CPU (three-flatland/src/color):
  - colorToOklab / oklabToColor / relativeLuminance now treat Color
    components as working-space Linear-sRGB (the three.js default since
    r152) instead of double-applying the sRGB transfer; srgbToLinear /
    linearToSrgb remain for explicit gamma-encoded values
  - tests hardened with absolute Ottosson/CSS Color 4 reference values,
    exact mid-gray luminance, exact 21:1 black/white contrast, and a
    non-cancelling round-trip through the Color type

  TSL (@three-flatland/nodes/color):
  - exact IEC 61966-2-1 transfer via three/tsl sRGBTransferEOTF/OETF
    (replaces the pow-2.2 approximation; GPU now matches CPU)
  - gamma entry points clamp input to [0,1] (kills pow-on-negative NaN)
  - reuse three/tsl cbrt and TWO_PI; drop local re-implementations
  - oklchLerp reuses the shared OKLAB<->OKLCH polar helpers from oklch.ts
  - conversion cores wrapped in Fn() so composed calls emit shader
    function invocations instead of re-inlined subgraphs; typed through a
    narrow adapter (array-inputs Fn overload is runtime-supported but
    missing from some @types/three resolutions)
    Files: packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/interpolation.test.ts
    Stats: 11 files changed, 208 insertions(+), 85 deletions(-)

  ### 3ba7af85461c0ba7bc153aaf28c47155075b7cd5

  feat: port OKLAB/OKLCH color suite onto the current layout
  Re-homes the orphaned worktree-oklch-color work (39086a1f, based on a
  pre-alpha-6 tree) onto main:
  - @three-flatland/nodes: oklab/oklch/oklchLerp TSL nodes alongside the
    existing color nodes, exported from the color index
  - three-flatland: new src/color/ CPU-side suite (conversions, distance,
    gamut, harmony, interpolation, palette) with ./color package exports
    and a generated react subpath wrapper (pnpm sync:react)

  Adapted to current conventions: import type for type-only imports,
  dropped an unused import, prettier formatting.
  Files: packages/nodes/src/color/contrast.ts, packages/nodes/src/color/hueShift.ts, packages/nodes/src/color/index.ts, packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/package.json, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/gamut.test.ts, packages/three-flatland/src/color/gamut.ts, packages/three-flatland/src/color/harmony.test.ts, packages/three-flatland/src/color/harmony.ts, packages/three-flatland/src/color/index.ts, packages/three-flatland/src/color/interpolation.test.ts, packages/three-flatland/src/color/interpolation.ts, packages/three-flatland/src/color/palette.test.ts, packages/three-flatland/src/color/palette.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/color/index.ts
  Stats: 25 files changed, 1497 insertions(+), 6 deletions(-)

- 0033ea6: > Branch: feat/oklch-color-main

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/123

  ### cc96f8702ab41e81980f329f3829f21fc0bc890f

  fix: correct Color color-space semantics, exact sRGB transfer, TSL dedup
  Review-cycle fixes for the ported suite (this is its first review):

  CPU (three-flatland/src/color):
  - colorToOklab / oklabToColor / relativeLuminance now treat Color
    components as working-space Linear-sRGB (the three.js default since
    r152) instead of double-applying the sRGB transfer; srgbToLinear /
    linearToSrgb remain for explicit gamma-encoded values
  - tests hardened with absolute Ottosson/CSS Color 4 reference values,
    exact mid-gray luminance, exact 21:1 black/white contrast, and a
    non-cancelling round-trip through the Color type

  TSL (@three-flatland/nodes/color):
  - exact IEC 61966-2-1 transfer via three/tsl sRGBTransferEOTF/OETF
    (replaces the pow-2.2 approximation; GPU now matches CPU)
  - gamma entry points clamp input to [0,1] (kills pow-on-negative NaN)
  - reuse three/tsl cbrt and TWO_PI; drop local re-implementations
  - oklchLerp reuses the shared OKLAB<->OKLCH polar helpers from oklch.ts
  - conversion cores wrapped in Fn() so composed calls emit shader
    function invocations instead of re-inlined subgraphs; typed through a
    narrow adapter (array-inputs Fn overload is runtime-supported but
    missing from some @types/three resolutions)
    Files: packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/interpolation.test.ts
    Stats: 11 files changed, 208 insertions(+), 85 deletions(-)

  ### 2760f64794e3a6eed3e8814be9c43f9daeddda2f

  feat: port OKLAB/OKLCH color suite onto the current layout
  Re-homes the orphaned worktree-oklch-color work (39086a1f, based on a
  pre-alpha-6 tree) onto main:
  - @three-flatland/nodes: oklab/oklch/oklchLerp TSL nodes alongside the
    existing color nodes, exported from the color index
  - three-flatland: new src/color/ CPU-side suite (conversions, distance,
    gamut, harmony, interpolation, palette) with ./color package exports
    and a generated react subpath wrapper (pnpm sync:react)

  Adapted to current conventions: import type for type-only imports,
  dropped an unused import, prettier formatting.
  Files: packages/nodes/src/color/contrast.ts, packages/nodes/src/color/hueShift.ts, packages/nodes/src/color/index.ts, packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/package.json, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/gamut.test.ts, packages/three-flatland/src/color/gamut.ts, packages/three-flatland/src/color/harmony.test.ts, packages/three-flatland/src/color/harmony.ts, packages/three-flatland/src/color/index.ts, packages/three-flatland/src/color/interpolation.test.ts, packages/three-flatland/src/color/interpolation.ts, packages/three-flatland/src/color/palette.test.ts, packages/three-flatland/src/color/palette.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/color/index.ts
  Stats: 25 files changed, 1497 insertions(+), 6 deletions(-)

### Patch Changes

- 75fcf94: > Branch: feat/esm-oxc-migration

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/196
  - Fixed all real-source oxlint errors across the monorepo (0 errors remaining); `exhaustive-deps` kept as advisory warnings, matching prior eslint config
  - Applied oxlint autofixes and reformatting (unused imports/vars removed, `import type` enforced, floating promises voided, useless spreads removed)
  - Excluded e2e/spec test harnesses from lint scope (previously uncovered by eslint)
  - No functional/API changes — internal code-quality and tooling cleanup only, verified via typecheck (45/45) and build (46/46)

  No breaking changes.

  Internal lint and code-quality cleanup as part of the ESM/oxlint migration; no user-facing behavior changes.

## 0.1.0-alpha.7

### Minor Changes

- dea6d18: > Branch: lighting-stochastic-adoption

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/27
  - New `shadowSDF2D` TSL helper: sphere-traces soft shadows through an SDF texture with Inigo-Quilez penumbra term; configurable steps, softness, startOffset, and eps
  - Signed SDF via dual JFA chains: occluder and empty texels each run JFA independently, combined as `distOutside - distInside`; self-shadow detection uses clean `sdf < 0` instead of an epsilon approximation
  - `shadowStartOffset` promoted to a tunable `FloatInput` option; default raised to 40 to clear typical sprite radii without self-shadowing artifacts
  - Off-screen lights no longer cast false edge shadows: `worldToSDFUV` no longer clamps sample UVs; out-of-field samples advance by the eps floor
  - SDF now regenerated on `OrthographicCamera.zoom` changes (was frozen despite occluder movement when zoom scaled the projection)
  - `shadowFilter` option (`auto|nearest|linear`) on shadow sampling; `auto` picks nearest for pixel-art snap mode, linear otherwise
  - `shadowBias` semantics split: `shadowBias` is the IQ hit epsilon; `shadowStartOffset` handles self-shadow escape
  - Penumbra math corrected
  - Removed unused lighting providers and loaders from the index barrel

  ## BREAKING CHANGES
  - `shadowBias` no longer doubles as a self-shadow escape; migrate start-offset tuning to `shadowStartOffset`
  - JFA debug buffer names changed: `sdf.jfaPing/Pong` split into `sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`

  Completes the TSL shadow node suite with signed SDF, sphere-trace soft shadows, and per-light shadow control.

## 0.1.0-alpha.3

### Patch Changes

- f451a83: > Branch: feat-skia

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/19
  - Version bump to align with `@three-flatland/skia` release

  Patch release with no API changes — version bump only.

## 0.1.0-alpha.1

### Minor Changes

- 96371ed: ## Initial alpha release of `@three-flatland/nodes`

  ### Package structure
  - First real implementation — replaces the empty placeholder package
  - Full set of TSL (Three Shader Language) shader node functions now exported from the package root and per-category subpaths (`alpha`, `analog`, `blur`, `color`, `display`, `distortion`, `retro`, `sprite`, `upscale`, `vfx`, and individual node wildcard paths)
  - Added `source` condition to all export entries for build-free monorepo development

  ### Node categories
  - **Sprite/UV**: `sampleSprite`, `uvFlip`, `uvOffset`, `uvRotate`, `uvScale`, `pixelate`, `outline`
  - **Color**: `brightness`, `contrast`, `saturate`, `tint`, `hueShift`, `colorRemap`
  - **Alpha**: `alphaMask`, `alphaTest`, `dissolve`, `fadeEdge`
  - **Retro**: `bayerDither`, `colorReplace`, `palettize`, `posterize`, `quantize`, `consolePalettes`
  - **Distortion**: `distort`, `distortNoise`, `wave`
  - **VFX**: `afterimage`, `flash`, `pulse`, `shimmer`, `sparkle`, `trail`
  - **Blur**: `bloom`, `blurBox`, `blurGaussian`, `blurKawase`, `blurMotion`, `blurRadial`
  - **Display**: `crtEffects`, `lcd`, `phosphorMask`, `scanlines`
  - **Analog**: `chromaticAberration`, `videoArtifacts`
  - **Upscale**: `eagle`, `hq2x`, `scale2x`

  ### Documentation
  - Added `packages/nodes/README.md` and `packages/nodes/LICENSE` (MIT)
  - Repository URL corrected to `https://github.com/thejustinwalsh/three-flatland.git`

  ### BREAKING CHANGES
  - Package was previously a placeholder with no exported nodes; all imports will need to be updated to use the new per-category subpath exports (e.g. `@three-flatland/nodes/color`, `@three-flatland/nodes/blur`)

  This is the first functional release of `@three-flatland/nodes`, delivering a complete library of TSL shader nodes for sprite rendering, color grading, retro effects, and post-processing.

## 0.1.0-alpha.0

### Minor Changes

- Alpha release: Consolidate core+react into single `three-flatland` package with `/react` subpath, extract TSL nodes to `@three-flatland/nodes` with per-category subpaths, and use preserved module structure for maximum tree-shakeability.
