# Private ECS convergence plan

Status: **proposed follow-up sequence**

Date: 2026-08-23

Audit snapshot: `94ead4425ac3e49ce68e975b21fa1d874d039655`

This plan applies the [private ECS architecture standard](./06-private-ecs-architecture-standard.md) to renderer subsystems that were not the first migration target. References name the audited symbol and source range at the snapshot above; tests and measurements, not line numbers, remain the merge authority.

## Current conformance

### Dynamic sprite batching and hierarchy: paved path

Dynamic batching is the strongest current example. Numeric sprite and assignment traits live in `packages/three-flatland/src/ecs/traits.ts:18-105`. `BatchRegistry`, `BatchRun`, and `BatchMesh` retain identity-bearing resources in object traits at `traits.ts:145-241`. Packed ownership and direct GPU writes are maintained by `batchUtils.ts`, `batchAssignSystem.ts`, `batchReassignSystem.ts`, `batchRemoveSystem.ts`, and `batchSortSystem.ts`. The hot-path source contract explicitly audits those files.

`transformSyncSystem` traverses each batch's packed members, composes the Three.js hierarchy, and writes the final physical instance row (`packages/three-flatland/src/ecs/systems/transformSyncSystem.ts:137-315`). `HierarchyStateTracker` keeps ancestor `Object3D` identity and stable matrix snapshots owner-local (`packages/three-flatland/src/ecs/HierarchyStateTracker.ts:3-105`). This is the intended mixed model; moving Three.js parents into numeric traits would add synchronization without improving the batch projection.

No hierarchy migration is planned without profile evidence. New hierarchy work must preserve root-relative batch transforms, authored visibility, stale-slot protection, and allocation-free steady traversal.

### Material effects: conforms

`MaterialEffect` exposes typed schema properties while generating private numeric traits (`packages/three-flatland/src/materials/MaterialEffect.ts:179-281`). Enrolled property access captures the numeric store (`MaterialEffect.ts:303-411`), writes SoA directly, and projects the exact scalar or vector lanes into the current batch row (`MaterialEffect.ts:420-545`). Constants remain identity-bearing object state. Existing tests cover atomic registration, ownership, reassignment, slot reuse, sorting, and packed GPU rows.

Keep this subsystem as the template for other schema-driven state. Any new material-effect field must remain typed publicly, numeric internally when uniform-sized, bounded by its declared lane count, and synchronized to the current batch projection before the setter returns.

### Light and pass effects: partially conform

`LightEffect` and `PassEffect` use the same typed schema, generated numeric traits, cached stores, and stable TSL uniform projection (`packages/three-flatland/src/lights/LightEffect.ts:162-351,565-650`; `packages/three-flatland/src/pipeline/PassEffect.ts:87-294,332-466`). Their public field paths therefore follow the standard.

The world-level ownership remains mixed inside broad object traits. `LightEffectTrait`, `PostPassTrait`, `PostPassRegistry`, `ShadowPipeline`, and `LightingContext` combine functions/resources with order, enabled, dirty, size, and lifecycle scalars (`packages/three-flatland/src/ecs/traits.ts:247-349`). `postPassSystem` also constructs and sorts temporary arrays whenever the graph is dirty (`packages/three-flatland/src/ecs/systems/postPassSystem.ts:14-39`). That allocation is structural rather than per-frame, but the pass list in `Flatland` and the ECS pass entities form overlapping ownership surfaces.

### Animated sprites: public API is sound, execution state is object-local

`AnimatedSprite2D` keeps the expected Three/R3F surface and binds frame/event callbacks once (`packages/three-flatland/src/sprites/AnimatedSprite2D.ts:67-135,341-357`). Playback state lives in one `AnimationController` object per sprite and advances through explicit user calls. Definitions and frame objects should remain object-owned, but elapsed time, frame index, speed, direction, play state, and loop count are dense numeric state when thousands of sprites animate together.

This subsystem has not yet adopted private-world scheduling or numeric SoA. It should migrate only with a standalone compatibility path and a benchmark that includes many shared animation definitions.

### Tilemaps: retained material ownership and batch-local GPU projection

`TileLayer` already owns chunk meshes, typed instance buffers, and effect buffers per chunk (`packages/three-flatland/src/tilemap/TileLayer.ts:27-117,326-579`). Tile changes project directly into the affected chunk row. Animated tile lookup and timers are Maps of small objects, and `update` scans animated positions (`TileLayer.ts:584-642`). The immediate scratch-allocation gap is fixed: changed GIDs and dirty chunk keys now reuse layer-owned sets.

