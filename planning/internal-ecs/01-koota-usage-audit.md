# Flatland Koota usage audit

Status: implementation inventory

Date: 2026-08-22

## Executive finding

`three-flatland` uses Koota as an internal rendering data store, not as a general application ECS. The public API already hides it behind Three.js objects and the opaque batch-query facade, but the package still declares Koota as a required peer and the installation guide tells every user to install it.

The replacement surface is bounded enough to own:

- 25 static declarations in `src/ecs/traits.ts`: 24 traits and one exclusive relation.
- Dynamic numeric traits created by `MaterialEffect`, `LightEffect`, and `PassEffect` subclasses.
- Seven runtime imports.
- Nine world/entity operations.
- Three independent event subscriptions.

## Runtime imports

Production code imports:

| Koota symbol    | Flatland purpose                                                   |
| --------------- | ------------------------------------------------------------------ |
| `createWorld`   | One world per `SpriteGroup`, plus a lazy fallback world            |
| `trait`         | Numeric SoA schemas, object-backed values, and tags                |
| `relation`      | One exclusive sprite-to-batch relation, `InBatch`                  |
| `createAdded`   | Newly renderable sprites                                           |
| `createChanged` | Batch routing changes                                              |
| `createRemoved` | Sprites leaving renderable state                                   |
| `getStore`      | Direct numeric field arrays in sprite and transform/sort hot paths |

Type-only usage is `World`, `Entity`, and `Trait`.

No production code in the core package uses Koota's React bindings, actions, ordered relations, `Not`, `Or`, subscriptions, serialization, query callbacks, resources, or scheduling.

## Operations used

### World

- `world.spawn(...traits)`
- `world.query(...traitsOrTracker)`
- `world.destroy()`

### Entity

- `entity.get(trait)`
- `entity.set(trait, patch, notify?)`
- `entity.add(traitOrRelationPair)`
- `entity.remove(traitOrRelationPair)`
- `entity.has(trait)`
- `entity.targetFor(relation)`
- `entity.destroy()`

The implementation also casts entities to numbers and masks the packed ID directly. This means the code already treats the fluent entity object surface as secondary to an integer data index.

## Trait shapes

### Numeric SoA

These map directly to per-field arrays:

- `SpriteUV`
- `SpriteColor`
- `SpriteFlip`
- `SortLayer`
- `SpriteZIndex`
- `SpriteMaterialRef`
- `CameraLayersMask`
- `BatchSlot`
- `BatchMeta`
- dynamically flattened effect schemas

The hot path caches stable references to these arrays. For example, sprite enrollment swaps the sprite's local UV, color, flip, layer, and z-index arrays for world-store arrays. This is why a growable ordinary `number[]` is a serious candidate even if a fixed typed array wins a narrow loop benchmark.

### Tags

- `IsRenderable`
- `IsBatched`
- `IsStandalone`
- four batch classification tags

### Object-backed values

- `BatchMesh`
- `BatchGeometryStrategy`
- `BatchRegistry`
- `PostPassTrait`
- `PostPassRegistry`
- `LightEffectTrait`
- `ShadowPipeline`
- `LightingContext`

These are sparse object references or singleton-like records. They do not benefit from field-level SoA storage.

### Relation

`InBatch` is exclusive and has no relation payload. `BatchSlot` separately stores `batchIdx` and `slot` because relation traversal was already too expensive for hot systems and relation payload would become stale after sort swaps.

This is duplicated state:

- `InBatch` answers “which batch entity?”
- `BatchSlot.batchIdx` answers “which batch mesh?”
- `BatchSlot.slot` answers “which GPU row?”
- `IsBatched` answers “does the sprite currently have an assignment?”

The replacement can fold the batch entity into `BatchSlot`, eliminating the relation implementation without losing information.

## Query inventory

### Event queries

