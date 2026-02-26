---
"three-flatland": minor
---

## Performance: ECS entity access overhaul

- Updated koota to v0.6.5; updated `snapshot.ts` to use `getStore` public API instead of `$internal`
- Replaced `ThreeRef` ECS trait with a flat `spriteArr` on `RegistryData` — entity-to-`Sprite2D` lookup is now a plain array index (`eid & ENTITY_ID_MASK`) with no hash overhead
- Removed `ThreeRef` from all ECS queries; queries are simpler and no longer affected by a koota 0.6 bug with multi-trait `Added` queries after remove+re-add cycles
- Replaced `SpriteSnapshot` object and `readField`/`readTrait`/`writeTrait` helpers with `resolveStore(world, trait)` — returns stable SoA array references, eliminating per-call allocation for pre-enrollment property reads/writes
- `Sprite2D` now holds direct references to SoA backing arrays; getters/setters read from and write to those arrays at an entity index rather than through a snapshot object
- Batch `needsUpdate` / `syncCount` calls are now deferred and issued once per mesh per frame instead of once per entity
- `measure()` now accepts a string label in addition to a function reference

## BREAKING CHANGES

- `ThreeRef` is no longer exported from `three-flatland/ecs`
- `readField`, `readTrait`, and `writeTrait` are no longer exported from `three-flatland/ecs`; use `resolveStore(world, trait)` to obtain raw SoA array references
- `Sprite2D._snapshot` has been removed; pre-enrollment state is stored in per-field local arrays (`_colorR`, `_colorG`, etc.)
- `RegistryData.spriteRefs` (Map) has been replaced by `RegistryData.spriteArr` (flat array)

This release replaces the internal entity-to-object lookup mechanism with a flat SoA array pattern for consistent O(1) access, removes the `ThreeRef` trait entirely, and drops the snapshot helper utilities in favour of direct store references.
