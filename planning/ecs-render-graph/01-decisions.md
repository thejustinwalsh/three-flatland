# ECS Render Graph - Design Decisions

## Resolved Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Source of truth | Traits authoritative | Koota trait stores are the single source of sprite data. `Sprite2D` properties become thin accessors that read/write the entity's traits. This eliminates dual-state (private fields + batch buffers) and makes `Changed()` queries the sole dirty-tracking mechanism. A global fallback world is provided for standalone sprites that are never added to a Renderer2D. |
| Koota dependency | Core dependency | Koota is always present in `@three-flatland/core`. It is used internally for orchestration (batching, dirty tracking, buffer sync) even when the user never touches the ECS directly. The user-facing API (`Sprite2D`, `Renderer2D`) remains unchanged. |
| Effect scope | Per-material | Effects define the shader program on the material. Per-sprite variation is achieved through instance attributes (e.g., dissolve progress). The material's `colorNode` is the composition root for all effects. |
| World scope | Inherited context | `Flatland` (future scene-level wrapper) creates a world. `Renderer2D` creates its own world if it is not inside a `Flatland` context. Standalone sprites (never added to a Renderer2D) use a lazily-initialized global world. A dev-time error fires if a sprite's world changes after entity creation. |
| Node requirements | Trait-linked decorators | `defineEffect()` ties a Koota trait to a TSL node factory plus instance attribute declarations. This provides a single registration point: one call declares the trait shape, the GPU attribute layout, and the shader function. |
| GPU sync | Frame copy with dirty tracking | A `bufferSyncSystem` copies only `Changed()` entities from SoA trait stores to the interleaved GPU `InstancedBufferAttribute` arrays. This replaces the current per-setter `writeColor/writeUV/writeFlip` calls with a batched per-frame copy. Transforms are synced separately via `transformSyncSystem`. |
| World inheritance | Explicit context property | A `_flatlandWorld` property propagates down the Three.js scene graph via overridden `add()`/`remove()` on context providers (`Flatland`, `Renderer2D`). Children inherit the world from their parent provider. |

## Deferred Decisions

| Decision | Status | Notes |
|----------|--------|-------|
| Render graph topology | Phase 4 | Topological sort of render pass entities. Not needed until multi-pass effects (lighting, post-processing). |
| Light2D entities | Phase 4 | 2D point/spot/ambient lights as ECS entities with associated render targets. |
| Physics integration | Not planned | Out of scope. Users can sync physics body positions to traits manually. |
| Network sync | Not planned | Trait stores are local. Serialization is a userland concern. |

## Key Constraints

1. **R3F compatibility**: `Sprite2D` must remain constructible with no arguments. Properties must be settable after construction. Array-compatible setters (e.g., `anchor = [0.5, 0.5]`).
2. **Zero breaking changes**: The public API of `Sprite2D`, `Renderer2D`, `Sprite2DMaterial` does not change. ECS is an internal implementation detail unless the user opts in.
3. **Performance budget**: The sync systems must not regress frame time. `Changed()` queries ensure only dirty entities are processed. The SoA layout of trait stores enables cache-friendly iteration.
4. **Tree-shaking**: Users who import only `Sprite2D` must not pull in the entire ECS system. Lazy initialization of the global world defers the cost.
