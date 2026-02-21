# ECS Render Graph - Architecture

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│  API Layer                                          │
│  Sprite2D  ·  Renderer2D  ·  Sprite2DMaterial       │
│  (user-facing, unchanged public surface)            │
└────────────────────┬────────────────────────────────┘
                     │ trait reads/writes
┌────────────────────▼────────────────────────────────┐
│  ECS Layer                                          │
│  World  ·  Traits  ·  Systems  ·  Queries           │
│  (koota internals, Changed() dirty tracking)        │
└────────────────────┬────────────────────────────────┘
                     │ buffer sync systems
┌────────────────────▼────────────────────────────────┐
│  GPU Layer                                          │
│  SpriteBatch (InstancedMesh)  ·  InstancedBuffer    │
│  Attributes  ·  Sprite2DMaterial (TSL colorNode)    │
└─────────────────────────────────────────────────────┘
```

## World Hierarchy

```
Global World (lazy singleton)
  └── used by standalone Sprite2D instances not in any Renderer2D

Flatland World (future)
  └── created by <Flatland> scene wrapper
      └── Renderer2D World
          └── created by Renderer2D if no parent Flatland
              └── Sprite entities live here
```

### World Assignment Rules

1. `Renderer2D` checks for an inherited `_flatlandWorld`. If found, uses it. Otherwise creates its own world.
2. When `renderer2D.add(sprite)` is called, the sprite's entity is spawned in the renderer's world (if not already spawned).
3. Standalone `new Sprite2D()` instances that are never added to a Renderer2D lazily spawn into `getGlobalWorld()`.
4. Moving a sprite between renderers with different worlds is a dev-time error.

### World Management API

```typescript
// Lazy global world (module-level singleton)
function getGlobalWorld(): World

// Assign a world to a Sprite2D (called internally)
function assignWorld(sprite: Sprite2D, world: World): Entity

// Context provider mixin (used by Renderer2D, future Flatland)
interface WorldProvider {
  _flatlandWorld: World
  // overrides add()/remove() to propagate _flatlandWorld to children
}
```

## Core Traits

All traits are defined in `packages/core/src/ecs/traits.ts`.

### GPU Instance Data (SoA)

| Trait | Fields | Maps to GPU Attribute |
|-------|--------|-----------------------|
| `SpriteUV` | `{ x, y, w, h }` | `instanceUV` (vec4) |
| `SpriteColor` | `{ r, g, b, a }` | `instanceColor` (vec4) |
| `SpriteFlip` | `{ x, y }` | `instanceFlip` (vec2) |

### Sort / Batch Metadata (SoA)

| Trait | Fields | Purpose |
|-------|--------|---------|
| `SpriteLayer` | `{ layer, zIndex }` | Primary + secondary sort keys |
| `SpriteMaterialRef` | `{ materialId }` | Groups sprites into batches by material |

### Tags

| Trait | Purpose |
|-------|---------|
| `IsRenderable` | Entity has all required components for rendering |
| `IsBatched` | Entity is currently assigned to a SpriteBatch |
| `IsStandalone` | Entity renders standalone (not in a batch) |

### References (AoS)

| Trait | Fields | Purpose |
|-------|--------|---------|
| `ThreeRef` | `{ object: Object3D \| null }` | Back-reference to the Sprite2D mesh |

### Batch Entity Traits

| Trait | Fields | Purpose |
|-------|--------|---------|
| `BatchMesh` | `{ mesh: SpriteBatch \| null }` | AoS reference to SpriteBatch (GPU buffers + slot management) |
| `BatchMeta` | `{ materialId, layer, renderOrder }` | SoA sort/grouping metadata for queries |

### Relations

| Relation | Config | Purpose |
|----------|--------|---------|
| `InBatch` | `exclusive: true, store: { slot: 0 }` | Links sprite entity to its batch entity; stores GPU buffer slot index |

### World-Level Singleton

| Trait | Purpose |
|-------|---------|
| `BatchRegistry` | Holds runs map, sorted run keys, batch pool, active batches, render order dirty flag |

## Batch Runs & Incremental Sort

A "run" groups batches by `(layer, materialId)` — the two sort dimensions that determine batch boundaries. Run keys are computed as `(layer << 16) | materialId` and stored in a sorted array for O(log R) binary search on insert.

**Add (O(log R) where R = number of unique (layer, material) combos):**
1. Compute run key from SpriteLayer + SpriteMaterialRef
2. Binary search `sortedRunKeys` for the run
3. If run doesn't exist: create it, insert key in sorted position
4. Find a batch in the run with free slots (or create one)
5. Allocate slot via `SpriteBatch.allocateSlot()`, set `InBatch(batchEntity, { slot })` relation

**Remove (O(1) amortized):**
1. Read InBatch relation → batch entity + slot
2. Free slot via `SpriteBatch.freeSlot()` (sets alpha=0, pushes to free list)
3. Remove InBatch relation
4. If batch empty: recycle to pool, remove from run

**Sort key change (O(1) same-run, O(log R) cross-run):**
1. Compute new run key
2. If same run: no batch movement needed (zIndex changes don't affect batch boundaries)
3. If different run: remove from old batch, insert into correct batch

## Per-Frame Data Flow

```
1. User mutates sprite
   sprite.tint = red
     -> Sprite2D.set tint(v)
       -> entity.set(SpriteColor, { r, g, b, a })
       -> Koota marks SpriteColor as Changed for this entity

