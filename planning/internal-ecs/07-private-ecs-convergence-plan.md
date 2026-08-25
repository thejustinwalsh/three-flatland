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

### Pass effects conform; lighting ownership remains under audit

`LightEffect` and `PassEffect` use the same typed schema, generated numeric traits, cached stores, and stable TSL uniform projection (`packages/three-flatland/src/lights/LightEffect.ts`; `packages/three-flatland/src/pipeline/PassEffect.ts`). Their public field paths therefore follow the standard.

Pass topology now has one package-private `PostPassGraph` owner. `PassEffect` owns its enabled flag, order, and built TSL function; the graph owns membership, dirtiness, and reusable ordered/function projections; private ECS entities retain only declared numeric effect fields. The duplicated `PostPassTrait`, `PostPassRegistry`, and `postPassSystem` representations are gone. This also fixes the previous stale-enabled split, where the public effect flag changed without updating its duplicated topology trait.

Lighting still mixes object resources and lifecycle state inside `LightEffectTrait`, `ShadowPipeline`, and `LightingContext`. That boundary remains evidence-gated rather than being converted for symmetry.

### Animated sprites: public API is sound, execution state is object-local

`AnimatedSprite2D` keeps the expected Three/R3F surface and binds frame/event callbacks once (`packages/three-flatland/src/sprites/AnimatedSprite2D.ts:67-135,341-357`). Playback state lives in one `AnimationController` object per sprite and advances through explicit user calls. Definitions and frame objects should remain object-owned, but elapsed time, frame index, speed, direction, play state, and loop count are dense numeric state when thousands of sprites animate together.

The first enrolled numeric-SoA experiment is complete and rejected for direct controller updates: the
workload read and wrote a full playback row, then projected a frame to GPU state, so splitting that row
across numeric columns made the trusted 1k and 16k cases materially slower. That prototype also
contained a group scheduler, but its benchmark still called every sprite's `update(deltaMs)` and
therefore never measured the scheduler. Independent playback remains object-local. The corrected
experiment first freezes an object-backed `SpriteGroup.advanceAnimations(deltaMs)` baseline, then
measures any shared-definition/timeline candidate through that exact same entry point. A candidate
must remove repeated work rather than merely relocate it and must preserve standalone compatibility.

### Tilemaps: retained material ownership and batch-local GPU projection

`TileLayer` already owns chunk meshes, typed instance buffers, and effect buffers per chunk (`packages/three-flatland/src/tilemap/TileLayer.ts:27-117,326-579`). Tile changes project directly into the affected chunk row. Animated tile lookup and timers are Maps of small objects, and `update` scans animated positions (`TileLayer.ts:584-642`). The immediate scratch-allocation gap is fixed: changed GIDs and dirty chunk keys now reuse layer-owned sets.

Material configuration is now retained by `TileMap2D` rather than being applied only to the layer materials that existed at attach time. Effect/provider ownership is exclusive and truthful across R3F cleanup, data replacement, and chunk-size rebuilds. Every layer replacement is prepared before publication; a wider effect tier rebuilds each existing chunk projection before Flatland observes the new material set. Live sprite material changes and tile-layer replacement both enter Flatland through the same reference-counted material seam, so current globals, channels, and lighting follow the resource and retired shared materials leave only after their final owner. Three-style sprite/tilemap reparenting releases the previous Flatland first; simultaneous cross-Flatland sharing of one mutable material rejects atomically because one material cannot point at two global-uniform sets.

Chunk topology, tilesets, meshes, and collision resources should remain object-owned. Only timer/frame/dirty numeric state and repeated lookup indirection are candidates for denser storage.

### Render and pass graph: pass ownership consolidated

`Flatland` owns public pass and lighting instances. Pass topology now changes through one private graph transaction, while effect entities exist only for uniform numeric fields. The graph reuses its ordered projection across dirty rebuilds and returns immediately on clean frames. Atomic builder, capacity, cross-owner, enable, remove, clear, and disposal tests cover the ownership boundary.

Resource-set cleanup is no longer part of that ambiguity: canonical sprite/tile/light removal updates Flatland and `LightingContext`, live material replacement is ref-counted, and `clear()` drains the coupled registries first-error-safe while preserving the internal `SpriteGroup`. R3F lighting cleanup is owner-checked so stale cleanup cannot clear a newer effect.

### Telemetry: conforms

`SystemSchedule` selects an uninstrumented production loop and adds spans only in development or explicit profile builds (`packages/three-flatland/src/ecs/SystemSchedule.ts:27-153`). `packages/three-flatland/src/debug/perf-track.ts:14-18,91-115` prevents ordinary production detail allocation. Subsystem telemetry must use these gates.