Material configuration is now retained by `TileMap2D` rather than being applied only to the layer materials that existed at attach time. Effect/provider ownership is exclusive and truthful across R3F cleanup, data replacement, and chunk-size rebuilds. Every layer replacement is prepared before publication; a wider effect tier rebuilds each existing chunk projection before Flatland observes the new material set. Live sprite material changes and tile-layer replacement both enter Flatland through the same reference-counted material seam, so current globals, channels, and lighting follow the resource and retired shared materials leave only after their final owner. Three-style sprite/tilemap reparenting releases the previous Flatland first; simultaneous cross-Flatland sharing of one mutable material rejects atomically because one material cannot point at two global-uniform sets.

Chunk topology, tilesets, meshes, and collision resources should remain object-owned. Only timer/frame/dirty numeric state and repeated lookup indirection are candidates for denser storage.

### Render and pass graph: ownership needs consolidation

`Flatland` owns public pass and lighting instances while the world also owns pass/effect entities and singleton registries (`packages/three-flatland/src/Flatland.ts:387-414,987-1207,1248-1460`). The systems correctly centralize ordered execution, shadow resources, and per-world light runtime contexts, but graph edits touch several representations. The current code has extensive atomic ownership tests; the next step is to make one graph record authoritative rather than adding another abstraction.

Resource-set cleanup is no longer part of that ambiguity: canonical sprite/tile/light removal updates Flatland and `LightingContext`, live material replacement is ref-counted, and `clear()` drains the coupled registries first-error-safe while preserving the internal `SpriteGroup`. R3F lighting cleanup is owner-checked so stale cleanup cannot clear a newer effect.

### Telemetry: conforms

`SystemSchedule` selects an uninstrumented production loop and adds spans only in development or explicit profile builds (`packages/three-flatland/src/ecs/SystemSchedule.ts:27-153`). `packages/three-flatland/src/debug/perf-track.ts:14-18,91-115` prevents ordinary production detail allocation. Subsystem telemetry must use these gates.

## Ranked migrations

### P0 — finish the private boundary

Remove the remaining `koota` peer dependency and `tsdown` external entry only after the deterministic renderer A/B gate is accepted. Production source already has no Koota import, and the new static contract keeps it that way. The cleanup must include a packed-consumer install/typecheck, emitted JavaScript and declaration scans, documentation install commands, and proof that minis using Koota independently are unchanged.

Exit condition: `three-flatland` installs and runs without Koota; no public declaration reaches `ecs/runtime`; representative bundles attribute the expected byte reduction.

### P0 — consolidate render/pass graph ownership

Define one private graph owner for ordered pass nodes and the active lighting node. Keep `PassEffect` and `LightEffect` as public handles, node functions and GPU resources as object traits, and order/enabled/dirty/lifecycle flags in numeric traits or graph-owned typed arrays. Replace overlapping `_passes`, per-pass object-trait scalars, and rebuilt result arrays with a persistent ordered projection updated only by atomic graph transactions.

The transaction must prebuild user node functions before publication, reject cross-Flatland ownership before mutation, preserve the old chain when a builder throws, and release GPU resources first-error-safe on removal or disposal. Profile the dirty rebuild separately from frame execution; do not optimize a structural edit by making the steady frame path more complex.

Exit condition: one authoritative graph, atomic add/remove/reorder/enable/lighting swap tests, nested-world lifecycle tests, zero allocation on clean frames, and identical TSL compiler output for the Three and React fixtures.

### P0 — frozen capacity plan: implementation complete

`expectedSprites` is now the ordinary constructor-only planning hint, while `maxBatchSize` remains an advanced ceiling with its existing property contract. React Three Fiber consumers pass a stable or memoized options object through `args`; changing the hint intentionally reconstructs the group instead of applying a mutable JSX property. Construction reserves active CPU index-addressed world and registry structures without pre-creating sprites, GPU batches or buffers, cold trait columns, or synthetic dense selector/event rows.

The capacity hint does not redefine `maxBatchSize`. That property keeps its existing Three.js and React Three Fiber behavior; any future change to how live batches respond to it is separate breaking work with its own paired fixtures and release documentation.

