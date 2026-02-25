---
"@three-flatland/presets": major
---

## BREAKING CHANGES

- Package version bumped to `0.1.0-alpha.0`; this is the initial public alpha release
- Peer dependency on `@three-flatland/core` replaced with `three-flatland` — update your dependencies

## Package changes

- `dependencies`: `@three-flatland/core` replaced with `three-flatland` to match the renamed core package
- Added `source` export condition to subpaths for build-free monorepo development
- Updated repository URL in `package.json`

## Documentation

- Added LICENSE (MIT) and README to the package

Initial alpha release of `@three-flatland/presets`; the package now depends on the renamed `three-flatland` core package.
