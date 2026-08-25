# Private ECS architecture standard

Status: **accepted direction for renderer internals**

Date: 2026-08-23

Source audit: `94ead4425ac3e49ce68e975b21fa1d874d039655`

This standard defines the paved path for state that participates in Flatland rendering. It is not a mandate to turn every Three.js object into an entity. The public library remains a typed, idiomatic Three.js and React Three Fiber API; the private ECS exists to make repeated renderer work predictable, compact, and fast.

## Koota design provenance

The private runtime exists because Flatland first proved its renderer model with
[Koota](https://github.com/pmndrs/koota). Koota's typed trait schemas, structure-of-arrays storage,
incremental queries, and explicit systems established the useful control and execution split that
this standard specializes for Flatland. The internal runtime is not presented as a replacement for
Koota: Koota remains the recommended general-purpose ECS for application and gameplay state.

Every public document that explains Flatland's private renderer ECS must retain this attribution and
link to Koota. Dependency-removal instructions must distinguish removing the former package peer from
removing Koota as an application choice. Release notes and architecture explanations must not describe
the private runtime as an isolated invention or imply that Koota is obsolete.

The boundary matters because renderer state has two different jobs. Public objects need familiar constructors, properties, inheritance, disposal, and R3F no-argument construction. Frame systems need dense numeric access, stable ownership, and no incidental allocation. One representation is not good at both. Flatland therefore treats its public objects as the control surface and its private world as the execution model.

## The public API is the control plane

Users configure `Sprite2D`, `AnimatedSprite2D`, `SpriteGroup`, `MaterialEffect`, `LightEffect`, `PassEffect`, `TileMap2D`, and `Flatland` through typed constructors and properties. Those types must not expose entity handles, traits, stores, selectors, or the private world. React wrappers use the same classes and property setters rather than a second state model.

An object may stage values before it belongs to a world. Enrollment validates the complete staged state, reserves every required resource, and then publishes the entity and projections. Detachment copies any state needed for standalone behavior back to the object before releasing internal ownership. This keeps no-argument R3F construction compatible without making the runtime public.

The private runtime is deliberately absent from package exports and reachable declarations. This is a design constraint, not an implementation detail: changing internal storage must never require an application migration.

## One authoritative owner, explicit projections

Every mutable value has one authoritative owner at a time. Numeric renderer data belongs in numeric traits and is accessed through captured SoA stores. Heavy resources and identity-bearing objects—Three.js materials, textures, meshes, cameras, node functions, sets, maps, and GPU pipelines—belong in object traits or owner objects. Tags represent membership or lifecycle states without inventing boolean payloads.

GPU instance rows, uniform nodes, batch slot arrays, render-order arrays, and devtools snapshots are projections. They are not competing sources of truth. A public mutation commits to the authoritative state first and then updates every currently live projection before it becomes observable. Deferred systems may project structural changes, but the old projection must remain valid or be hidden until the transaction completes.

Resource membership is also a projection. Flatland retains sprite and tile-layer materials through one reference-counted ownership seam. Live `Sprite2D.material` replacement and `TileMap2D` layer rebuilds publish completed old/new material sets through owner-local subscriptions; Flatland then applies globals, lighting channels, and the current light transform to each newly retained material. A shared material retires only after its final sprite or tile-layer owner leaves. One mutable material cannot belong to two Flatland instances simultaneously because it has only one `globalUniforms` reference; Three-style reparenting retires the previous owner before rebinding, while concurrent cross-world sharing rejects before publication. Subsystems must extend that seam rather than snapshotting resources only during `add()`.

This is why dynamic batching is the reference implementation. `BatchSlot` identifies assignment numerically, `BatchRun` and `BatchMesh` retain heavyweight resources, and each `SpriteBatch` owns packed member-to-slot and slot-to-entity tables. Frame systems traverse the batch-local member view and write the final physical GPU row. Sorting changes indirection, not ownership.

## Numeric data follows the frame

Scalar and small-vector state read or written by frame systems belongs in SoA storage. Systems capture `world.store(Trait)` once and index the stable arrays with the entity slot. Generic `world.read` is reserved for object traits and cold validation paths. Generic `world.patch` is reserved for cold control paths; a numeric hot path writes the store directly and calls `world.touch` only when a real event consumer needs the change.

Schema-driven effects already demonstrate the intended public/private split. Their class factories produce typed public fields while enrolled values live in generated numeric traits. Property access uses cached stores. Material effects also project a changed field directly into the current batch row, while light and pass effects project to stable TSL uniform nodes. Constants and GPU resources remain object-owned because their identity matters more than numeric density.

Numeric storage is not a reason to mirror everything. A copied scalar must have a named synchronization owner and a reason to exist. If a system can read a heavyweight context object once and mutate its stable vectors or resources in place, adding a second numeric copy usually makes correctness worse.

## Lifecycle changes are transactions

Spawn, attach, detach, reassign, remove, recycle, and dispose operations follow the same sequence:

1. Validate all public input and ownership constraints without mutation.
2. Reserve entity, trait, batch, slot, and GPU capacity.
3. Initialize authoritative numeric and object state.
4. Publish membership and projections together.
5. On failure, roll back every reservation and leave the prior state observable.

Disposal is terminal but still first-error-safe. Internal cleanup runs even when user callbacks throw, references are released, GPU resources are disposed once, and the first thrown value is rethrown after cleanup. Recycled entity handles and batch slots must never make stale ownership look current.

The same rule applies to render and pass graphs. A graph edit becomes visible as one committed ordering, not as partially updated arrays, traits, and node functions.

## Steady-state work does not allocate

After warmup, a frame path reuses selector views, arrays, sets, maps, vectors, matrices, callback functions, and runtime contexts. Borrowed selector views are consumed synchronously and are never retained across structural mutations. Systems iterate packed batch-local ownership instead of rebuilding global lists.

Allocation is acceptable when constructing a public object, compiling a shader graph, changing graph topology, resizing capacity, or rebuilding a tile chunk. It is not acceptable merely because a sprite moved, an animation advanced, a light updated, or a frame rendered. The distinction is frequency and ownership, not whether an allocation looks small in isolation.

The tile animation path now follows this rule by clearing and reusing layer-owned changed-GID and dirty-chunk sets. Its chunk meshes and typed instance buffers were already batch-local projections; the remaining animation-state migration is a separate ownership change rather than a scratch-allocation fix.

Tilemap material effects follow the same retained-configuration rule. An attached effect or provider belongs to one tilemap, survives data and chunk-size rebuilds, and is reconciled into every replacement layer material before the new layer set is published. A buffer-tier change rebuilds existing chunk geometry so the shader schema and bound attributes change together.

## Capacity is a construction plan

Capacity configuration describes expected topology; it is not a live tuning control. The target API has an `expectedSprites` hint that reserves hot CPU-side world and registry storage, plus an advanced `maxBatchSize` ceiling. `expectedSprites` is constructor-only. React Three Fiber consumers pass a stable or memoized options object through `args` and intentionally reconstruct the group when the hint changes; there is no mutable JSX-property path for the hint. `maxBatchSize` retains its separately documented Three.js-style property behavior.

The hint eagerly initializes only the active CPU index-addressed structures whose absence/default values are safe to materialize, together with batch-index topology. It does not pre-create sprites, GPU batches or buffers, cold trait columns, or synthetic dense selector/event rows. This moves a measured amount of work into construction while avoiding cold-memory and GPU over-allocation. Automatic growth remains safe and bounded, and ordinary users do not need to coordinate multiple flags.

This target differs from today's mutable `SpriteGroup.maxBatchSize` setter, which only affects future batches. Converging it is a breaking public behavior change and therefore belongs in a dedicated reviewed migration, not a hidden refactor.

## Telemetry is profile-only

Production frame paths contain no marks, detail objects, labels, counters, or closures solely for diagnostics. Development and explicit profile builds may emit system spans and batch telemetry, but they must use the same schedule order and renderer behavior as production. A profile build proves where time goes; it must not become the implementation users ship by default.

`SystemSchedule` already keeps the ordinary production loop separate from instrumented execution. New subsystems use that gate rather than adding local environment checks or always-on counters.

## Applying the standard without overusing the ECS

The private ECS earns its place when state is numerous, queried by composition, shared across systems, or projected repeatedly to GPU batches. It is not automatically useful for a small, owner-local object graph.

Tile chunk meshes, material instances, shader functions, animation definitions, scene parents, cameras, and render targets should remain object-owned. Their dense per-instance or per-frame numeric state may move to SoA, while the resource itself stays behind one object-trait or owner boundary. Hierarchy observation similarly keeps `Object3D` identity in object-owned trackers while projecting final matrices into batch-local buffers.

This mixed model is intentional. It keeps the public library recognizable as Three.js, gives frame systems the data layout they need, and avoids rebuilding a general-purpose ECS inside the renderer.

## Enforcement

The standard is enforced by several independent gates:

- `packages/three-flatland/src/ecs/systems/hotPathContract.test.ts` audits numeric hot paths and requires explicit object-trait allowlists.
- `packages/three-flatland/src/ecs/privateArchitectureContract.test.ts` rejects Koota production imports, public ECS/runtime subpaths, and animated-tile scratch allocation. It also requires every public private-ECS document and release note to retain the Koota link, design provenance, and general-purpose recommendation.
- `scripts/verify-public-declaration-boundary.mjs` walks emitted public declaration roots and rejects private runtime or ownership-helper leaks.
- Runtime lifecycle, batch ownership, effect projection, hierarchy, and schedule tests prove behavior rather than relying only on source scans.
- `TileMap2D.effects.test.ts` and `flatland-material-ownership.test.ts` prove retained effect configuration, packed chunk-schema rebuilds, live sprite material swaps, shared-material reference counts, lighting transfer, and bounded repeated clear/rebuild cycles.
- Deterministic renderer evidence remains the authority for performance claims. A source pattern is not proof of a frame-time win.

The [convergence plan](./07-private-ecs-convergence-plan.md) records where current subsystems meet this standard and where further migration is justified.