## Ranked migrations

### P0 — private boundary and frozen-source attribution complete

`three-flatland` no longer declares Koota as a peer dependency or `tsdown` external. Install documentation and starter manifests no longer add it, and the packed-publication gate scans production source, emitted JavaScript, declarations, source maps, and the published manifest. Workspace minis and the ECS comparison harness keep their explicit Koota dependencies because they use it independently.

Commit `5f128a15` replaced the additive Koota estimate with a true-consumer A/B harness: identical fixtures are bundled against the current source and the pinned pre-migration source. The earlier accepted capture has an honestly mixed historical classification. Basic Three.js, basic React, and pass/lighting are larger by 21,567/4,816, 23,178/5,310, and 28,019/7,436 minified/gzip bytes respectively; Knightmark is smaller by 18,892/5,619. That comparison spans all reachable package-source changes and is report-only, not an isolated ECS savings gate. The isolated Koota bundle remains a dependency-attribution diagnostic.

The dependency, publication, declaration, combined-runtime-cap, and no-duplicate-runtime exit conditions are complete. Consumer growth is gated against reviewed per-fixture absolute minified/gzip/Brotli budgets; any one-byte increase fails while reductions pass without automatic ratcheting. The final frozen-source capture replaced the earlier budget and reproduced with zero-byte deltas. Release evidence retains the exact mixed historical result rather than inferring savings from the isolated Koota kernel.

### P0 — consolidate render/pass graph ownership: implementation complete

One private graph now owns ordered pass nodes. `PassEffect` remains the public handle and authoritative owner of its TSL function, order, and enabled state; declared uniform fields remain numeric private traits. The implementation replaces overlapping pass arrays, per-pass topology traits, the registry singleton, and rebuilt result arrays with a persistent projection updated only by graph transactions.

The transaction must prebuild user node functions before publication, reject cross-Flatland ownership before mutation, preserve the old chain when a builder throws, and release GPU resources first-error-safe on removal or disposal. Profile the dirty rebuild separately from frame execution; do not optimize a structural edit by making the steady frame path more complex.

Completed source gates include one authoritative graph; atomic builder/capacity/cross-owner rollback; add/remove/clear/enable/disposal behavior; reusable dirty projections and constant clean-frame checks; the full package suite; and the existing shader compiler coverage. Final package size and paired example gates remain part of the enclosing release stack rather than a reason to duplicate graph ownership.

### P0 — frozen capacity plan: implementation complete

`expectedSprites` is now the ordinary constructor-only planning hint, while `maxBatchSize` remains an advanced ceiling with its existing property contract. React Three Fiber consumers pass a stable or memoized options object through `args`; changing the hint intentionally reconstructs the group instead of applying a mutable JSX property. Construction reserves active CPU index-addressed world and registry structures without pre-creating sprites, GPU batches or buffers, cold trait columns, or synthetic dense selector/event rows.

The capacity hint does not redefine `maxBatchSize`. That property keeps its existing Three.js and React Three Fiber behavior; any future change to how live batches respond to it is separate breaking work with its own paired fixtures and release documentation.

Completed gates include constructor and R3F `args` type coverage, direct JSX-property rejection, bounded growth tests, dispose/reuse coverage, and the frozen-source under-estimate, exact-estimate, and over-estimate capture in [`results/expected-sprites.json`](./results/expected-sprites.json).

### P1 — coalesce shared animation-definition work: accepted

Keep `Animation`, `SpriteFrame`, spritesheet, callbacks, event payloads, and independent controller rows object-owned. The rejected blanket-SoA prototype proved that full-row playback does not benefit from columnar storage in this runtime. Test shared-definition or shared-timeline scheduling instead: compute a common transition once only when sprites deliberately share phase/speed/loop semantics, then project the committed frame through the existing `setFrame`/batch UV path. Standalone and independent sprites continue to use `update(deltaMs)` with identical semantics.

Avoid one entity per animation frame, avoid copying shared definitions into each entity, and do not add a bulk selector that merely calls every existing controller. A viable design must remove repeated computation or projection and must dispatch events without allocating closures or result arrays per sprite. Public controller methods remain the command surface and commit atomically.

The accepted design keeps controller state and animation definitions object-owned. A caller-timed
`SpriteGroup.advanceAnimations(deltaMs)` snapshots its topology-maintained animated membership into
pre-sized scratch, and a group-owned dense
binding projection associates exact packed entity generations with at most 32 reusable timeline
cohorts. A controller revision invalidates a binding after any direct playback command. Only standard,
callback-free, event-free, single-transition sprites reuse a cohort result; every other case retains
the existing controller update. The projection uses exact `Float64Array` handles so generations never
alias at 32-bit boundaries, releases its retained definitions on disposal, and performs no steady-state
allocation after capacity and cohort compilation.

