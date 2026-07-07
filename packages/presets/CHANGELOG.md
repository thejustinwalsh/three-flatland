# @three-flatland/presets

## 0.1.0-alpha.7

### Minor Changes

- dea6d18: > Branch: lighting-stochastic-adoption

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/27
  - `DefaultLightEffect` is the only preset in this release; `RadianceLightEffect`, `DirectLightEffect`, and `SimpleLightEffect` removed (deferred to a follow-up PR)
  - `shadowFilter` option (`auto|nearest|linear`): auto picks nearest when `shadowPixelSnapEnabled`, linear otherwise
  - Per-sprite shadow radius (`Sprite2D.shadowRadius`): auto-derived from scale, overridable per-sprite; replaces the scene-wide shadow start offset magic constant
  - `DefaultLightEffect.shadowStartOffsetScale` (default 1.0) is a per-effect multiplier on the per-instance radius
  - `shadowBands`/`shadowBandCurve` uniforms removed; cel-banding is applied before shadow, keeping shadow edges smooth
  - Shadow now applied after cel-band quantization; rim lighting inherits the same per-pixel shadow ratio
  - Fill-light quotas: `castsShadow: false` lights capped at 2 per tile per category with luminance compensation scaling
  - `Light2D.category` (djb2 hash, up to 4 buckets): each fill category gets independent quota and compensation, preventing cross-type eviction
  - `Light2D.importance` (default 1.0): multiplicative bias for tile-slot ranking; hero lights can be set high to resist eviction by dense cosmetic clusters
  - Dead per-tile `fillScale` shader multiply removed (was causing tile-boundary banding in dense fill scenes)
  - Shadow trace gated on per-light `castsShadow` flag — trace cost is now O(casting lights) in dense fill scenes
  - Shadow trace skipped when attenuation is sub-visible (≤ 0.01) — free savings in near-miss contributions
  - Redundant `lightDir.normalize()` in spot cone math removed (direction pre-normalized at set-site)
  - `NormalMapProvider` retained as the channel provider for normal maps

  ## BREAKING CHANGES
  - `RadianceLightEffect`, `DirectLightEffect`, and `SimpleLightEffect` removed from `@three-flatland/presets`; use `DefaultLightEffect` until the follow-up PR
  - `shadowBands` and `shadowBandCurve` schema uniforms removed from `DefaultLightEffect`
  - `shadowStartOffset` uniform replaced by per-sprite `Sprite2D.shadowRadius` + `DefaultLightEffect.shadowStartOffsetScale` multiplier

  `DefaultLightEffect` now has production-quality shadow performance and fill-light management for dense 2D scenes.

### Patch Changes

- Updated dependencies [dea6d18]
- Updated dependencies [dea6d18]
- Updated dependencies [2db36c9]
  - three-flatland@0.1.0-alpha.7
  - @three-flatland/nodes@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- Updated dependencies [ed33b1a]
- Updated dependencies [1719d16]
- Updated dependencies [e0562c3]
  - three-flatland@0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- Updated dependencies [fb92ecc]
  - three-flatland@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- Updated dependencies [4d6d65a]
  - three-flatland@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- f451a83: > Branch: feat-skia

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/19
  - Version bump to align with `@three-flatland/skia` release

  Patch release with no API changes — version bump only.

- Updated dependencies [f451a83]
  - @three-flatland/nodes@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [6f89768]
  - three-flatland@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- 96371ed: ## Initial alpha release of `@three-flatland/presets`

  ### Package
  - Version bumped from placeholder `0.0.0` to `0.1.0-alpha.0`
  - Dependency changed from `@three-flatland/core` to `three-flatland` (package rename)
  - Added `source` export condition for build-free monorepo development
  - Repository URL corrected to `https://github.com/thejustinwalsh/three-flatland.git`
  - Added `packages/presets/README.md` and `packages/presets/LICENSE` (MIT)

  ### BREAKING CHANGES
  - Peer dependency on `@three-flatland/core` replaced by `three-flatland`; update any direct imports accordingly

  This is the initial alpha release of `@three-flatland/presets`, aligned with the broader `three-flatland` monorepo alpha launch.

### Patch Changes

- Updated dependencies [96371ed]
- Updated dependencies [96371ed]
  - @three-flatland/nodes@0.1.0-alpha.1
  - three-flatland@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- Alpha release: Consolidate core+react into single `three-flatland` package with `/react` subpath, extract TSL nodes to `@three-flatland/nodes` with per-category subpaths, and use preserved module structure for maximum tree-shakeability.

### Patch Changes

- Updated dependencies
  - three-flatland@0.1.0-alpha.0
  - @three-flatland/nodes@0.1.0-alpha.0
