---
"@three-flatland/nodes": major
---

## BREAKING CHANGES

- Package version bumped to `0.1.0-alpha.0`; this is the initial public alpha release

## Package exports

- Added per-category subpath exports: `@three-flatland/nodes/alpha`, `/analog`, `/blur`, `/color`, `/display`, `/distortion`, `/retro`, `/sprite`, `/upscale`, `/vfx`
- Added wildcard subpaths (e.g. `@three-flatland/nodes/color/*`) for importing individual node files directly
- Added `source` export condition to all subpaths for build-free monorepo development
- Build now compiles all source files individually (not a single bundle), enabling deeper tree-shaking

## Documentation

- Added LICENSE (MIT) and README to the package
- Updated repository URL in `package.json`

Initial alpha release of `@three-flatland/nodes` with per-category subpath exports for maximum tree-shaking; all TSL shader node categories (alpha, analog, blur, color, display, distortion, retro, sprite, upscale, vfx) are now importable via dedicated subpaths.
