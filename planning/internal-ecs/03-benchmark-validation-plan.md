# Internal ECS benchmark and validation plan

Status: kernel, package, final Node, consumer, and headed browser evidence accepted

Date: 2026-08-24

## Principle

Removing a dependency is not a performance result. The new runtime ships only if it is smaller, behaviorally equivalent, and at least as fast in the actual renderer schedule. Synthetic operation wins are supporting evidence, not the decision.

## Baseline capture

Capture baselines from the exact merge base used for implementation and record:

- commit SHA,
- Node, browser, OS, and architecture,
- Three.js and R3F versions,
- warm-up policy,
- sample count,
- median, p95, and dispersion,
- raw observations, not only summarized numbers.

The merge-base size baseline is:

| Metric                          |       Koota 0.6.5 |
| ------------------------------- | ----------------: |
| Seven-import tree-shaken kernel | 34,910 B minified |
| Gzip                            |          10,584 B |
| Brotli                          |           9,362 B |

These numbers remained unchanged when the kernel and production artifacts were recaptured from
merge base `bd19dd50` with esbuild 0.28.1. Raw results are in
[`results/kernel-size.json`](./results/kernel-size.json).

## Kernel microbenchmarks

Every candidate runs through the same adapter and fixture generator. Koota is the reference column.

### Entity lifecycle

At 1,000, 16,384, and 60,000 entities:

- spawn with the nine base sprite traits,
- destroy in insertion order,
- destroy in randomized order,
- recycle all IDs through a second spawn pass,
- stale-handle rejection,
- dispose a world containing object-backed traits.

### Direct SoA access

- read and write UV/color/flip/layer/z-index fields by eid,
- emit tracked routing notifications with direct store writes plus `touch`, never generic `patch`,
- repeat with all fields hot,
- repeat with randomized eids,
- verify zero allocations after warm-up.

### Stable queries

- singleton registry selector,
- `IsBatched + BatchSlot`,
- `IsRenderable + IsBatched + BatchSlot`,
- dynamic effect trait plus base sprite trait,
- 0%, 10%, 50%, and 100% match density,
- unchanged repeated view for 1,000 schedule iterations.

### Structural changes

- add/remove a tag across 12,000 entities,
- add/remove one dynamic effect trait across 12,000 entities,
- alternate entity compositions to stress selector maintenance,
- structural mutation followed by immediate view.

### Event tracking

- added `IsRenderable` for 1,000 and 12,000 sprites,
- removed `IsRenderable` for the same sizes,
- change one routing trait for 12,000 sprites,
- change all three routing traits before one drain and confirm one output per sprite,
- repeated writes to the same trait before drain,
- tracked versus untracked patches,
- independent consumers observing the same trait,
- add/remove before drain.

### Assignment lookup

Compare the current relation + slot path against direct `BatchSlot.batchEntity` access for:

- initial assignment,
- reassignment,
- removal,
- sort swap slot repair,
- recycled batch entity handles.

## End-to-end renderer benchmarks

### Node/Vitest schedule harness

Use the established 16,384-sprite schedule workload and add a 60,000-sprite scale point where memory permits.

The source-level harness is implemented in `tools/ecs-bench/src/renderer-evidence.ts` and is wired as
`@three-flatland/ecs-bench:benchmark:renderer`. `--quick` runs a smoke-sized version of all cases for
tool validation. The accepted final capture in `results/renderer-production.json` covers all eight
cases at both 16,384 and 60,000 sprites, including three GC-controlled lifecycle cycles per case.
The generator preserves `measured-unreviewed` in the raw report because it cannot approve itself;
this plan and the decision record provide the independent review and acceptance boundary.

Production Node timing uses the pinned `@pmndrs/labs` fixture summarized in
[`results/renderer-labs-summary.md`](./results/renderer-labs-summary.md). The source-level renderer
harness remains authoritative for topology, ownership, memory/GC, and per-system attribution, but
its instrumented wall-time medians are diagnostic rather than the timing verdict.

