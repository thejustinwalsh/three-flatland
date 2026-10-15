---
"three-flatland": minor
---

> Branch: jw/ecs-update-and-perf
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
