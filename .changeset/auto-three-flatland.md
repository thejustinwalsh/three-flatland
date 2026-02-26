---
"three-flatland": patch
---

- Updated koota peer dependency from `^0.1.0` to `^0.6.5`
- Replaced internal `$internal` koota API with public `getStore`/`universe` in snapshot reads
- Workaround for koota 0.6 bug: multi-trait `Added` queries no longer detect new entities after a remove+re-add cycle on the same archetype; `batchAssignSystem` now queries `Added(IsRenderable)` alone and guards with `entity.has(ThreeRef)`
- `IsBatched` and `BatchSlot` pre-allocated at sprite spawn time in `Sprite2D`, eliminating archetype transitions during batch assignment
- Removed per-entity/per-attribute `needsUpdate = true` calls from assign, reassign, and buffer-sync systems; GPU uploads are now consolidated into a single `flushDirtyRanges()` call per mesh at end of frame by `SpriteGroup`
- `syncCount()` now called once per mesh instead of once per entity in `batchAssignSystem`
- Entity destruction deferred to top of next frame via new `deferredDestroySystem`; removes cascading trait-removal cost from the hot render path
- `batchRemoveSystem` signature changed to accept a `pendingDestroy: Entity[]` array; callers must pass `SpriteGroup._pendingDestroy`
- `deferredDestroySystem` exported from `batchRemoveSystem.ts` and wired into `SpriteGroup.update()` and `SpriteGroup.dispose()`
- Added `traces/` to `.gitignore`

Updated koota to v0.6.5 with targeted fixes for a multi-trait `Added` query regression, and restructured GPU dirty-tracking to consolidate all attribute uploads into a single end-of-frame `flushDirtyRanges()` pass for improved render performance.