Canonical non-quick cases use the production `SpriteGroup` tier ladder with no fixed-capacity
override. A 16,384-sprite one-material bulk enrollment must initially commit one batch; 60,000 must
commit four. Mixed and multi-world cases assert the sum of their independently enrolled runs. Quick
mode alone uses tiny fixed capacities to cross several batch boundaries at 64 sprites, and that
artificial topology is smoke-only. No forced-4,096 performance result is part of the canonical matrix.

Cases:

1. Static sprites, one material, one batch run.
2. All sprites moving, alpha-test/depth path.
3. All sprites moving, transparent CPU-sort path.
4. 12,000 routing changes per frame.
5. Add/remove churn: 10% of sprites per frame.
6. Dynamic effect add/remove churn.
7. Mixed scene: static tile-like sprites plus animated/sorted sprites.
8. Multiple SpriteGroups/worlds to catch global-state coupling.

Record total schedule time and per-system timing already exposed by `SystemSchedule` instrumentation.
For transform and sort passes, also record batch-buffer transitions and prove the migrated path
finishes one batch before advancing to the next. Transform traverses packed active members with
stable sprite/SoA order across sorts and one physical-slot indirection; sort traverses occupied
physical rows. Interleaved material enrollment must not reintroduce world-order buffer hopping.
Churn fixtures must leave holes, recycle entity indices, reuse physical slots, and sort-swap occupied
rows; every surviving packed handle, direct sprite reference, `BatchSlot`, and GPU row must still
identify the same owner.

The harness uses the production schedule's existing User Timing spans and a process-local wrapper of
existing batch-buffer calls; production instrumentation is unchanged. The wrapper is active for one
separate, untimed topology-validation frame per case. Its transitions are summarized in the report, its queue
is cleared, and every wrapper is restored before GC, warm-up, timing, or retained-heap sampling.
The report records the compressed topology summary and validates ownership after every measured
frame. With `--expose-gc`, every case first runs dedicated create/dispose contexts before allocating
topology summaries or timing samples. User Timing entries are cleared before every before-create,
active, create-peak, and after-dispose heap boundary across three complete cycles. Each post-dispose
sample occurs after an event-loop turn and two forced collections. Non-quick runs reject a dirty source tree. Node schedule
totals remain instrumented diagnostics—not ordinary-production merge timing—because User Timing is
active. The temporary buffer probe is not active during a timed or memory sample.
Reports hash the harness, lockfile, and exact production sources used by the schedule so later code
cannot inherit earlier timing claims.

### Live WebGPU probes

The deterministic browser harness is `tools/ecs-bench/src/browser-benchmark.ts`. It loads built
production examples in a system Chromium browser at 1280×720 and DPR 1, starts a fresh browser for
every observation, waits for an explicit fixture-readiness payload, warms for 180 frames, and samples
600 `requestAnimationFrame` callback intervals. Base/head observations run in interleaved A/B, B/A,
A/B order. RAF cadence is a browser CPU/main-thread signal; it does not prove GPU completion or that
each callback produced a displayed frame.

Benchmark-mode fixtures render and finish batching at simulation frame zero, then remain paused until
the harness releases an explicit start gate immediately before warmup. Readiness must report that
zero-frame state. The harness records and validates simulation advancement across warmup and the
sample window, and pauses simulation at both in-page boundaries while CDP heap telemetry is read, so
asynchronous page startup or protocol latency cannot move base and head to different seeded states.

Canonical fixture URLs are:

- Knightmark: `?bench=1&sprites=N&seed=12648430&collisions=0|1&fixedDelta=16.6667`
- Lighting: `?bench=1&slimes=N&lights=M&seed=12648430&fixedDelta=16.6667`

