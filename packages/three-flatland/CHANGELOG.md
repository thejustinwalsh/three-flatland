# three-flatland

## 0.1.0-alpha.1

### Minor Changes

- 96371ed: ## Initial alpha release of `three-flatland`

  ### New package
  - Core library source consolidated from `@three-flatland/core` into the new `three-flatland` package (renamed for simpler install)
  - Exports sprites, animation, materials, loaders, pipeline, tilemaps, and global uniforms from the package root
  - React Three Fiber integration available via `three-flatland/react` subpath — re-exports all core APIs plus R3F helpers and `ThreeElements` type augmentation
  - Per-domain subpaths: `three-flatland/sprites`, `/animation`, `/materials`, `/loaders`, `/pipeline`, `/tilemap`, `/react/sprites`, `/react/animation`, `/react/materials`, `/react/pipeline`, `/react/loaders`, `/react/tilemap`
  - Added `source` export condition on all entries for build-free monorepo development
  - R3F helpers: `attachEffect`, `createResource`, `createCachedResource`, `spriteSheet`, `texture`
  - Exports `FlatlandProps`, `Sprite2DProps`, `EffectElement` types from `three-flatland/react`

  ### Build & tooling
  - `tsup` dual ESM/CJS build with `.d.ts` and `.d.cts` declarations
  - Production environment check in `measure.ts` uses `import.meta.env?.PROD` with correct fallback
  - `tsconfig.json` cleaned up; stale ambient type declaration removed from `types/env.d.ts`
  - `sync-react-subpaths.ts` script generates per-category React re-export index files with `ThreeElements` side-effect import

  ### Documentation
  - Added `packages/three-flatland/README.md` (quick-start, R3F guide, package table) and `packages/three-flatland/LICENSE` (MIT)
  - Repository URL set to `https://github.com/thejustinwalsh/three-flatland.git`

  ### BREAKING CHANGES
  - Package renamed from `@three-flatland/core` to `three-flatland`; update all imports: `import { ... } from 'three-flatland'` and `import { ... } from 'three-flatland/react'`
  - R3F users should import from `three-flatland/react` instead of a separate `@three-flatland/react` package

  This is the initial alpha release of `three-flatland`, delivering the complete WebGPU 2D sprite, tilemap, and effects library with full React Three Fiber integration.

## 0.1.0-alpha.0

### Minor Changes

- Alpha release: Consolidate core+react into single `three-flatland` package with `/react` subpath, extract TSL nodes to `@three-flatland/nodes` with per-category subpaths, and use preserved module structure for maximum tree-shakeability.
