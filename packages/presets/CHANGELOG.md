# @three-flatland/presets

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