Completed gates include constructor and R3F `args` type coverage, direct JSX-property rejection, bounded growth tests, dispose/reuse coverage, and a deterministic renderer harness for under-estimate, exact-estimate, and over-estimate cases. Definitive timing capture remains a release-evidence operation against a frozen source tree rather than an implementation blocker.

### P1 — schedule dense animated-sprite playback

Split animation definitions from playback state. Keep `Animation`, `SpriteFrame`, spritesheet, callbacks, and event payloads object-owned. Store enrolled playback scalars in numeric traits and advance them in one world system over a persistent selector. Project a frame change through the existing `setFrame`/batch UV path. Standalone sprites continue to use `update(deltaMs)` with identical semantics.

Avoid one entity per animation frame and avoid copying shared definitions into each entity. The system needs a stable definition handle and must dispatch events without allocating closures or result arrays per sprite. Public controller methods remain the command surface and commit atomically to either staged or enrolled state.

Exit condition: behavioral parity for loop, ping-pong, speed, pause/resume, large delta, per-frame duration, events, sprite-sheet swap, detach/re-enroll, and clone; allocation and frame-time measurements at 1k, 16k, and 60k animated sprites.

### P1 — compact tile animation state

Retain chunk topology and GPU resources on `TileLayer`. Replace timer objects and string-keyed per-frame dirty lookup with stable numeric animation IDs, typed elapsed/frame arrays, and a reusable dense dirty-ID list. Map animation IDs to chunk/member projections once during chunk construction. Rebuild those tables only when topology changes.

This work should not force tile layers into the sprite ECS unless profiling proves shared scheduling is better. A layer-local SoA is still the same data-oriented standard and avoids exposing tile topology to unrelated selectors.

Exit condition: no steady allocation, exact multi-frame catch-up semantics, shared-timer behavior, chunk rebuild/disposal safety, in-place UV updates, and a large animated-tile benchmark showing a measurable win.

### P1 — split lighting context by ownership kind

Keep effect instances, renderer, camera, scene, materials, lights, stores, and shadow resources in object traits. Move frequently tested lifecycle flags and surface dimensions to a numeric companion only if measurement shows better access or clearer ownership. Do not mirror `Vector2` values into numeric fields unless one system is named as the sole synchronization owner.

The goal is smaller, clearer ownership—not numeric storage for its own sake. Preserve per-world runtime scratch, nested render safety, explicit terminal release, and resize ordering.

Exit condition: a field-by-field owner map, no mirrored authoritative values, nested-world and retained-world disposal proofs, and clean-frame allocation measurements.

### P2 — profile-driven hierarchy refinement

Keep the current hierarchy model unless profiles show ancestor comparison or per-sprite matrix snapshots dominate. If they do, investigate generation-stamped ancestor invalidation and pooled snapshot storage while retaining Three.js `Object3D` identity and root-relative batch projection. Do not add public transform flags.

Exit condition: identical transform/visibility behavior for direct roots, nested groups, reparenting, identity roots, sort swaps, and stale slot reuse, with a demonstrated frame-time improvement.

## Static and behavioral gates

Every migration extends the smallest relevant enforcement layer:

- Add frame-critical numeric files to `ecs/systems/hotPathContract.test.ts`; object reads require a named allowlist and a comment explaining the heavyweight owner.
- Keep `ecs/privateArchitectureContract.test.ts` green and extend it only for durable, source-verifiable invariants. Do not substitute source regexes for lifecycle tests.
- Add focused tests that inspect the real GPU row, uniform node, packed ownership table, or pass chain—not only the public getter.
- Build `three-flatland` and run `verify-public-declaration-boundary.mjs` after public type changes.
- Run type fixtures for Three constructor usage and R3F no-argument/property usage.
- Capture profile-only telemetry and deterministic renderer evidence after behavior is green; never use telemetry presence as correctness proof.

## PR shape

Keep the follow-ups independent:

1. Koota package/declaration cleanup.
2. Render/pass graph consolidation.
3. Frozen capacity plan.
4. Animated-sprite playback SoA.
5. Tile animation compaction.
6. Lighting-context split only if its measurement gate justifies a change.

Hierarchy work opens only from profile evidence. Each PR carries its own baseline, behavior tests, source gate, and rollback boundary. Combining these migrations would hide ownership mistakes behind a large diff and make performance attribution unreliable.
