---
"three-flatland": major
---

## BREAKING CHANGES

- Package renamed from `@three-flatland/core` to `three-flatland` — update all imports
- `@three-flatland/react` package removed; R3F integration is now the `three-flatland/react` subpath — update imports from `@three-flatland/react` to `three-flatland/react`
- `three-flatland/react` re-exports all of core, so R3F users only need one import

## Package restructure

- New package `three-flatland` (v0.1.0-alpha.0) replaces the internal `@three-flatland/core` package
- R3F integration merged into `three-flatland/react` subpath (was a separate `@three-flatland/react` package)
- Added dedicated subpath exports for the React integration: `three-flatland/react/animation`, `three-flatland/react/loaders`, `three-flatland/react/materials`, `three-flatland/react/pipeline`, `three-flatland/react/sprites`, `three-flatland/react/tilemap`
- Added `source` export condition to all subpaths for build-free monorepo development
- Added wildcard subpath exports (`./react/*`) for deep imports

## React Three Fiber

- `ThreeElements` augmentation for `sprite2D`, `sprite2DMaterial`, `animatedSprite2D`, `spriteGroup`, `flatland`, `tileMap2D`, `tileLayer` JSX elements
- New `EffectElement<T>` helper type surfaces schema-derived effect props in JSX autocomplete
- `attachEffect`, `createResource`, `createCachedResource`, `spriteSheet`, `texture` exported from `three-flatland/react`

## Fixes

- Fixed `process.env` access in `measure` utility to guard against undefined `process` (browser environments)
- Removed unused `types/env.d.ts` ambient declaration
- Cleaned up `tsconfig.json` includes

## Documentation

- Added LICENSE and README to `three-flatland` package with updated feature list and installation instructions (alpha tags)
- Docs installation page updated to reflect alpha release status

This is the initial alpha release of `three-flatland`, consolidating the core and React packages into a single unified package with deep subpath exports for tree-shaking.