| Consumer           | Selector                                                                                 | Frequency         |
| ------------------ | ---------------------------------------------------------------------------------------- | ----------------- |
| batch assignment   | added `IsRenderable`                                                                     | each schedule run |
| batch removal      | removed `IsRenderable`                                                                   | each schedule run |
| batch reassignment | changed `SortLayer`, `SpriteMaterialRef`, or `CameraLayersMask`, filtered by `IsBatched` | each schedule run |

The three changed streams are deduplicated in a reused `Set<Entity>` after Koota returns them.

### Persistent ordinary queries

Common shapes include:

- `BatchRegistry`
- `IsRenderable + IsBatched + BatchSlot`
- `IsBatched + BatchSlot`
- `PostPassTrait`
- `LightingContext`
- `ShadowPipeline`
- caller-provided batch classification tag + `BatchMesh`

Most singleton queries return zero or one entity. Most sprite queries are stable across frames and only need membership updates after a structural change.

## Existing Koota bypasses

Flatland already bypasses generalized ECS paths where they cost too much:

1. `getStore()` exposes numeric field arrays directly.
2. Packed entity IDs are masked with a copied `ENTITY_ID_MASK` constant.
3. `BatchRegistry.spriteArr[eid]` resolves a sprite without entity lookup.
4. `BatchRegistry.batchSlots[batchIdx]` resolves a batch mesh without relation lookup.
5. `BatchSlot` duplicates the assignment relation for the hot path.
6. `entity.set(..., false)` explicitly avoids change tracking for slot and batch metadata writes.
7. Sprite setters write through cached store arrays and directly to GPU batch buffers.
8. CPU sort dirtiness moved from Koota's `Changed(SpriteZIndex)` stream to one boolean per batch after the tracker cost about 7 ms/frame at 12,000 sprites in the gated alpha-test workload.

These are not isolated hacks to reproduce. Together they describe the API the renderer actually wants.

## Global behavior inherited from Koota

The installed Koota runtime:

- packs world ID, generation, and entity index into a number,
- registers worlds in a global universe,
- patches `Number.prototype` with entity methods,
- maintains generalized bit-mask generations for traits,
- tracks cached and dirty queries,
- supports general and ordered relations with reverse lookup and destruction cascades,
- creates snapshot/dirty/changed masks for tracking cursors,
- copies a query's dense entity array when a query runs.

Those are reasonable costs for Koota's public feature set. They are not required by a world-local renderer implementation.

## Measured size baseline

Measurement environment: repository install on 2026-08-22, Koota 0.6.5, esbuild 0.25.12, browser ESM, minification and tree shaking enabled.

| Artifact                                      |      Raw/minified |     Gzip |       Brotli |
| --------------------------------------------- | ----------------: | -------: | -----------: |
| Installed Koota core ESM chunk                |      98,396 B raw | 17,310 B | not recorded |
| Flatland's seven runtime imports in isolation | 34,846 B minified | 10,522 B |      9,368 B |

The installed package occupies 496 kB on disk. Disk size is not the product goal; the tree-shaken browser result is the meaningful replacement baseline.

## Dependency boundary

`packages/three-flatland/package.json` currently lists Koota as a peer dependency, and `tsdown.config.ts` marks it as never bundled. The installation guide includes Koota in npm, pnpm, yarn, and Bun commands.

Other workspace code may continue to use Koota:

- the Breakout mini uses Koota and `koota/react` as an application ECS,
- other branches/minis may do the same.

That use is intentionally out of scope. The proposal removes Koota from the public `three-flatland` package, not from the workspace catalog and not from applications that use Koota's application-facing features.

## Test impact

Many core tests call Koota's global `universe.reset()` for isolation. Migration requires world-owned cleanup and an internal test reset helper where necessary. Tests must stop depending on Koota global state; they should prove independent worlds do not share IDs, trackers, query results, or object-backed defaults.

## Audit conclusion

The core dependency is replaceable without changing user-facing rendering APIs. The highest-risk areas are not trait storage; they are exact event semantics, safe entity reuse, query mutation behavior, and lifecycle ordering during batch removal. Those receive dedicated reference-model and differential tests in the validation plan.
