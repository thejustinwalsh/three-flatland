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
                     │ bufferSyncSystem
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

### Relations

| Relation | Config | Purpose |
|----------|--------|---------|
| `InBatch` | `exclusive: true` | Links sprite entity to its batch entity |

## Per-Frame Data Flow

```
1. User mutates sprite
   sprite.tint = red
     -> Sprite2D.set tint(v)
       -> entity.set(SpriteColor, { r, g, b, a })
       -> Koota marks SpriteColor as Changed for this entity

2. Renderer2D.update() runs systems:

   a) batchPrepareSystem(world)
      - query(Changed(SpriteLayer), Changed(SpriteMaterialRef))
      - if any changed: re-sort, rebuild batch assignments
      - result: InBatch relations updated, IsBatched tags set

   b) bufferSyncSystem(world)
      - query(Changed(SpriteUV), IsBatched)  -> copy UV to batch buffer
      - query(Changed(SpriteColor), IsBatched) -> copy color to batch buffer
      - query(Changed(SpriteFlip), IsBatched) -> copy flip to batch buffer
      - query(Changed(CustomTrait), IsBatched) -> copy custom attrs
      - mark InstancedBufferAttribute.needsUpdate = true

   c) transformSyncSystem(world)
      - query(IsBatched, ThreeRef)
      - for each: sprite.updateMatrix(), batch.setMatrixAt()
      - mark instanceMatrix.needsUpdate = true

3. Three.js renders scene
   - SpriteBatch children of Renderer2D are rendered in renderOrder
```

## Systems

### batchPrepareSystem

Replaces `BatchManager._rebuildBatches()`. Runs only when sort-relevant traits change.

```
Triggers: Changed(SpriteLayer) OR Changed(SpriteMaterialRef) OR Added(IsRenderable) OR Removed(IsRenderable)
Actions:
  1. Recompute sort keys for changed entities
  2. If sort order changed: detach all, sort, reassign to SpriteBatch slots
  3. Update InBatch relations and IsBatched/IsStandalone tags
```

### bufferSyncSystem

Replaces the per-setter `writeColor/writeUV/writeFlip` direct writes. Runs every frame but only processes `Changed()` entities.

```
Triggers: Changed(SpriteUV) OR Changed(SpriteColor) OR Changed(SpriteFlip) OR Changed(custom traits)
Actions:
  1. For each changed entity with IsBatched:
     a. Look up batch and slot index via InBatch relation
     b. Copy trait fields to the batch's Float32Array at the correct offset
     c. Mark the corresponding InstancedBufferAttribute.needsUpdate
```

### transformSyncSystem

Handles position/rotation/scale. Transforms live on the Three.js `Object3D`, not in traits, because Three.js matrix math is authoritative.

```
Triggers: runs every frame when autoInvalidateTransforms is true (or manually flagged)
Actions:
  1. For each IsBatched entity:
     a. Get ThreeRef.object (the Sprite2D mesh)
     b. Call sprite.updateMatrix()
     c. Call batch.setMatrixAt(slotIndex, sprite.matrix)
  2. Mark instanceMatrix.needsUpdate
```

## Sprite2D Integration

Sprite2D property setters become trait writers:

```typescript
// Current (direct buffer write):
set tint(value) {
  this._tint.copy(value)
  this._updateInstanceColor()  // writes to batch or own buffer
}

// After ECS (trait write):
set tint(value) {
  this._tint.copy(value)
  if (this._entity) {
    this._entity.set(SpriteColor, {
      r: this._tint.r,
      g: this._tint.g,
      b: this._tint.b,
      a: this._alpha,
    })
  }
}
```

The entity is spawned lazily on first access (either when added to a Renderer2D, or on first property set if standalone).

## Renderer2D Integration

```typescript
class Renderer2D extends Group implements WorldProvider {
  _flatlandWorld: World
  private _systems: System[]

  constructor() {
    this._flatlandWorld = createWorld()
    this._systems = [batchPrepareSystem, bufferSyncSystem, transformSyncSystem]
  }

  update() {
    for (const system of this._systems) {
      system(this._flatlandWorld)
    }
    this._syncBatches()  // existing scene graph sync
  }
}
```