The harness rejects served build revision, applied seed, fixed-timestep, requested/actual sprite,
light, committed batch-count, simulation-gate, and Knightmark collision-mode mismatches. Every target
label carries a full 40-character Git SHA. Evidence builds require a clean source tree and
`FL_BENCHMARK_EVIDENCE=true`; the build derives and embeds `git rev-parse HEAD`, requires
`FL_DEVTOOLS=false`, and records the applied devtools/profile flags. The harness rejects a
devtools-enabled build or a profile flag that differs from the requested capture mode.
`VITE_FLATLAND_BENCHMARK_REVISION` is an optional equality assertion, not an override. The base build
applies the exact fixture-only evidence patch from head so only the implementation under test differs.
Knightmark must report both collision-disabled ECS isolation and collision-enabled representative
behavior. Lighting controls actual light creation independently so 40,000 slimes need not create
40,000 lights. React readiness is published only after its first completed batching and render pass.
Readiness also reports `renderer.backend.device.adapterInfo` from the initialized WebGPU renderer.
The harness rejects missing or redacted identities and requires exact normalized adapter parity
across controls and observations; a separate post-hoc adapter request is not accepted as renderer
provenance.

The base worktree records the exact fixture-only patch commit applied from head. Every evidence build
also hashes the two shared benchmark sources and every Git-tracked file in the selected example
directory. The harness rejects a base/head fixture-source SHA-256 mismatch after the control pass and
before measured samples, then records the common parity hash in the report. This separates fixture
identity from cumulative implementation history: target revisions may differ while fixture bytes do
not.

Reports distinguish workspace catalog specifiers from exact lockfile resolutions for Three.js and
react-three-fiber, and include the SHA-256 of `pnpm-lock.yaml`. Simulation advancement must match both
the requested warmup callbacks and the sampled callbacks within one frame.
In-progress reports are written outside both source worktrees so repeated captures preserve the
harness clean-tree invariant. Copy the finalized matrix into `planning/internal-ecs/results/` only as
one evidence update after every capture passes.

The four Knightmark and lighting projects depend on the parent `examples` Nx project. Its production
inputs include the shared benchmark sources, so edits to either source invalidate each fixture's
`build`, `typecheck`, and `lint` target and mark all four projects affected.

Run both Three.js and React variants for:

- Knightmark or the current sprite swarm stress example,
- batch demo,
- tilemap,
- pass effects,
- 2D lighting,
- hit test/activity visibility paths.

For each:

- capture console errors and warnings,
- capture a deterministic screenshot where applicable,
- compare frame timing over a fixed sample window,
- exercise add/remove, material change, sort layer change, visibility/activity, and scene reparenting,
- verify no stale batch rows or picking proxies remain after churn.

GPU time is expected to be unchanged; CPU schedule, garbage collection, and bundle transfer are the affected axes.

Use two build modes. Ordinary production is the merge gate and contains no timing-marker overhead.
Production-profile defines `FL_PROFILE` and emits `ecs:run` plus per-system User Timing spans for
diagnosis. Never compare an instrumented head against an uninstrumented base. The harness verifies
`--profile=1` captures contain `ecs:run` and every expected renderer-system span at approximately one
marker per sampled render frame, and records each system median and p95. `--profile=0` captures reject
ECS markers so an instrumented build cannot be recorded as ordinary production evidence.

Presented-frame reports name FPS slow-tail data as p05; interval and system-duration tails remain
p95. Every raw report records the OS release, architecture, CPU, WebGPU adapter, Node, Chromium,
Three.js, React Three Fiber, viewport, and device pixel ratio.

The Knightmark sweep is 1k, 5k, 10k, 15k, 20k, 25k, 30k, 35k, 40k, 50k, and 60k sprites, followed by
1k refinement around the first failing band. The 60 Hz RAF-cadence crossover is the largest load
with at most 5% late callbacks against an explicit 16.667 ms callback budget. An interval above
25.0005 ms counts as late; the low-load control is diagnostic and does not redefine the budget.
Always report the 40,000-sprite result. The separate diagnostic ECS crossover is the largest load
whose profile-build `ecs:run` p95 remains at or below 16.667 ms.

## Memory and allocation checks

Measure after warm-up:

