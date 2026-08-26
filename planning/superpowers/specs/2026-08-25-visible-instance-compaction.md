# Camera-visible instance compaction

Status: **rejected, closed**

Ledger: `ECS-008`

## Goal

Reduce instance uploads and submitted instances when a large sprite world is mostly outside the active
camera. Reduce CPU transform work only if a camera-correct visibility boundary can run before the ECS
schedule. Preserve the existing `Sprite2D`, `SpriteGroup`, `Flatland`, Three.js, and react-three-fiber
contracts.

This work does not assume that ECS membership alone solves culling. The current `SpriteBatch` uses an
infinite bounding sphere because material batches are spatially unbounded, and the private ECS schedule
does not receive a camera. The accepted design must establish a camera-correct render projection without
making camera state authoritative in the ECS.

## Koota lineage

[Koota](https://github.com/pmndrs/koota) made this design direction possible. Its typed traits, queries,
and structure-of-arrays model established the separation between authoritative object state and dense
iteration. Flatland applies that lesson to a renderer-owned workload; Koota remains the recommended
general-purpose ECS for application and gameplay state.

## Current boundary

- `Sprite2D` and the Three.js hierarchy own transforms, visibility, layers, hit-test behavior, and public
  identity.
- The private world projects renderer-facing state into batch slots.
- `SpriteSpatialGrid` already tracks world-space sprite bounds for batch-root picking.
- `SpriteBatch` sets an infinite bounding sphere and submits a contiguous prefix through `count`.
- `SpriteGroup.frustumCulling` exists, but no per-sprite camera-visible compaction currently changes the
  submitted prefix.
- `TileLayer` already splits maps into finite-bound `InstancedMesh` chunks and lets Three.js reject
  offscreen chunks. The large paged-world case therefore has a cheaper existing visibility boundary.
- Standalone `SpriteGroup` can be rendered through arbitrary Three.js cameras. `Flatland` additionally
  owns an orthographic camera, but the implementation cannot make that special case the general rule.

## Hypothesis

A sparse-world projection can win when no more than 20% of 16,384–60,000 sprites are visible. The same
projection can lose in dense scenes because visibility tests, row remapping, or spatial partitioning add
work that the current contiguous batch avoids.

Acceptance therefore requires a sparse-world win and a dense-world neutral result. A design that only
makes an artificial culling microbenchmark faster is rejected.

## Candidate projections

Evaluate these in order. Only one may become authoritative for rendered-row membership.

### A. Per-draw visible-row compaction

Use the camera passed to `SpriteBatch.onBeforeRender` to query the existing spatial grid and build a
reusable visible-row projection immediately before the draw. Canonical batch slots remain untouched;
visible rows copy into a separate grow-only render buffer and set the mesh count for that camera.

Advantages:

- exact for multiple cameras and nested render passes,
- no increase in material batch count,
- reuses the existing spatial index.

Risks:

- Three.js supplies the camera only after `SpriteGroup.updateMatrixWorld()` has already run the ECS
  schedule, so this candidate cannot skip the current frame's transform projection without a separate
  camera-aware pre-schedule boundary,
- copies every visible row when the camera or relevant source revision changes,
- requires a second packed GPU projection or a safe buffer swap,
- setter-side direct writes must keep canonical and currently published projections coherent.

### B. Spatially partitioned material batches

Extend the run key with a stable world-cell partition so Three.js can cull finite batch bounds. The
private ECS reassigns sprites when their cell changes.

Advantages:

- uses Three.js's ordinary camera culling,
- avoids row copies for static worlds.

Risks:

- increases draw calls and material/batch bookkeeping,
- moving sprites can churn between cells,
- transparent sort ordering must remain globally correct across partitions.

### C. GPU row indirection

Keep canonical rows in storage and upload only a dense list of visible source indices. The vertex path
reads instance data through that indirection.

Advantages:

- minimal CPU copying when visibility changes,
- preserves material batch topology.

Risks:

- depends on a stable Three.js/TSL path for indexed storage reads,
- changes shader composition and may increase every vertex's cost,
- must work for every effect-buffer tier and synth/tight geometry path.

Do not implement C unless A and B fail their acceptance gates and the required Three.js primitives are
available without private renderer patches.

## Benchmark plan

Add `tools/ecs-bench/benches/visible-instance-compaction.bench.ts` using pinned `@pmndrs/labs`.

Scenarios:

| Population | Camera occupancy | Motion                         | Purpose                                  |
| ---------- | ---------------- | ------------------------------ | ---------------------------------------- |
| 16,384     | 100%             | static and all-moving          | dense-regression guard                   |
| 16,384     | 20% / 5%         | static camera and panning      | ordinary sparse-world threshold          |
| 60,000     | 100%             | static                         | large dense-regression guard             |
| 60,000     | 20% / 5%         | static camera and 10% movement | large sparse world and incremental churn |

The Labs timed region includes the existing CPU schedule plus visibility resolution, compaction or
reassignment, dirty-range publication, and batch count updates. Setup, assertions, and fixture mutation
remain outside the timed yield. For candidate A, Labs is a CPU-cost guard rather than evidence of saved
GPU work: per-draw camera resolution occurs after the schedule. The headed WebGPU capture owns the
submission and frame-time verdict.

Every sample verifies:

- exact visible sprite identities and count,
- identical packed row values for every visible sprite,
- camera layers, hierarchy visibility, alpha, effects, flip, and sort order,
- picking-grid identity before and after compaction,
- no stale rows after removal, reparenting, material routing, or disposal.

Use saved clean baseline and candidate Labs results with full source, lock, fixture, and runner hashes.
Browser captures validate actual submitted-instance counts and visual parity for Three.js and
react-three-fiber; they do not replace the Labs CPU verdict.

## Acceptance gates

- At 5% and 20% occupancy, headed WebGPU p50 improves by at least 15% with `p < .05` and outside Labs'
  effective noise band at 16,384 and 60,000 populations. The submitted instance count must fall to the
  exact visible count.
- Candidate A's Labs CPU result may be neutral, because it cannot skip the already-completed transform
  schedule. Any repeatable CPU regression above 3% rejects it. No CPU transform-speed claim is allowed
  unless a separate camera-aware pre-schedule design proves multi-camera correctness.
- The 100%-visible cases remain neutral within the effective noise band. Any repeatable regression above
  3% rejects the candidate.
- Steady static frames allocate nothing after warm-up.
- Camera-only motion does not mutate authoritative sprite transforms or picking ownership.
- Multiple cameras in one renderer frame produce independent correct projections.
- Submitted instances equal the visible set; the feature must reduce actual render work rather than only
  skip CPU bookkeeping.
- Full package, declaration, size, changeset, paired-example, and live WebGPU gates remain green.

## Compatibility and lifecycle matrix

Cover standalone `SpriteGroup`, `Flatland`, automatic orchestration, Three.js and react-three-fiber,
orthographic and perspective cameras, camera layers, hierarchy clipping, transparent sorting, shadow
passes, hit-test proxying, material/effect tier changes, add/remove/reparent, cross-world transfer,
multiple renders per frame, render-target passes, cloning, and terminal disposal.

User-extensible callbacks may dispose or reparent a sprite, group, batch, camera, or material during
projection. Preparation must remain two-phase: validate and build against a lifecycle revision, then
publish through a no-throw commit or roll back without exposing partial row membership.

## Public and size boundary

No entity, selector, camera-query, typed storage, remap buffer, or culling revision becomes public.
`SpriteGroup.frustumCulling` remains the existing opt-in/out surface unless evidence proves that a new
public control is required. Any public change requires a separate alpha API review and migration note.

The accepted consumer-size snapshot may move only after clean capture and review. The shipped-runtime
aggregate must remain below its existing minified/gzip/Brotli caps.

## Evidence checkpoint: candidate A rejected

Benchmark-only commit `0cd3b3d0` tested the existing picking grid as the visible-set source and copied
the canonical 16-float matrix row plus 16-float packed row into reusable projection buffers. A clean
adaptive run rejected that design:

- 16,384 p50 changed 6.5345 → 9.2959 ms dense, 7.3172 → 8.6357 ms at 20%, and
  7.2535 → 7.4560 ms at 5%;
- 60,000 p50 changed 28.9239 → 38.8529 ms dense, 26.1944 → 29.1774 ms at 20%, and
  26.1114 → 27.8208 ms at 5%;
- average measured heap rose in every projection case, including roughly 177 KB → 918–982 KB for the
  sparse 60,000-sprite cases.

The host clock drifted 8.4%, so these paired absolute timings are not promoted as a percentage speed
claim. The candidate is rejected independently by the deterministic steady-allocation failure and the
large dense regression. `SpriteSpatialGrid.querySegment()` is deliberately optimized for pointer-event
broadphase work; it is not a per-frame camera-membership projection.

Candidate B, spatially partitioned material batches, is next. It must be benchmarked first with a draw-
call budget and transparent-sort parity; candidate A does not become dormant production complexity.

Candidate B was rejected during that parity review, before production code. Transparent materials are
sorted by `zIndex` within one physical batch. Splitting a material run into spatial cells creates
separate draw calls with only one object-level `renderOrder` each; arbitrary sprite depths from two cells
cannot interleave exactly. Sorting cells by min/max depth cannot resolve overlapping depth ranges. This
would trade culling for incorrect alpha composition, so the candidate fails the compatibility gate.

Benchmark-only candidate C (`b520c534`) writes only visible source slots into a reusable `Uint32Array`,
using the validated private `Sprite2D._batchSlot` rather than copying instance rows. Clean result
`visible-index-prototype` measured p50 changes of +20.8%/+12.9%/+2.8% at 16,384 dense/20%/5%, and
+13.7%/+6.2%/+5.4% at 60,000. Clock drift was 8.3%, so these are descriptive paired values, not a
speed verdict. The sparse 60,000 cases establish a 1.54–1.74 ms CPU preparation budget that a headed
GPU win must repay. Measured heap also rose, so the current picking query is not acceptable production
code.

Three r185 exposes the public TSL primitives needed for GPU indirection, but candidate C already fails
the experiment's CPU and allocation preconditions. It regresses the dense cases, adds 1.54–1.74 ms of
sparse preparation at 60,000 sprites, and retains more measured heap. A headed GPU proof cannot authorize
a production path whose required preparation and dense fallback are not yet viable, so the prototype is
removed by `ad861d73` without runtime residue.

The existing tilemap path covers the clearest large-world case through finite chunk bounds and ordinary
Three.js frustum rejection. A future proposal may reopen per-sprite compaction only with a new workload or
camera-to-slot primitive that first proves allocation-free preparation and a neutral dense path.

## Execution order

1. Freeze the current infinite-bound behavior as a baseline fixture.
2. Prototype candidate A in the benchmark and remove it when it fails the CPU/allocation gate.
3. Run deterministic behavior, allocation, and Labs gates.
4. Reject candidate B if transparent-sort parity cannot be expressed across partitions.
5. Reject candidate C after its CPU/allocation preparation gate fails; remove the prototype.
6. Freeze the existing SpriteBatch behavior and the TileLayer chunk-culling regression.
7. Record the rejected result in `ECS-008` with raw evidence and exact commits.

## Stop conditions

Reject the feature if dense scenes regress, multiple-camera correctness requires a public camera owner,
row compaction duplicates too much GPU storage, or the measured gain comes only from skipping assertions
or uploads outside the timed region.
