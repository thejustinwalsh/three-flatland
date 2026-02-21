# ECS Render Graph - Implementation Phases

## Phase 1: ECS Foundation ✅ COMPLETE

**Goal**: Wire Koota into the core pipeline. Traits become the source of truth. Sprite2D and Renderer2D work exactly as before from the user's perspective.

### Steps

1. **Add koota dependency** to `packages/core/package.json`.
2. **Finalize traits** in `packages/core/src/ecs/traits.ts` (already drafted -- review and lock down).
3. **Create world management** module:
   - `getGlobalWorld()` -- lazy singleton for standalone sprites.
   - `assignWorld(sprite, world)` -- spawn entity with all required traits, store entity ref on sprite.
4. **Wire Sprite2D**:
   - Add `_entity` field (koota entity reference, initially null).
   - Spawn entity lazily on first trait-relevant mutation or when added to a Renderer2D.
   - Property setters (`tint`, `alpha`, `frame`, `flipX`, `flipY`, `layer`, `zIndex`) write to traits instead of (or in addition to) private fields.
   - Keep private fields as local cache for getters (avoids ECS read on hot paths like animation).
5. **Wire Renderer2D**:
   - Create a world in constructor (or inherit from parent).
   - `add(sprite)` calls `assignWorld(sprite, this._flatlandWorld)` then registers with BatchManager.
   - `update()` remains the same for now (systems replace internals in Phase 3).

### File Changes

| File | Change |
|------|--------|
| `packages/core/package.json` | Add `koota` dependency |
| `packages/core/src/ecs/traits.ts` | Review, no major changes expected |
| `packages/core/src/ecs/world.ts` | **New** -- `getGlobalWorld()`, `assignWorld()` |
| `packages/core/src/ecs/index.ts` | **New** -- re-export traits and world utilities |
| `packages/core/src/sprites/Sprite2D.ts` | Add `_entity`, update setters to write traits |
| `packages/core/src/pipeline/Renderer2D.ts` | Add `_flatlandWorld`, call `assignWorld()` on add |
| `packages/core/src/index.ts` | Export `ecs` module |

### Validation

- All existing tests pass with no public API changes.
- `Sprite2D` property round-trips work: `sprite.tint = red; expect(sprite.tint).toEqual(red)`.
- Entity is spawned on first add to Renderer2D.
- Standalone sprite gets global world entity on first property set.

---

## Phase 2: Effect System ✅ COMPLETE

**Goal**: Implement effect registration via `createMaterialEffect()` and wire it into `Sprite2DMaterial`.

### What Was Implemented

1. **`createMaterialEffect()`** class factory:
   - Accepts name, schema, and TSL node factory.
   - Creates a Koota trait from the schema.
   - Returns an `MaterialEffect` class with typed property accessors.
2. **`Sprite2DMaterial` integration**:
   - `registerEffect(effectClass)` registers attributes and rebuilds shader.
   - Packed vec4 effect buffers with tiered scaling (1 effect = 1 buffer, 5+ effects = 2 buffers, etc.).
   - Effect chain composes: texture sample → tint/alpha → effect[0] → effect[1] → final.
3. **`Sprite2D` integration**:
   - `addEffect(instance)` / `removeEffect(instance)` manage per-sprite effect instances.
   - Effect data written to ECS traits (enrolled) or own buffers (standalone).

### Files

| File | Status |
|------|--------|
| `packages/core/src/materials/MaterialEffect.ts` | Implemented |
| `packages/core/src/materials/Sprite2DMaterial.ts` | Updated with effect registration |
| `packages/core/src/sprites/Sprite2D.ts` | Updated with addEffect/removeEffect |

---

## Phase 3: ECS-Driven Batching ✅ COMPLETE

**Goal**: Replace BatchManager with pure ECS systems. Batch entities, InBatch relations, incremental insert-time sorting.

### What Was Implemented

The original plan called for a single `batchPrepareSystem` and `bufferSyncSystem`. The implementation split these into finer-grained systems for better separation of concerns:

1. **Batch lifecycle systems** (replaced `batchPrepareSystem`):
   - `batchAssignSystem` — handles `Added(IsRenderable)`, computes run key, finds/creates batch, allocates slot, performs initial buffer sync
   - `batchReassignSystem` — handles `Changed(SpriteLayer)` or `Changed(SpriteMaterialRef)` on batched sprites, moves between batches when run key changes
   - `batchRemoveSystem` — handles `Removed(IsRenderable)`, frees slot, removes relation, recycles empty batches