- allocations per steady-state schedule run,
- retained heap after create/destroy cycles,
- world disposal with object-backed traits,
- peak heap at 60,000 entities,
- selector/store memory by trait and query count.

Required behavior:

- zero new entity/query result arrays per steady-state frame,
- zero runtime-created patch/enumeration arrays in direct-store-plus-`touch` frame paths,
- event queues and scratch sets are reused,
- destroyed entities release object-backed values,
- repeated world create/dispose returns to a stable retained-heap band,
- no global world list or built-in prototype mutation.

The browser report records Chromium `JSHeapUsedSize` after warmup and after the sampled frame window,
without forcing garbage collection. This catches gross browser-heap drift but does not satisfy the
retained-heap, create/destroy, or 60,000-entity peak requirements above. The dedicated Node protocol's
reviewed production report covers both 16,384 and 60,000 sprites across three clean create/dispose
cycles per case. Smoke output does not satisfy the memory gate.

## Bundle checks

### Kernel-only

Bundle the exact internal exports retained by `three-flatland` with minification and tree shaking.

Reject if greater than:

- 12,000 bytes minified,
- 4,000 bytes gzip,
- 3,800 bytes Brotli.

### Representative consumers

The deterministic harness in `tools/ecs-bench/src/consumer-bundle-evidence.ts` bundles:

- one basic Three.js example,
- one basic React example,
- Knightmark/batch stress,
- a pass/lighting example that creates dynamic traits.

For each fixture, the harness bundles identical consumer source against the current package source
and the direct parent of the commit that migrated production batching from Koota
(`58bf83781dfc4c854f6c2dca09e57024a012815a`). Both sides use the current locked Three.js, React,
React Three Fiber, workspace dependencies, esbuild, compression, and minifier settings. The
historical graph must include Koota and omit the private runtime; the current graph must prove the
reverse. This measures the net package-source change instead of adding Koota to the current runtime.

The harness also rebuilds the isolated seven-export Koota entry and requires the exact recorded
34,910 B minified / 10,584 B gzip / 9,362 B Brotli result. That number is a diagnostic for dependency
attribution only and is never added to either representative consumer graph.

Required structural result:

- Koota absent from the published `three-flatland` production dependency graph and emitted
  artifacts,
- the combined shipped private runtime and optional capacity module remains within 12,000 B
  minified / 4,000 B gzip / 3,800 B Brotli,
- no compensating duplicate runtime chunk.

The pinned pre-migration A/B remains an exact report-only comparison and is classified as
`all-smaller`, `all-larger`, `unchanged`, or `mixed`. It spans unrelated reachable package changes,
so it is not an ECS savings gate. Metafile attribution keeps dependency removal distinct from that
whole-consumer result. Workspace minis and other packages that intentionally use Koota are reported
separately; they do not fail this package-scoped removal gate.

After source freeze, each current fixture is gated against a reviewed versioned artifact at
`planning/internal-ecs/results/consumer-bundle-budget.json`. The artifact keys absolute
minified/gzip/Brotli maxima by fixture ID and source hash and records revision, production source,
lockfile, and tool provenance. Any one-byte increase fails. Reductions pass without silently
lowering the checked-in maximum; changing the accepted budget requires a new clean capture and
review. Missing or extra fixtures and fixture/hash mismatch fail.

Every run writes minified bundles, raw esbuild metafiles, exact minified/gzip/Brotli attribution,
both full Git revisions, resolved tool versions, and source/fixture/harness/baseline/lockfile hashes
outside the source tree. A definitive run requires a clean tree and a current `three-flatland`
package build; `--allow-dirty` always produces only a `smoke-dirty` report, even if the tree happens
to be clean. Every run writes a candidate accepted-current budget outside the repository. Dirty
candidates are ineligible. With no accepted artifact, the first definitive run preserves all
artifacts and then fails `pending`; review copies the inspected clean candidate into the versioned
path, commits that reviewed artifact, and a second clean run verifies it. The deterministic test
suite exercises all four fixtures and the attribution, provenance, exact-budget, and output
safeguards. The previously accepted budget records the earlier source snapshot. The final
frozen-source run replaced it with a reviewed clean candidate and a second clean capture reproduced
zero-byte deltas across all four fixtures. Subsequent budget changes must repeat the same
capture-review-commit-recapture sequence.

