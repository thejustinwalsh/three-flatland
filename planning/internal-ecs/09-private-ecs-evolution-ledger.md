# Private ECS evolution ledger

Status: **active reference**

Date opened: 2026-08-24

This ledger records every feature added to the private renderer ECS. The
[architecture standard](./06-private-ecs-architecture-standard.md) defines the invariants, and the
[convergence plan](./07-private-ecs-convergence-plan.md) defines sequencing. This page records what
changed, why it belongs in data-oriented storage, and which evidence accepted it.

## Logging contract

Create or update an entry before feature implementation begins. Each entry records:

- the authoritative owner and data layout,
- the object-owned resources that remain outside numeric storage,
- the public API and declaration-boundary effect,
- the measured performance or ownership hypothesis,
- the required behavioral, allocation, size, and application evidence,
- the final commit, pull request, and accepted result.

Any public documentation produced by an entry must credit
[Koota](https://github.com/pmndrs/koota) as the design foundation for Flatland's private renderer ECS.
The wording must preserve Koota's continuing role as a general-purpose application ECS and must not
frame the internal specialization as an upstream replacement.

Statuses are `active`, `queued`, `evidence-gated`, `accepted`, or `rejected`. A rejected experiment
stays in the ledger with its evidence so the same design is not repeated without new information.

## Feature index

| ID      | Feature                             | Status         | Authoritative state                                                                       | Evidence boundary                                                                              |
| ------- | ----------------------------------- | -------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ECS-001 | Renderer batching kernel            | accepted       | Private world traits plus batch-owned packed slot tables                                  | PR #232; kernel, renderer, memory, size, package, example, and publication gates               |
| ECS-002 | Construction-time capacity planning | accepted       | World and registry capacity reserved from `expectedSprites`                               | PR #233; under/exact/over estimate, reuse, disposal, size, and R3F constructor gates           |
| ECS-003 | Animation playback convergence      | active         | Object-local independent playback retained; shared-definition scheduling under evidence   | Behavioral parity plus allocation and frame-time measurements at 1k, 16k, and 60k sprites      |
| ECS-004 | Render/pass graph consolidation     | active         | One private graph owner with a persistent ordered projection                              | Atomic graph edits, clean-frame allocation, nested-world lifecycle, and identical TSL output   |
| ECS-005 | Tile-animation compaction           | queued         | Layer-local typed timer/frame arrays and dense dirty-ID projection                        | Catch-up semantics, shared timers, chunk lifecycle, allocation, and large animated-tile timing |
| ECS-006 | Lighting-context numeric split      | evidence-gated | No change unless a field-by-field owner audit and measurements justify numeric companions | Nested-world disposal, resize ordering, allocation, and access-cost evidence                   |
| ECS-007 | Hierarchy refinement                | evidence-gated | Current object-owned tracker and batch-local matrix projection remain authoritative       | Opens only when profiles show ancestor comparison or snapshot storage dominates frame time     |

## ECS-003: Animation playback convergence

| Field                  | Record                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision               | Reject a blanket enrolled-playback SoA conversion. Retain object-local state for independent controllers and test definition-grouped/shared-timeline scheduling separately.                                                                                                                                                                                                                     |
| Numeric state          | Independent elapsed time, current frame, speed, direction, play state, and loop count remain controller-local unless a later shared-timeline design proves a real repeated-work reduction.                                                                                                                                                                                                      |
| Object state           | `Animation`, `SpriteFrame`, spritesheets, callbacks, event payload definitions, and standalone controller state.                                                                                                                                                                                                                                                                                |
| Public boundary        | Keep `AnimatedSprite2D` and its controller methods as the command surface. No entity, trait, store, selector, or runtime type becomes reachable from package declarations.                                                                                                                                                                                                                      |
| Projection             | A committed frame transition uses the existing frame/UV update path so packed GPU rows remain the only render projection.                                                                                                                                                                                                                                                                       |
| Compatibility          | Standalone sprites continue to support explicit `update(deltaMs)`. Enroll, detach, clone, and spritesheet replacement preserve current semantics.                                                                                                                                                                                                                                               |
| Performance hypothesis | The remaining opportunity is computing shared definition/timeline transitions once and coalescing identical projection work. Merely moving full-row controller state into columnar storage is hostile to this access pattern.                                                                                                                                                                   |
| Required behavior      | Loop, ping-pong, speed, pause/resume, large delta, per-frame duration, events, spritesheet swap, detach/re-enroll, cloning, disposal, and reentrant callbacks.                                                                                                                                                                                                                                  |
| Required evidence      | Warm allocation profile and trusted Labs comparison at 1k, 16k, and 60k animated sprites; deterministic GPU-row and event checks; package size and all-example gates.                                                                                                                                                                                                                           |
| Public attribution     | Any guide or release note credits Koota's typed-trait and query model as the foundation that made this specialization possible.                                                                                                                                                                                                                                                                 |
| Branch                 | `feat/animated-sprite-playback-soa`                                                                                                                                                                                                                                                                                                                                                             |
| Pull request           | Pending                                                                                                                                                                                                                                                                                                                                                                                         |
| Baseline               | Frozen enrolled-playback fixture commit `6ad4618b`; clean object-state p50: 1k 0.140 ms, 16,384 4.62 ms, 60k 20.17 ms average. The saved baseline reported 9.4% clock drift, so only the paired Labs verdict—not raw movement—was used.                                                                                                                                                         |
| Rejected experiment    | Commit `9c086a86` moved nine playback scalars into enrolled numeric SoA and added a persistent-selector bulk pass. Labs classified it slower at 1k (+39.8% p50, `p < .001`) and 16,384 (+64.5%, `p < .001`); 60k was directionally +56% but skipped as noisy. The implementation was removed. Raw ignored results are `animation-enrolled-object-state` and `animation-enrolled-soa-prototype`. |
| Result                 | Active: benchmark shared-definition/timeline scheduling without regressing independent `update(deltaMs)` or duplicating GPU-row writes.                                                                                                                                                                                                                                                         |

## ECS-004: Render/pass graph consolidation

| Field                  | Record                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision               | Replace overlapping pass arrays, entity scalars, and rebuilt ordered results with one private graph owner.                                                                                                                                                                         |
| Authoritative owner    | A package-private `PostPassGraph` owns insertion membership, insertion order, the dirty revision, and reusable ordered/function projections. `PassEffect` remains authoritative for its enabled state, order, and built TSL function.                                              |
| Object state           | `PassEffect`, `LightEffect`, TSL node functions, materials, render targets, and other GPU resources remain object-owned. Pass membership is object topology, not a numeric ECS query.                                                                                              |
| Numeric state          | Only declared numeric effect fields remain in private trait storage. The previous ECS pass topology trait and registry singleton are removed because they duplicated object state and rebuilt temporary arrays.                                                                    |
| Public boundary        | Existing `Flatland.addPass`, `removePass`, `clearPasses`, `passes`, and `PassEffect.enabled` remain the only control surface. No graph, entity, trait, selector, or store type becomes reachable from package declarations.                                                        |
| Performance hypothesis | Reusing one ordered projection removes query/view/result allocations from dirty rebuilds and makes clean frames a constant dirty check. The change is accepted only if it preserves output and does not increase shipped-runtime or consumer budgets beyond reviewed limits.       |
| Correctness finding    | The previous `PassEffect.enabled` setter dirtied the registry but did not update its duplicated `PostPassTrait.enabled` value, so the rebuilt chain could retain the stale enabled state. Reading the effect's authoritative state during projection removes that split-brain bug. |
| Required evidence      | Atomic add/remove/reorder/enable/lighting replacement, first-error-safe cleanup, nested worlds, zero allocation on clean frames, and identical Three/React TSL output.                                                                                                             |
| Public attribution     | Any public guide or release note credits [Koota](https://github.com/pmndrs/koota)'s typed-trait/query design as the foundation that made Flatland's private specialization possible, while continuing to recommend Koota for general-purpose application ECS work.                 |
| Status note            | Active after the blanket animation SoA experiment was rejected. Implementation must keep pass graph topology object-owned and use private numeric storage only for declared effect fields.                                                                                         |

## ECS-005 through ECS-007

The tile, lighting, and hierarchy entries remain at their indexed status until the preceding slice
lands. Their detailed records are added before implementation or measurement changes their status.
