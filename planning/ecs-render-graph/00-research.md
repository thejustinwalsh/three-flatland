# ECS Render Graph - Research

## System Classification

Three-flatland is a high-performance 2D sprite and effects library for Three.js using WebGPU and TSL (Three Shader Language). It provides batched instanced rendering of 2D sprites with per-instance attributes, automatic layer/material-based sorting, and a composable TSL node system for shader effects.

## Current Rendering Pipeline

```
Sprite2D  -->  BatchManager  -->  SpriteBatch (InstancedMesh)  -->  Three.js renderer
  (Mesh)       (sort/group)       (GPU buffers + draw call)        (WebGPU/WebGL)
```

### Sprite2D

- Extends `THREE.Mesh` with a `PlaneGeometry` and `Sprite2DMaterial`.
- Owns private state: `_frame`, `_texture`, `_tint`, `_alpha`, `_flipX`, `_flipY`.
- Carries `layer` (primary sort key) and `zIndex` (secondary sort key).
- Maintains its own `Float32Array` buffers (`_instanceUVBuffer`, `_instanceColorBuffer`, `_instanceFlipBuffer`) used for standalone rendering.
- Supports per-instance custom attributes via `setInstanceValue(name, value)`.
- Overrides `updateMatrix()` to inject Z offset from `layer * 10 + zIndex * 0.001`.

### Renderer2D

- Extends `THREE.Group`. Lives in the scene graph.
- Owns a `BatchManager`. On `update()`: invalidates transforms (optionally auto), calls `prepare()` then `upload()`, then syncs batch children into the Group.
- Delegates `add(sprite)` / `remove(sprite)` to BatchManager.
- Sync loop removes stale children and adds new `SpriteBatch` objects with sequential `renderOrder`.

### BatchManager

- Maintains a `Map<Sprite2D, SpriteEntry>` of all registered sprites.
- Computes a packed sort key: `(layer << 24) | (batchId << 12) | zIndex`.
- On `prepare()`: if sort is dirty, calls `_rebuildBatches()` which:
  1. Recycles all active batches to a pool.
  2. Sorts all entries by sort key.
  3. Groups into `SpriteBatch` instances, breaking on material change, layer change, or batch full.
- On `upload()`: iterates active batches and calls `batch.upload()`.

### SpriteBatch

- Extends `THREE.InstancedMesh`. One draw call per batch (up to 10,000 sprites).
- Pre-allocates `InstancedBufferAttribute` arrays for UV, color, flip, plus custom attributes from the material schema.
- Implements the `BatchTarget` interface so sprites can write directly to batch buffers.
- `upload()`: reads transforms from sprites (`sprite.updateMatrix()` + `setMatrixAt()`), sets `this.count`.
- Free-list allocator for slot reuse; freed slots set alpha to 0.

## Current Data Flow

### Property Setter -> Direct Buffer Write (Zero-Copy)

When a sprite is attached to a batch:

```
sprite.tint = red
  -> set tint(value)
    -> this._tint.copy(value)
    -> this._updateInstanceColor()
      -> if (this._batchTarget)
        -> batchTarget.writeColor(index, r, g, b, a)   // direct Float32Array write
        -> batchTarget.getColorAttribute().needsUpdate = true
```

When standalone (no batch):

```
sprite.tint = red
  -> writes to own _instanceColorBuffer (4 vertices x vec4)
  -> marks geometry attribute needsUpdate
```

### Transform Sync

Transforms are NOT zero-copy. Each frame (when dirty), `SpriteBatch.upload()` iterates sprites and copies their matrices:

```
for each sprite in batch:
  sprite.updateMatrix()
  batch.setMatrixAt(i, sprite.matrix)
batch.instanceMatrix.needsUpdate = true
```

### Custom Instance Attributes

Materials declare a schema via `addInstanceFloat()` / `addInstanceVec2()` etc. SpriteBatch reads the schema at construction to allocate `InstancedBufferAttribute` arrays. Sprites write via `setInstanceValue(name, value)` which calls `batchTarget.writeCustom()`.

## Batching Strategy

1. **Sort key encoding**: `(layer:8 | batchId:12 | zIndex:12)` -- single integer comparison.
2. **Batch breaks**: material change, layer change, or batch full (10,000 cap).
3. **Rebuild is full**: on any sort-dirty flag, ALL batches are recycled and rebuilt from scratch. Sprites are detached, re-sorted, and re-attached.
4. **Pool reuse**: old `SpriteBatch` objects are pooled. Reused if same `batchId`, otherwise disposed and recreated.

## Koota ECS Capabilities

Koota is a trait-based ECS for TypeScript/JavaScript. Key features relevant to this design:

### Traits (Components)

- Defined with `trait({ field: default })`. Fields are stored in Structure-of-Arrays (SoA) layout by default.
- Tag traits: `trait()` with no data -- just a flag.
- Reference traits: `trait(() => ({ object: null }))` for heap-allocated AoS data.
- Relation traits: `relation({ exclusive: true })` for entity-to-entity links.

### Queries

- `world.query(TraitA, TraitB)` returns matching entities.
- Modifiers: `Changed(Trait)` (modified since last query reset), `Added(Trait)`, `Removed(Trait)`, `Not(Trait)`.
- `Changed()` is central to dirty tracking -- only entities whose trait data was written since the last flush appear in the query.

### Worlds

- `createWorld()` creates an isolated ECS context.
- Entities: `world.spawn(TraitA, TraitB({ field: value }))`.
- Systems are plain functions that run queries and mutate traits.

### Existing Traits (already defined)

The file `packages/core/src/ecs/traits.ts` already defines:

| Trait | Layout | Purpose |
|-------|--------|---------|
| `SpriteUV` | SoA | Frame UV `{ x, y, w, h }` |
| `SpriteColor` | SoA | Tint + alpha `{ r, g, b, a }` |
| `SpriteFlip` | SoA | Flip flags `{ x, y }` |
| `SpriteLayer` | SoA | Sort data `{ layer, zIndex }` |
| `SpriteMaterialRef` | SoA | Batch grouping `{ materialId }` |
| `IsRenderable` | Tag | Has all required components |
| `IsBatched` | Tag | Assigned to a SpriteBatch |
| `IsStandalone` | Tag | Rendering standalone |
| `ThreeRef` | AoS | Back-reference to Three.js object |
| `InBatch` | Relation | Sprite -> batch entity link |
