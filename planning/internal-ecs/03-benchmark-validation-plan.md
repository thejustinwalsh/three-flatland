# Internal ECS benchmark and validation plan

Status: initial kernel baseline captured; expanded kernel, production, consumer, and live gates pending

Date: 2026-08-22

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

These numbers were recaptured after rebasing onto implementation merge base `4824c475` with
esbuild 0.28.1. Raw results are in
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

### Live WebGPU probes

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

## Memory and allocation checks

Measure after warm-up:

- allocations per steady-state schedule run,
- retained heap after create/destroy cycles,
- world disposal with object-backed traits,
- peak heap at 60,000 entities,
- selector/store memory by trait and query count.

Required behavior:

- zero new entity/query result arrays per steady-state frame,
- event queues and scratch sets are reused,
- destroyed entities release object-backed values,
- repeated world create/dispose returns to a stable retained-heap band,
- no global world list or built-in prototype mutation.

## Bundle checks

### Kernel-only

Bundle the exact internal exports retained by `three-flatland` with minification and tree shaking.

Reject if greater than:

- 12,000 bytes minified,
- 4,000 bytes gzip,
- 3,800 bytes Brotli.

### Representative consumers

Measure at least:

- one basic Three.js example,
- one basic React example,
- Knightmark/batch stress,
- a pass/lighting example that creates dynamic traits.

Required result versus Koota baseline:

- Koota absent from the published `three-flatland` production dependency graph and emitted
  artifacts,
- at least 22 kB minified reduction,
- at least 6 kB gzip reduction,
- no compensating duplicate runtime chunk.

The PR report includes metafile attribution so a hash or unrelated dependency change cannot be
mistaken for the ECS saving. Workspace minis and other packages that intentionally use Koota are
reported separately; they do not fail this package-scoped removal gate.

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
- Representative gzip saving below 6 kB.
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
