# @three-flatland/presets

## 0.1.0-alpha.10

### Minor Changes

- 2224926: **BREAKING CHANGES**
  - Raise the supported Three.js runtime to `^0.185.1` and align development types on `@types/three ^0.185.4`.
  - Raise the React Three Fiber integration to the exact `10.0.0-alpha.3` release. React integrations now require React `~19.2.0`, matching R3F alpha.3's `<19.3` peer window.

  Migrate Flatland's TSL, clipping, disposal, and instanced-buffer compatibility paths to Three.js r185. The r185 instancing event regression is handled before geometry upload, matching the upstream fix, so newly visible batched instances do not flash for one frame. Standalone `@three-flatland/slug` installs the same guarded timing fix for its instanced glyph meshes.

  The temporary r185 timing shim targets Three's bundled WebGPU `EventNode` and recognizes the internal buffer-sync callback by its buffer API fingerprint. A custom frame callback that duplicates that exact internal pattern will also run before frame while the shim is active.

  Normalize 2xSai vector branches for r185's stricter TSL inference, preserve `SlugText.dispose()` fluent chaining after Three changed `InstancedMesh.dispose()` to return `void`, and ship Skia declarations with resolvable WebGPU and Node ambient types.

  Examples, benchmarks, minis, starter templates, package guidance, and installation docs now use the same dependency stack. `create-three-flatland` is included so the updated starter templates publish with this release.

### Patch Changes

- f3c3de8: Make the render surface the default source of truth for `Flatland` camera and
  lighting dimensions. `render()` now derives its size from the active render
  target or renderer, skips unchanged dimensions, and safely waits through an
  initial `0×0` canvas measurement. React Three Fiber and vanilla Three.js users no
  longer need a manual resize bridge for the usual responsive-canvas case.
  Surface-dependent lighting and shadow buffers use physical drawing-buffer pixels,
  so HiDPI canvases and equivalent render targets share the same sizing contract.
  Each `LightEffect` also exposes `resolutionScale` for an explicit per-effect
  quality/performance tradeoff without changing camera framing, canvas DPR, or
  logical viewport uniforms.

  `aspect` is now a settable property for fixed camera framing, including R3F JSX
  property assignment. A fixed aspect still lets surface-dependent lighting buffers
  follow the real target size. Assigning `aspect = 'auto'` restores automatic sizing,
  including after `resize(width, height)`, which remains the escape hatch for full
  manual control of both camera and effect dimensions.

  Once a valid surface size exists, light effects receive a deterministic
  `init → resize → update` lifecycle.
  Effects attached after the first frame, re-enabled after a resize, or mounted
  before the canvas is measurable receive the latest valid dimensions before their
  next update. Replacing an active effect disposes its owned GPU resources before
  detachment, making later reattachment safe.

  Render targets without authored color-space metadata now default to sRGB, while
  explicit linear/HDR targets remain untouched. Flatland applies the final output
  color transform only when presenting to the screen, avoiding an sRGB encode in
  intermediate render targets.

  ## BREAKING CHANGES

  `Flatland` no longer keeps a square `aspect = 1` frustum by default. It follows
  the render surface unless configured otherwise. If a square frustum was
  intentional, pass `aspect: 1` (or set `flatland.aspect = 1`). Otherwise, remove
  manual per-frame and `useThree(state => state.size)` resize bridges and let
  `render()` synchronize the surface. Use `'auto'` rather than removing a conditional
  R3F `aspect` prop: `aspect={locked ? 1 : 'auto'}`.

  The React starter template, packaged R3F skill, and Breakout mini now use the
  automatic sizing path so generated and maintained examples teach the new
  canonical integration. Paired React and Three examples, plus both starter
  templates, also select sRGB output with no tone mapping explicitly. This avoids
  R3F alpha 3's ACES default producing a different palette from plain Three.js.

- Updated dependencies [f3c3de8]
- Updated dependencies [2224926]
- Updated dependencies [9d733a7]
  - three-flatland@0.1.0-alpha.10
  - @three-flatland/nodes@0.1.0-alpha.10

## 0.1.0-alpha.9

### Patch Changes

- Updated dependencies [2df7c13]
- Updated dependencies [c2e81f1]
- Updated dependencies [6dac6fd]
  - three-flatland@0.1.0-alpha.9

## 0.1.0-alpha.8

### Patch Changes

- Updated dependencies [75fcf94]
- Updated dependencies [abad04f]
- Updated dependencies [d3ee466]
- Updated dependencies [12bacea]
- Updated dependencies [26739f3]
- Updated dependencies [2f94520]
- Updated dependencies [e4c3c68]
- Updated dependencies [9b04cfa]
- Updated dependencies [ea7ec3d]
- Updated dependencies [6caf0f8]
- Updated dependencies [0033ea6]
- Updated dependencies [a8b7e5d]
- Updated dependencies [30550a2]
- Updated dependencies [75fcf94]
- Updated dependencies [ea7ec3d]
- Updated dependencies [0033ea6]
- Updated dependencies [261b5be]
  - three-flatland@0.1.0-alpha.8
  - @three-flatland/nodes@0.1.0-alpha.8

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
