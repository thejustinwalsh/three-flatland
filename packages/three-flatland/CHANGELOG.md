# three-flatland

## 0.1.0-alpha.4

### Minor Changes

- 4d6d65a: > Branch: feat-examples-tweakplane

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/22

  ### API changes
  - `Flatland.renderTarget` type changed from `WebGLRenderTarget` to `RenderTarget` — use `import { RenderTarget } from 'three'` instead of `WebGLRenderTarget` when passing a render target to `Flatland`

  ### Examples
  - All plain Three.js examples moved from `examples/vanilla/` to `examples/three/`; React examples remain under `examples/react/`
  - All examples now include Tweakpane debug controls via `createPane({ scene })` for live stats and scene-specific parameter controls

  ### Documentation
  - New "Debug Controls" guide covering Tweakpane integration for both vanilla Three.js and R3F
  - Updated guides for Flatland, sprites, pass-effects, and loaders to reflect `RenderTarget` API and example restructuring
  - Updated LLM prompt context files

  ### BREAKING CHANGES
  - `FlatlandOptions.renderTarget` accepts `RenderTarget` instead of `WebGLRenderTarget`. Update any call sites that pass a `WebGLRenderTarget` to use `RenderTarget` from `three`.

  `Flatland.renderTarget` now uses the renderer-agnostic `RenderTarget` type throughout, and plain Three.js examples have been reorganised into `examples/three/` to align with the established `three/` vs `react/` naming convention.

## 0.1.0-alpha.2

### Minor Changes

- 6f89768: > Branch: jw/ecs-update-and-perf

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/6

  ## Performance: ECS entity access overhaul
  - Updated koota dependency to v0.6.5
  - `measure()` utility now accepts a string as the first argument (in addition to a function), enabling named measurements without a function reference
  - Removed `ThreeRef` ECS trait; sprite-to-entity mapping is now handled internally via a flat array indexed by entity SoA ID
  - Replaced `readField`, `readTrait`, and `writeTrait` snapshot utilities with `resolveStore`, which returns stable SoA store arrays for a trait in a world
  - `Sprite2D` internal state refactored from a `_snapshot` object to per-field backing arrays using an array-ref swap pattern; standalone sprites use local arrays at index 0, enrolled sprites swap refs to world SoA arrays at entity index — zero branching in property setters
  - `RegistryData.spriteRefs` (Map) replaced by `RegistryData.spriteArr` (flat array indexed by entity SoA ID) for uniform O(1) array-index access across all ECS hot paths
  - Batch assign system defers `needsUpdate` and `syncCount` calls to a single flush after all entities are processed, reducing per-entity overhead

  ## BREAKING CHANGES
  - `ThreeRef` is no longer exported from the ECS module
  - `readField`, `readTrait`, and `writeTrait` are no longer exported; use `resolveStore` to access SoA store arrays directly
  - `RegistryData.spriteRefs` (Map) replaced by `RegistryData.spriteArr` (array); any code indexing the registry by entity must switch to array access with `entity & ENTITY_ID_MASK`
  - `Sprite2D._snapshot` removed; pre-enrollment state is now stored in per-field `_colorR`, `_colorG`, `_colorB`, `_colorA`, `_uvX`/`Y`/`W`/`H`, `_flipXArr`/`_flipYArr`, `_layerArr`, `_zIndexArr` arrays (all `@internal`)

  Performance-focused release replacing snapshot-based entity state with a zero-allocation array-ref swap pattern and upgrading the koota ECS library to v0.6.5.

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