Labs accepted the final dense-membership path at 1k (p50 -25.5%, p99 -37.9%, `p < .001`) and
16,384 (p50 -38.6%, p99 -24.5%, `p < .001`). The 60k run remained directionally faster but did not meet the configured
confidence target within 30 seconds, so it is recorded as noisy rather than promoted into a release
claim. Behavioral gates cover loop, speed divergence, callback and large-delta fallback, reentrancy,
removal during a frame snapshot, packed-entity slot reuse, disposal, and direct controller compatibility.

### P1 — compact tile animation state

Retain chunk topology and GPU resources on `TileLayer`. Replace timer objects and string-keyed per-frame dirty lookup with stable numeric animation IDs, typed elapsed/frame arrays, and a reusable dense dirty-ID list. Map animation IDs to chunk/member projections once during chunk construction. Rebuild those tables only when topology changes.

This work should not force tile layers into the sprite ECS unless profiling proves shared scheduling is better. A layer-local SoA is still the same data-oriented standard and avoids exposing tile topology to unrelated selectors.

Exit condition: no steady allocation, exact multi-frame catch-up semantics, shared-timer behavior, chunk rebuild/disposal safety, in-place UV updates, and a large animated-tile benchmark showing a measurable win.

### P1 — split lighting context by ownership kind

Keep effect instances, renderer, camera, scene, materials, lights, stores, and shadow resources in object traits. Move frequently tested lifecycle flags and surface dimensions to a numeric companion only if measurement shows better access or clearer ownership. Do not mirror `Vector2` values into numeric fields unless one system is named as the sole synchronization owner.

The goal is smaller, clearer ownership—not numeric storage for its own sake. Preserve per-world runtime scratch, nested render safety, explicit terminal release, and resize ordering.

Exit condition: a field-by-field owner map, no mirrored authoritative values, nested-world and retained-world disposal proofs, and clean-frame allocation measurements.

### P2 — profile-driven hierarchy refinement: active

The hierarchy profile has now opened this work. At 16,384 sprites, stable depth-three authored
hierarchy costs about 7.7 ms versus 5.8 ms for direct roots, while one moving shared root costs about
11.1 ms. The current candidate is deliberately narrower than a hierarchy ECS conversion: cache each
unique source-parent path's changed/visible projection once per frame while retaining Three.js
`Object3D` identity, sprite-local snapshots, and root-relative batch projection. Do not add public
transform flags or numeric copies of authored matrices.

Exit condition: identical transform/visibility behavior for direct roots, nested groups, reparenting, identity roots, sort swaps, and stale slot reuse, with a demonstrated frame-time improvement.

## Static and behavioral gates

Every migration extends the smallest relevant enforcement layer:

- Create or update the feature record in the [private ECS evolution ledger](./09-private-ecs-evolution-ledger.md) before implementation, then add the accepted commit, pull request, and evidence result before merge.
- Preserve the [Koota](https://github.com/pmndrs/koota) design attribution in every public explanation or release note about the private ECS. Describe the runtime as a Flatland-specific specialization, not as a replacement for Koota's application ECS.
- Add frame-critical numeric files to `ecs/systems/hotPathContract.test.ts`; object reads require a named allowlist and a comment explaining the heavyweight owner.
- Keep `ecs/privateArchitectureContract.test.ts` green and extend it only for durable, source-verifiable invariants. Do not substitute source regexes for lifecycle tests.
- Add focused tests that inspect the real GPU row, uniform node, packed ownership table, or pass chain—not only the public getter.
- Build `three-flatland` and run `verify-public-declaration-boundary.mjs` after public type changes.
- Run type fixtures for Three constructor usage and R3F no-argument/property usage.
- Capture profile-only telemetry and deterministic renderer evidence after behavior is green; never use telemetry presence as correctness proof.

## PR shape

Keep the follow-ups independent:

1. Koota package/declaration cleanup and definitive true-consumer attribution: complete.
2. Animation shared-definition/timeline experiment (blanket SoA rejected).
3. Frozen capacity plan.
4. Render/pass graph consolidation.
5. Tile animation compaction.
6. Lighting-context split only if its measurement gate justifies a change.

Hierarchy work opens only from profile evidence. Each PR carries its own baseline, behavior tests, source gate, and rollback boundary. Combining these migrations would hide ownership mistakes behind a large diff and make performance attribution unreliable.
