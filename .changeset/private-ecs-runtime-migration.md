---
'three-flatland': minor
---

Seal the remaining renderer implementation boundary, make effect-vector reads immutable, and harden scene, effect, lighting, sprite, and tile ownership across reassignment, cloning, and disposal.

The private renderer ECS grew from [Koota](https://github.com/pmndrs/koota). Its typed traits,
structure-of-arrays storage, queries, and systems made this specialized design possible, and Koota
remains the recommended general-purpose ECS for application and gameplay state.

**BREAKING CHANGES**

- Remove the opaque compatibility world and entity handles, effect trait/entity seams, the world-bound batch-query constructor, the private batch-query builder, and direct React Three Fiber `<tileLayer>` construction. Applications must keep gameplay identity in application-owned state and update rendering through public objects.

  These seams have no public replacement, because entity IDs, traits, schedules, and physical batch rows are implementation details. Search for and remove: `Flatland.world`, `SpriteGroup.world`, `Sprite2D.entity`, effect-class `._trait`, effect-instance `._entity`, `buildBatchQueryView(...)`, `new BatchQueryView(world, ...)`, `SpriteBatch.allocateSlot/freeSlot/swapSlots/resetSlots`, and `<tileLayer>` JSX. Move rendering changes to the owning object (`sprite.position`, `sprite.tint`, `sprite.sortLayer`, `sprite.addEffect`, `group.add`, `group.remove`), read counts from `group.stats`, and read generated batches through `group.batches`. `TileLayer` is constructed by `TileMap2D`; configure the containing tilemap instead. Do not retain a `SpriteBatch` and modify its slots.

- Effect vector getters now return read-only snapshots. Assign the complete tuple to publish an update; mutating a returned snapshot such as `offset.amount[0] = 4` does not reach the attached effect. The `effect-vector-whole-tuple` codemod rewrites these sites.

- Invalid configuration throws before partial runtime state is published. Update values at their source rather than catching and continuing with a partially configured object.

- Material, light, and pass effects have one owner at a time. A `MaterialEffect` instance belongs to one sprite or tilemap, and each owner accepts one instance of a given class. Detach before reattaching: `removeEffect` then `addEffect`, or `setLighting(null)` / `removePass(effect)` on the current owner. Create separate instances when two scenes need the effect at once.

- `TileMap2D.dispose()` and `TileLayer.dispose()` are terminal. Do not mutate, update, or reattach a disposed object; construct a new `TileMap2D` instead. Changing `data` or `chunkSize` rebuilds the tile projection and can replace `TileLayer` and `Sprite2DMaterial` instances, and adding or removing an effect preserves the layer but replaces its material. Reacquire layers with `getLayer(...)` and materials with `getLayerMaterial(...)` after either change. Standard three.js material state is copied to replacements, but material identity is not preserved.
