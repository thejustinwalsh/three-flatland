---
"three-flatland": minor
---

## Performance improvements and koota v0.6.5 upgrade

### ECS entity access — zero-allocation hot paths

- Replaced `ThreeRef` ECS trait with a flat `spriteArr` array indexed by entity SoA index for O(1) sprite lookups with no hash overhead
- Removed `Map<Entity, Sprite2D>` (`spriteRefs`) in favor of direct array indexing, matching the SoA pattern used by all other koota stores
- Exported `ENTITY_ID_MASK` constant from `snapshot.ts` for use across ECS systems
- Replaced `readField` / `readTrait` / `writeTrait` snapshot utilities with `resolveStore`, which returns stable SoA backing arrays for the lifetime of the world — callers cache the arrays rather than calling per-entity helpers each frame
- Sprite2D pre-enrolls with `IsBatched` and `BatchSlot` at spawn time, eliminating archetype transitions on first batch assignment

### Batch system optimizations

- `batchAssignSystem`: deferred `needsUpdate` flags — a single `syncCount()` call per dirty mesh replaces per-entity attribute updates; GPU dirty ranges consolidated to one upload per attribute per frame via `flushDirtyRanges()`
- `SpriteGroup._runSystems` now calls `flushDirtyRanges()` once at end of frame across all active batches
- `measure()` utility now accepts a string label in addition to a `Function`, enabling stable names from `fn.name` without capturing function references

### koota upgrade

- Updated koota from `^0.1.0` to `^0.6.5` across workspace catalog, `packages/three-flatland`, and `minis/breakout`
- Adapted internal API calls from `$internal.stores` to `getStore(world, trait)` to match the new public koota API

### BREAKING CHANGES

- `ThreeRef` ECS trait removed from public exports — consumers who referenced `ThreeRef` from `three-flatland` must migrate to the `spriteArr` registry pattern or direct `Sprite2D` references
- `readField`, `readTrait`, `writeTrait` removed from `three-flatland/ecs` exports; replaced by `resolveStore`

Upgrades koota to v0.6.5 and restructures ECS entity access throughout the batch pipeline for lower per-frame allocation overhead and consolidated GPU buffer updates.