2. **Buffer sync systems** (replaced single `bufferSyncSystem`):
   - `bufferSyncColorSystem` — `Changed(SpriteColor) + IsBatched` → batch color buffer
   - `bufferSyncUVSystem` — `Changed(SpriteUV) + IsBatched` → batch UV buffer
   - `bufferSyncFlipSystem` — `Changed(SpriteFlip) + IsBatched` → batch flip buffer
   - `bufferSyncEffectSystem` — `Changed(effectTrait) + IsBatched` → packed effect buffers

3. **`transformSyncSystem`** — syncs Three.js transforms to GPU instance matrices

4. **`sceneGraphSyncSystem`** — rebuilds Renderer2D children from sorted batch entities (not in original plan, but necessary for integration)

5. **`InBatch` relation with store data** — `relation({ exclusive: true, store: { slot: 0 } })` holds the GPU buffer slot index directly on the relation, avoiding extra traits or lookups

6. **Incremental sort via run keys** — `computeRunKey(layer, materialId)` with binary search on `sortedRunKeys` array for O(log R) insert

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/ecs/traits.ts` | Added `BatchMesh`, `BatchMeta`, `BatchRegistry`, updated `InBatch` with store data |
| `packages/core/src/ecs/batchUtils.ts` | **New** — run key computation, binary search, batch lifecycle helpers |
| `packages/core/src/ecs/systems/batchAssignSystem.ts` | **New** |
| `packages/core/src/ecs/systems/batchReassignSystem.ts` | **New** |
| `packages/core/src/ecs/systems/batchRemoveSystem.ts` | **New** |
| `packages/core/src/ecs/systems/bufferSyncSystem.ts` | **New** — color, UV, flip, effect sync functions |
| `packages/core/src/ecs/systems/transformSyncSystem.ts` | **New** |
| `packages/core/src/ecs/systems/sceneGraphSyncSystem.ts` | **New** |
| `packages/core/src/ecs/systems/index.ts` | **New** — re-exports all systems |
| `packages/core/src/sprites/Sprite2D.ts` | Removed `_batchTarget`, `_batchIndex`, `_attachToBatch`, `_detachFromBatch`, `_syncToBatch` |
| `packages/core/src/pipeline/Renderer2D.ts` | Rewritten to use ECS systems instead of BatchManager |
| `packages/core/src/pipeline/SpriteBatch.ts` | Removed `addSprite`/`removeSprite`/`clearSprites`; added `allocateSlot()`/`freeSlot()`/`resetSlots()`/`syncCount()` |

### Files Removed

| File | Reason |
|------|--------|
| `packages/core/src/pipeline/BatchManager.ts` | Replaced by ECS systems |
| `packages/core/src/pipeline/BatchTarget.ts` | Replaced by InBatch relation — systems call SpriteBatch methods directly |

### Validation

- `pnpm typecheck` — all packages pass
- `pnpm test` — 294 tests pass, 5 skipped (pre-existing)
- `pnpm build` — all packages and examples build successfully
- `invalidate()`, `invalidateAll()`, `invalidateTransforms()` are now no-ops (ECS detects changes automatically)
- `update()` still works but is deprecated in favor of automatic `updateMatrixWorld()` hook

---

## Phase 4: Lighting & Render Graph (Future)

**Goal**: Extend the ECS to support 2D lighting, multi-pass rendering, and a topological render graph.

### Steps

1. **Light2D entities**:
   - Define `Light2D` trait: `{ type, color, intensity, radius, falloff }`.
   - Define `PointLight2D`, `SpotLight2D`, `AmbientLight2D` as tagged Light2D variants.
   - Light entities contribute to a light accumulation pass.
2. **Render pass entities**:
   - Define `RenderPass` trait: `{ target, clear, dependencies }`.
   - Each pass has input/output render targets.
   - Normal map pass, light accumulation pass, composite pass.
3. **Topological sort**:
   - Build a DAG from render pass dependencies.
   - Sort passes in execution order.
   - Execute passes sequentially, binding render targets.
4. **Normal map support**:
   - `SpriteNormalMap` trait references a normal map texture.
   - Normal map pass renders sprite normals to a G-buffer.
   - Light pass reads normals + light positions to compute lighting.

### File Changes (Tentative)

| File | Change |
|------|--------|
| `packages/core/src/ecs/traits.ts` | Add `Light2D`, `RenderPass` traits |
| `packages/core/src/ecs/systems/lightSystem.ts` | **New** |
| `packages/core/src/ecs/systems/renderGraphSystem.ts` | **New** |
| `packages/core/src/lighting/Light2D.ts` | **New** -- user-facing light object |
| `packages/core/src/pipeline/RenderGraph.ts` | **New** -- pass scheduling |

### Validation

- 2D point light with falloff renders correctly.
- Multiple lights accumulate additively.
- Render graph executes passes in correct dependency order.
- No visual regression for scenes without lights (zero-cost when unused).