2. Renderer2D.updateMatrixWorld() runs systems automatically:

   a) batchAssignSystem(world)
      - query(Added(IsRenderable))
      - compute run key, find/create batch, allocate slot
      - set InBatch relation with slot, add IsBatched tag
      - one-time full buffer sync for initial data

   b) batchReassignSystem(world)
      - query(Changed(SpriteLayer) OR Changed(SpriteMaterialRef), IsBatched)
      - if run key changed: remove from old batch, insert into correct batch

   c) batchRemoveSystem(world)
      - query(Removed(IsRenderable))
      - free slot, remove InBatch relation, recycle empty batches

   d) bufferSyncColorSystem(world)
      - query(Changed(SpriteColor), IsBatched)
      - resolve InBatch → batch entity → BatchMesh.mesh
      - mesh.writeColor(slot, r, g, b, a)
      - mark colorAttribute.needsUpdate

   e) bufferSyncUVSystem(world)
      - query(Changed(SpriteUV), IsBatched) -> copy UV to batch buffer

   f) bufferSyncFlipSystem(world)
      - query(Changed(SpriteFlip), IsBatched) -> copy flip to batch buffer

   g) bufferSyncEffectSystem(world)
      - query(Changed(effectTrait), IsBatched) -> pack effect data into batch buffers

   h) transformSyncSystem(world)
      - query(IsRenderable, IsBatched, ThreeRef)
      - for each: object.updateMatrix(), mesh.writeMatrix(slot, matrix)
      - mark instanceMatrix.needsUpdate

   i) sceneGraphSyncSystem(world)
      - rebuild Renderer2D children from sorted batch entities
      - set renderOrder on each batch mesh

3. Three.js renders scene
   - SpriteBatch children of Renderer2D are rendered in renderOrder
```

## Systems

All systems are in `packages/core/src/ecs/systems/`.

### batchAssignSystem

Handles newly renderable sprites. Computes run key, finds or creates a batch with free slots, allocates a slot, and performs initial buffer sync.

```
Triggers: Added(IsRenderable)
Actions:
  1. Compute run key from SpriteLayer + SpriteMaterialRef
  2. Find or create batch via run lookup + binary search
  3. Allocate slot via SpriteBatch.allocateSlot()
  4. Set InBatch(batchEntity, { slot }) relation, add IsBatched tag
  5. Sync all current trait data to batch buffers (one-time initial sync)
```

### batchReassignSystem

Handles sort key changes (layer or material changed on batched sprites). Only moves between batches when the run key changes.

```
Triggers: Changed(SpriteLayer) OR Changed(SpriteMaterialRef) on IsBatched entities
Actions:
  1. Compute new run key from current trait values
  2. Compare with current batch's run key
  3. If different: free old slot, find/create batch in new run, allocate new slot
  4. Full buffer re-sync to new batch
