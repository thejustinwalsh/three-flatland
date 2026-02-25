---
"@three-flatland/presets": major
---


- Alpha release of `@three-flatland/presets` package
- Depends on consolidated `three-flatland` package (core + React in one package with `/react` subpath) and `@three-flatland/nodes` (TSL shader nodes with per-category subpaths)
- Added `source` condition in exports for monorepo dev without requiring a build step
- Added LICENSE and README files
- Dual ESM/CJS build via tsup

## BREAKING CHANGES

- Package previously depended on separate `@three-flatland/core` and `@three-flatland/react` packages; those have been consolidated into `three-flatland` — update peer imports accordingly
- TSL shader nodes moved from `@three-flatland/core` to `@three-flatland/nodes`; update any node imports to use the new package and its per-category subpaths

First alpha release of `@three-flatland/presets`, reflecting the monorepo restructuring that merged the old `core` and `react` packages into a single `three-flatland` package and extracted TSL nodes into `@three-flatland/nodes`.
