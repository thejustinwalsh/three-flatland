# @three-flatland/nodes

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
