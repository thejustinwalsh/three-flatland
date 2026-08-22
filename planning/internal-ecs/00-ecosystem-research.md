# JavaScript and TypeScript ECS ecosystem research

Status: research report

Date: 2026-08-22

## Scope and method

This is a broad survey of relevant browser- and Node-capable ECS implementations, not a claim that every package ever published under the overloaded term “ECS” was found. The search covered maintained, historically influential, performance-oriented, TypeScript-oriented, Three/R3F-adjacent, and deliberately tiny systems. Primary repositories and official documentation were used for the design claims.

The important question is not “which library should Flatland adopt?” Flatland already uses a small, unusual subset of one. The question is which proven storage and API ideas belong in a private rendering data store.

## Systems reviewed

| System                                                                      | Storage/API emphasis                                                                                  | Useful lesson for Flatland                                                                                    | Why it is not the direct answer                                                                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Koota](https://github.com/pmndrs/koota)                                    | Typed trait schemas, numeric entities, SoA/AoS/tag traits, cached queries, relations, tracking, React | Best schema ergonomics in this set; direct stores align with current sprite hot paths                         | Flatland retains generalized tracking, relations, universe state, entity patching, and query machinery it does not need                              |
| [bitECS](https://github.com/NateTheGreatt/bitECS)                           | Minimal functional API, numeric IDs, user-owned SoA/AoS data, direct indexed access                   | Confirms that the fastest JS surface can be plain IDs plus direct arrays; components need not be classes      | Its public flexibility, serialization, relations, and thread support exceed this private kernel; its schema ergonomics are intentionally lower level |
| [Miniplex](https://github.com/hmans/miniplex)                               | Plain object entities, archetypal queries, strong TypeScript ergonomics, no scheduler                 | Good example of letting the host own scheduling and of maintaining live query groups                          | Object entities and property-based components work against Flatland's existing eid-indexed GPU data path                                             |
| [Becsy](https://github.com/LastOliveGames/becsy)                            | Decorator/schema components, scheduling, access declarations, multithreading                          | Explicit read/write access and deferred structural work are sound large-engine patterns                       | Scheduler and multithreading architecture are much larger than the renderer-local problem                                                            |
| [ECSY](https://github.com/ecsyjs/ecsy)                                      | Component classes, systems, reactive query events, pooling                                            | Queued reactive events and deterministic system order are useful semantic references                          | Archived in 2025; object/class/pool model is heavier and less data-direct than Flatland needs                                                        |
| [Ape-ECS](https://github.com/fritzy/ape-ecs)                                | Persistent queries, references, serialization, object components                                      | Persistent query indexes demonstrate the value of paying structural cost once rather than scanning each frame | Reference cleanup, persistence, components, and system framework are out of scope                                                                    |
| [WolfECS](https://github.com/EnderShadow8/wolf-ecs)                         | Typed-array schemas, numeric IDs, archetype-oriented queries, benchmark-first design                  | Shows the upper-bound value of explicit scalar types and manual loops                                         | Its own README says not to use it for applications; fixed maxima and benchmark-specialized tradeoffs are unacceptable as the production design       |
| [NovaECS](https://github.com/esengine/NovaECS)                              | Generational numeric handles, sparse-set storage, smallest-query anchor, frame change tracking        | Closest independent validation of the proposed numeric-handle + sparse-set + anchor design                    | Includes commands, scheduling, stages, fixed timestep, and broader engine machinery                                                                  |
| [sim-ecs](https://github.com/NSSTC/sim-ecs)                                 | Fully declared AoS simulation, commands, async systems                                                | Useful counterexample: command buffers and full up-front registration improve large simulation control        | Optimizes a simulation framework and iteration speed, not a tiny renderer-local SoA runtime                                                          |
| [mreinstein/ecs](https://github.com/mreinstein/ecs)                         | Roughly 100-line functional ECS with O(1) system iteration                                            | Proves a useful ECS kernel can be extremely small when the feature set is fixed                               | String component names and ordinary entity objects lose the typed schema/direct-store properties we want                                             |
| [Goodluck](https://github.com/piesku/goodluck)                              | Small game-oriented ECS embedded in a broader minimal engine                                          | Strong precedent for owning a small ECS that matches one engine rather than solving every use case            | Flatland needs a narrower renderer data store, not Goodluck's game loop and engine conventions                                                       |
| [Miniplex predecessor patterns / Geotic](https://github.com/ddmills/geotic) | Object-oriented JavaScript entities and components                                                    | Useful historical DX reference for object identity and composition                                            | Object-heavy and not aligned with the current SoA hot path                                                                                           |
| [gecs](https://github.com/noahlange/gecs)                                   | TypeScript generics and typed object components                                                       | Demonstrates how far compile-time composition types can go                                                    | The project describes itself as experimental and slower than low-level ECS designs                                                                   |
| [typeonce/ecs](https://github.com/typeonce-dev/ecs)                         | Type-safe composable renderer-independent ECS                                                         | Helpful type-surface reference                                                                                | General extensibility and composability are not goals for an unexported kernel                                                                       |
| [micro-ecs](https://github.com/Byloth/micro-ecs)                            | DX-first class model, events, no typed arrays                                                         | Useful explicit statement of JS ergonomics/performance tradeoffs                                              | Chooses classes and pub/sub over the data-direct rendering path                                                                                      |
| [Decentraland ECS](https://github.com/decentraland/js-sdk-toolchain)        | Schema-oriented components plus CRDT/network semantics                                                | Shows schema APIs can remain stable above specialized storage                                                 | Networking/CRDT behavior is unrelated and dominates the design                                                                                       |
| [ESEngine ECS](https://github.com/esengine/esengine)                        | Class components, matchers, reactive queries, full game framework                                     | Query matching and lifecycle coverage provide comparison cases                                                | A broad engine framework, not a small dependency replacement                                                                                         |
| [JECS](https://github.com/zakplus/jecs)                                     | General Node/browser entity, component, system engine                                                 | Useful baseline for conventional component-any-value APIs                                                     | Class/system surface and string identity are not suitable for Flatland's hot path                                                                    |

## Architectural families

### 1. Plain-object ECS

Examples: Miniplex, Geotic, several small engines.

Strengths:

- Excellent JavaScript and TypeScript ergonomics.
- Components may be arbitrary values without schema machinery.
- Entity identity and debugging are straightforward.

Weaknesses for Flatland:

- Data is distributed across objects rather than the stable per-field arrays already read by sprite setters and buffer systems.
- Object identity cannot replace the numeric index used by `spriteArr`, `BatchSlot`, and GPU staging buffers without a larger regression-prone rewrite.
- It optimizes author-facing game state, while this runtime is deliberately not author-facing.

Conclusion: reject the entity-object model, retain the idea that scheduling belongs to Flatland rather than the ECS.

### 2. Direct indexed SoA

Examples: bitECS, Koota's numeric schemas, WolfECS.

Strengths:

- Direct `field[eid]` access matches GPU-buffer staging.
- Numeric entity iteration is compact and JIT-friendly.
- Tags and numeric fields can avoid per-entity component objects.

Weaknesses:

- Typed arrays need capacity planning or reallocation indirection.
- Fully generic schema and relation support can erase the size advantage.
- Direct writes require an explicit policy for change notification.

Conclusion: adopt direct SoA, but benchmark ordinary packed number arrays against typed-array variants because Sprite2D retains stable references to field arrays while worlds grow.

### 3. Archetype tables

Examples: Miniplex query groups at an object level, Becsy/sim-ecs and many lower-level ECS designs at a table level.

Strengths:

- Iteration over a stable component combination can be extremely compact.
- A query can walk whole matching tables without per-entity membership checks.

Weaknesses for Flatland:

- Adding or removing dynamic material/light/pass effect traits moves an entity between archetypes.
- Stable eid-indexed component arrays are more valuable here than tightly packed archetype rows.
- Most frame queries are already served by a few stable sets, while structural changes are comparatively rare.

Conclusion: do not make archetype migration the core. Incrementally maintained selector sets provide the relevant benefit without moving component data.

### 4. Sparse-set components and queries

Examples: NovaECS, Koota utility structures, many high-performance ECS kernels.

Strengths:

- O(1) presence, add, and remove.
- Dense candidate iteration.
- Query intersection can start from the smallest component set.
- A query's own dense/sparse set can be maintained only when structure changes.

Weaknesses:

- Two index arrays per set consume memory.
- Swap-remove makes iteration order unstable.
- A generic implementation can create many redundant sets.

Conclusion: this is the leading kernel, but it competes against a smaller signature kernel and anchored scans in the benchmark phase.

### 5. Signatures and bit masks

Examples: Koota query membership and many archetype/query engines.

Strengths:

- Very fast multi-component membership checks.
- Compact when the component set is known and below one machine word.

Weaknesses for Flatland:

- Flatland has 24 statically declared traits plus one statically declared relation today (25 schema
  declarations), as well as dynamically created effect traits; one 32-bit word is not a safe
  long-term ceiling.
- Multiword signatures add memory and update machinery.
- Signatures do not provide dense candidate iteration by themselves.

Conclusion: prototype, do not assume. If selector subscriptions already limit recomputation, per-trait presence checks may be smaller with equivalent frame speed.

### 6. Reactive trackers

Examples: Koota Added/Changed/Removed, ECSY reactive queries, NovaECS frame tracking.

Koota takes a general snapshot/mask approach that supports compound modifier logic. Flatland has exactly three consumers:

- added `IsRenderable`,
- removed `IsRenderable`,
- changed `SortLayer`, `SpriteMaterialRef`, and `CameraLayersMask`.

Conclusion: use explicit per-selector queues. Register a selector with the affected traits once; structural or tracked writes push the eid into its reusable sparse queue. Draining clears only that queue. No global tracker cursor or world-mask snapshot is required.

## What to borrow

1. **Koota:** schema-call ergonomics and tag/SoA/AoS distinction.
2. **bitECS:** numeric IDs, functional world operations, direct user-owned arrays, and a small unopinionated kernel.
3. **NovaECS:** generational safety, sparse-set/anchor competition, and frame-oriented change semantics.
4. **Miniplex/Ape-ECS:** queries are persistent indexes maintained on composition changes, not rebuilt each frame.
5. **ECSY/Becsy:** event order and structural mutation semantics must be explicit and tested.
6. **WolfECS:** benchmark manual loops and scalar storage layouts, while rejecting fixed-capacity and benchmark-only compromises.

## What not to build

- No system scheduler; `SystemSchedule` already owns ordering and instrumentation.
- No React bindings; React users interact with Three/R3F objects, not this store.
- No actions, subscriptions, serialization, networking, workers, prefabs, resources, or plugins.
- No public component API.
- No general relation or hierarchy engine.
- No `Not`, `Or`, arbitrary nested modifier language, or ad hoc query builder unless an existing Flatland query requires it.
- No fixed entity maximum chosen only to improve a synthetic benchmark.
- No mutation of built-in prototypes.

## Research conclusion

There is no reason to replace Koota with another off-the-shelf ECS. bitECS is the closest storage match, Koota has the preferred schema surface, and NovaECS validates the likely sparse-set/anchor design. Each still ships capabilities Flatland does not require.

The correct experiment is a private kernel with a Koota-influenced schema definition and a bitECS-influenced world API, then selecting its internal membership strategy by Flatland-specific benchmarks.