```

### batchRemoveSystem

Handles sprites removed from rendering. Frees the slot, removes the relation, and recycles empty batches.

```
Triggers: Removed(IsRenderable)
Actions:
  1. Read InBatch relation → batch entity + slot
  2. Free slot (alpha=0, push to free list)
  3. Remove InBatch relation and IsBatched tag
  4. If batch empty: recycle to pool, remove from run, mark renderOrder dirty
```

### bufferSyncColorSystem / bufferSyncUVSystem / bufferSyncFlipSystem

Each handles a single attribute type. Reads changed trait data and writes to the batch buffer via SpriteBatch write methods.

```
Triggers: Changed(SpriteColor/SpriteUV/SpriteFlip) AND IsBatched
Actions:
  1. Resolve InBatch → batch entity → BatchMesh.mesh → slot
  2. Call mesh.writeColor/writeUV/writeFlip(slot, ...)
  3. Collect dirty meshes, mark attribute.needsUpdate
```

### bufferSyncEffectSystem

Handles effect trait changes. Packs effect data into the batch's packed vec4 effect buffers.

```
Triggers: Changed(effectTrait) AND IsBatched
Actions:
  1. For each registered effect trait with changes:
     a. Resolve batch + slot via InBatch
     b. Pack trait fields into the effect's assigned buffer/component slots
     c. Call mesh.writeEffectSlot(slot, bufferIndex, component, value)
  2. Mark dirty effect buffer attributes
```

### transformSyncSystem

Syncs Three.js transforms to GPU instance matrices.

```
Triggers: runs every frame when autoInvalidateTransforms is true
Actions:
  1. Query(IsRenderable, IsBatched, ThreeRef)
  2. For each: object.updateMatrix(), mesh.writeMatrix(slot, matrix)
  3. Mark instanceMatrix.needsUpdate for dirty meshes
```

### sceneGraphSyncSystem

Rebuilds Renderer2D's Three.js children from sorted batch entities.

```
Triggers: renderOrderDirty flag on BatchRegistry
Actions:
  1. Rebuild sorted batch order from runs
  2. Remove stale children not in active batches
  3. Add new batch meshes, set renderOrder
```

## Sprite2D Integration

Sprite2D operates in two modes:

**Standalone mode** (not in a Renderer2D): Writes directly to own geometry buffers.

**Enrolled mode** (in a Renderer2D): Writes to ECS traits only. Systems handle buffer sync.

```typescript
set tint(value) {
  this._tint.copy(value)
  if (this._entity) {
    // Enrolled: write to trait, systems sync to batch
    this._entity.set(SpriteColor, {
      r: this._tint.r,
      g: this._tint.g,
      b: this._tint.b,
      a: this._alpha,
    })
  } else {
    // Standalone: write directly to own buffer
    this._writeColorToOwnBuffer()
  }
}
```

## Renderer2D Integration

```typescript
class Renderer2D extends Group implements WorldProvider {
  private _world: World | null = null

  get world(): World {
    if (!this._world) {
      this._world = createWorld()
      // Spawn BatchRegistry singleton entity
      this._world.spawn(BatchRegistry({ ... }))
    }
    return this._world
  }

  // Systems run automatically in updateMatrixWorld()
  // No manual update() call needed
  override updateMatrixWorld(force?: boolean): void {
    this._runSystems()
    super.updateMatrixWorld(force)
  }

  private _runSystems(): void {
    batchAssignSystem(this._world, this._effectTraits)
    batchReassignSystem(this._world, this._effectTraits)
    batchRemoveSystem(this._world)
    bufferSyncColorSystem(this._world)
    bufferSyncUVSystem(this._world)
    bufferSyncFlipSystem(this._world)
    bufferSyncEffectSystem(this._world, this._effectTraits)
    transformSyncSystem(this._world)
    sceneGraphSyncSystem(this._world, this, this._parentAdd, this._parentRemove)
  }
}
```
