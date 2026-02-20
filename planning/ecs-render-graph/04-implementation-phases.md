# ECS Render Graph - Implementation Phases

## Phase 1: ECS Foundation

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
   - `_attachToBatch` / `_detachFromBatch` add/remove `IsBatched` tag and `InBatch` relation.
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

## Phase 2: defineEffect() System

**Goal**: Implement the `defineEffect()` registration API and wire it into `Sprite2DMaterial`.

### Steps

1. **Create `defineEffect()`** function:
   - Accepts `EffectDescriptor` config.
   - Creates a Koota trait from the `trait` schema.
   - Returns `{ Trait, descriptor }`.
2. **Extend Sprite2DMaterial**:
   - Add `addEffect(descriptor)` method.
   - Auto-register instance attributes from effect declarations.
   - Rebuild `colorNode` chain when effects are added.
   - Extract base color node construction into `_buildBaseColorNode()`.
3. **Create built-in effect descriptors** (optional, can be done incrementally):
   - Dissolve effect as a `defineEffect()` wrapper around existing `dissolve()` node.

### File Changes

| File | Change |
|------|--------|
| `packages/core/src/ecs/defineEffect.ts` | **New** -- `defineEffect()` function |
| `packages/core/src/ecs/types.ts` | **New** -- `EffectDescriptor`, `EffectNodeContext`, `InstanceAttrDeclaration` |
| `packages/core/src/ecs/index.ts` | Re-export `defineEffect` |
| `packages/core/src/materials/Sprite2DMaterial.ts` | Add `addEffect()`, `_rebuildColorNode()`, `_buildBaseColorNode()` |
| `packages/core/src/effects/dissolve.ts` | **New** (optional) -- `DissolveEffect` using `defineEffect()` |

### Validation

- `defineEffect()` returns a valid Koota trait.
- `material.addEffect(descriptor)` registers attributes visible in `getInstanceAttributeSchema()`.
- Effect chain composes correctly: base color -> effect[0] -> effect[1].
- Existing manual `addInstanceFloat()` + custom `colorNode` workflow still works.

---

## Phase 3: ECS-Driven Batching

**Goal**: Replace BatchManager internals with ECS systems. The BatchManager class may become a thin facade or be replaced entirely.

### Steps

1. **Implement `batchPrepareSystem`**:
   - Query `Changed(SpriteLayer)`, `Changed(SpriteMaterialRef)`, `Added(IsRenderable)`, `Removed(IsRenderable)`.
   - Recompute sort keys, rebuild batch assignments.
   - Update `InBatch` relations, `IsBatched` / `IsStandalone` tags.
   - Manages SpriteBatch pool (reuse or create).
2. **Implement `bufferSyncSystem`**:
   - Query `Changed(SpriteUV)` with `IsBatched` -> copy to batch UV buffer.
   - Query `Changed(SpriteColor)` with `IsBatched` -> copy to batch color buffer.
   - Query `Changed(SpriteFlip)` with `IsBatched` -> copy to batch flip buffer.
   - For each effect trait: query `Changed(EffectTrait)` with `IsBatched` -> copy to custom attribute buffer.
   - Mark `InstancedBufferAttribute.needsUpdate` only for buffers that were written.
3. **Implement `transformSyncSystem`**:
   - Query `IsBatched`, `ThreeRef`.
   - For each: `sprite.updateMatrix()`, `batch.setMatrixAt(slot, sprite.matrix)`.
   - Mark `instanceMatrix.needsUpdate`.
4. **Wire systems into Renderer2D.update()**:
   - Replace `batchManager.prepare()` + `batchManager.upload()` with system calls.
   - Keep `_syncBatches()` for scene graph child management.
5. **Remove direct buffer writes from Sprite2D**:
   - Remove `_batchTarget` / `_batchIndex` fields.
   - Remove `_updateInstanceColor()`, `_updateInstanceUV()`, `updateFlip()` batch paths.
   - Remove `_syncToBatch()`, `_syncToOwnBuffers()`.
   - Property setters now only write traits.

### File Changes

| File | Change |
|------|--------|
| `packages/core/src/ecs/systems/batchPrepareSystem.ts` | **New** |
| `packages/core/src/ecs/systems/bufferSyncSystem.ts` | **New** |
| `packages/core/src/ecs/systems/transformSyncSystem.ts` | **New** |
| `packages/core/src/ecs/systems/index.ts` | **New** -- re-exports |
| `packages/core/src/sprites/Sprite2D.ts` | Remove batch write paths, simplify setters |
| `packages/core/src/pipeline/Renderer2D.ts` | Replace BatchManager calls with system execution |
| `packages/core/src/pipeline/BatchManager.ts` | Reduce to facade or remove |
| `packages/core/src/pipeline/SpriteBatch.ts` | Remove `addSprite/removeSprite` (system manages slots directly) |
| `packages/core/src/pipeline/BatchTarget.ts` | May be removed (systems write buffers directly) |

### Validation

- Identical visual output to pre-ECS rendering.
- Performance benchmark: frame time for 10,000 sprites should be equal or better.
- `Changed()` queries process only mutated entities (verify with counters).
- Batch rebuild only triggers when sort-relevant data changes.
- Hot property changes (tint animation) only trigger `bufferSyncSystem`, not sort rebuild.

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
