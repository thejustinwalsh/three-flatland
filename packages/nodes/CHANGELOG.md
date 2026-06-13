# @three-flatland/nodes

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
