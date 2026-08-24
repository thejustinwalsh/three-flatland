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

| ID | Feature | Status | Authoritative state | Evidence boundary |
| --- | --- | --- | --- | --- |
| ECS-001 | Renderer batching kernel | accepted | Private world traits plus batch-owned packed slot tables | PR #232; kernel, renderer, memory, size, package, example, and publication gates |
| ECS-002 | Construction-time capacity planning | accepted | World and registry capacity reserved from `expectedSprites` | PR #233; under/exact/over estimate, reuse, disposal, size, and R3F constructor gates |
| ECS-003 | Animated-sprite playback SoA | active | Enrolled playback scalars in typed traits; definitions remain object-owned | Behavioral parity plus allocation and frame-time measurements at 1k, 16k, and 60k sprites |
| ECS-004 | Render/pass graph consolidation | queued | One private graph owner with a persistent ordered projection | Atomic graph edits, clean-frame allocation, nested-world lifecycle, and identical TSL output |
| ECS-005 | Tile-animation compaction | queued | Layer-local typed timer/frame arrays and dense dirty-ID projection | Catch-up semantics, shared timers, chunk lifecycle, allocation, and large animated-tile timing |
| ECS-006 | Lighting-context numeric split | evidence-gated | No change unless a field-by-field owner audit and measurements justify numeric companions | Nested-world disposal, resize ordering, allocation, and access-cost evidence |
| ECS-007 | Hierarchy refinement | evidence-gated | Current object-owned tracker and batch-local matrix projection remain authoritative | Opens only when profiles show ancestor comparison or snapshot storage dominates frame time |

## ECS-003: Animated-sprite playback SoA

| Field | Record |
| --- | --- |
| Decision | Schedule enrolled animated sprites through one persistent private-world selector. |
| Numeric state | Elapsed time, current frame, speed, direction, play state, loop mode/count, and definition handle. |
| Object state | `Animation`, `SpriteFrame`, spritesheets, callbacks, event payload definitions, and standalone controller state. |
| Public boundary | Keep `AnimatedSprite2D` and its controller methods as the command surface. No entity, trait, store, selector, or runtime type becomes reachable from package declarations. |
| Projection | A committed frame transition uses the existing frame/UV update path so packed GPU rows remain the only render projection. |
| Compatibility | Standalone sprites continue to support explicit `update(deltaMs)`. Enroll, detach, clone, and spritesheet replacement preserve current semantics. |
| Performance hypothesis | Shared definitions plus one dense numeric schedule remove per-sprite controller traversal and repeated object-property access for large animated populations. |
| Required behavior | Loop, ping-pong, speed, pause/resume, large delta, per-frame duration, events, spritesheet swap, detach/re-enroll, cloning, disposal, and reentrant callbacks. |
| Required evidence | Warm allocation profile and trusted Labs comparison at 1k, 16k, and 60k animated sprites; deterministic GPU-row and event checks; package size and all-example gates. |
| Public attribution | Any guide or release note credits Koota's typed-trait and query model as the foundation that made this specialization possible. |
| Branch | `feat/animated-sprite-playback-soa` |
| Pull request | Pending |
| Result | Pending baseline and implementation. |

## ECS-004: Render/pass graph consolidation

| Field | Record |
| --- | --- |
| Decision | Replace overlapping pass arrays, entity scalars, and rebuilt ordered results with one private graph owner. |
| Object state | `PassEffect`, `LightEffect`, TSL node functions, materials, render targets, and other GPU resources. |
| Numeric state | Order, enabled, dirty, lifecycle, and stable graph membership only where repeated access benefits. |
| Public boundary | Existing Flatland pass and lighting methods remain the only control surface. |
| Required evidence | Atomic add/remove/reorder/enable/lighting replacement, first-error-safe cleanup, nested worlds, zero allocation on clean frames, and identical Three/React TSL output. |
| Status note | Queued behind ECS-003 because animation has the larger dense-population opportunity. |

## ECS-005 through ECS-007

The tile, lighting, and hierarchy entries remain at their indexed status until the preceding slice
lands. Their detailed records are added before implementation or measurement changes their status.