## Behavioral reference tests

Build a small runtime adapter used by the same scenario suite for Koota and the candidate runtime. Compare snapshots after every step.

Required scenarios:

- default and partial trait initialization,
- factory isolation between entities/worlds,
- tag add/remove/has,
- numeric patch and direct-store visibility,
- tracked and untracked patches,
- ordinary selector membership,
- independent added/changed/removed consumers,
- deduplication before drain,
- removal event with remaining trait reads,
- entity destruction and index reuse,
- world disposal,
- dynamic effect trait creation,
- replacement for exclusive `InBatch` semantics.

The goal is Flatland equivalence, not every Koota edge case. Any difference must be explicitly classified as:

- required and fixed,
- unused and deliberately omitted,
- an existing Koota-dependent bug revealed by the comparison.

## Type tests

Compile-time assertions cover:

- inferred numeric trait value and patch types,
- inferred store field names and numeric arrays,
- inferred factory trait object type,
- tag behavior,
- initializer partials,
- selector entity type,
- rejecting fields from the wrong trait,
- rejecting nested numeric schema values,
- preventing internal runtime exports from package entrypoints.

Run strict consumer declaration checks after the package build to prove Koota types do not leak into emitted `.d.ts` files.

## Acceptance thresholds

### Hard rejection gates

- Any user-visible rendering, picking, event, visibility, or lifecycle regression.
- Any Koota runtime/type reference in published `three-flatland` output.
- Kernel above the bundle caps.
- Any accepted-current representative consumer exceeding its fixture-specific minified, gzip, or
  Brotli maximum by one byte or more, any fixture/hash mismatch, or malformed accepted provenance.
- Steady-state schedule median more than 3% slower in any principal workload under the paired-run
  policy below.
- Schedule p95 more than 5% slower under the paired-run policy below.
- New steady-state per-frame allocations.
- Fixed entity capacity without an explicit supported growth strategy.

### Performance win target

At least one of the following should be demonstrated in addition to “no regression”:

- 10% lower median schedule time in a structural/event-heavy workload,
- 25% faster 12,000-entity routing change processing,
- 25% faster full create/destroy cycle,
- materially lower retained heap at 60,000 entities.

If none is achieved, the change must be reconsidered even if it passes the size gate. Owning a runtime has maintenance cost; bytes alone are not sufficient proof.

## CI policy

Deterministic gates belong in normal CI:

- unit and differential behavior,
- type tests,
- built declaration scan,
- kernel and representative bundle-size budgets,
- allocation counters where deterministic.

Wall-clock benchmarks run in a dedicated advisory lane and produce a base-versus-head artifact. The
lane is not a required status check because a single noisy process must not block merging. The
paired-run policy below produces the decision: a confirmed regression is a blocking approval
failure even though the raw benchmark job itself is advisory.

The lane uses a pinned Node version on one documented runner image and architecture. Each report
runs base and head with the same fixture seed, warm-up count, sample count, and three fresh process
executions on the same runner class. It records every observation, each process summary, and the
aggregate median and p95; comparisons use the aggregate base and head values from that paired run.

If either threshold is crossed, CI repeats the complete paired run twice on fresh runners. The PR is
rejected when the same workload and statistic exceeds its limit in at least two of the three paired
runs. One breach out of three is classified as noisy and retained in the PR evidence, not silently
discarded. A code or fixture change invalidates the series and restarts it from the new head.

## Required PR evidence

The implementation PR is not review-ready until it contains:

- baseline and candidate raw benchmark data,
- a size attribution table,
- selected kernel and rejected-candidate results,
- differential-test results,
- full package test/typecheck/build results,
- live Three.js and React probe notes,
- any screenshots used for visual comparison,
- a statement of remaining Koota use elsewhere in the workspace.
