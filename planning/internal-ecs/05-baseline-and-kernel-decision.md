# Baseline and kernel decision

Status: core migration and production Node renderer matrix validated; live browser A/B gates remain pending

Date: 2026-08-22

## Decision

Proceed with **entity signatures plus incrementally maintained selector views** as the production
runtime direction.

It is the best current balance for Flatland's bounded trait surface:

- 68.5% less active heap than Koota at 60,000 entities,
- the production runtime uses 44.6% less active heap than the sparse-persistent candidate,
- 51.1% lower median for the 60,000-entity lifecycle workload than Koota,
- 52.9% lower median for the 60,000-entity, 256-dynamic-effect-trait lifecycle,
- 99.8% lower median for repeated stable-query retrieval,
- 46.6% lower median when actually iterating 16.384 million stable-query entities,
- 66.1% lower median for 12,000 routing changes,
- 80.8% lower median for 12,000 dynamic structural changes, and
- 60.6% lower median for full-handle numeric batch assignment.

The production runtime passes the `SystemSchedule`, allocation, isolated-kernel-size, declaration,
package test, and production-source Node renderer gates. Deterministic Knightmark and lighting runs still have to prove
the end-to-end result in live WebGPU. This decision does not waive that shipping threshold.

## Reproducible environment

| Input                 | Value                                      |
| --------------------- | ------------------------------------------ |
| Kernel merge base     | `bd19dd506f64cbb060e69148e01fc7b9ceb4bee8` |
| Storage merge base    | `4824c47555a822b532ab8497c30c8e8d881529a2` |
| Node                  | 26.5.0                                     |
| pnpm                  | 10.28.1                                    |
| OS                    | Darwin 25.5.0 arm64                        |
| Koota                 | 0.6.5                                      |
| tsx                   | 4.21.0                                     |
| esbuild               | 0.28.1                                     |
| Browser bundle target | ES2022 ESM                                 |
| CPU                   | Apple M4                                   |

Every adapter ran in three fresh Node processes with explicit garbage collection available. Per
process, ordinary workloads used five warm-ups and fifteen observations. Lifecycle workloads used
three warm-ups and ten observations at 1,000 and 16,384 entities, and five observations at 60,000
entities. The aggregate medians and p95s therefore include process/JIT variance, not only repeated
timing inside one process. The JSON records every raw observation. Memory uses two warm-ups and
seven fresh-world observations per process, with active heap sampled before disposal and retained
heap sampled after the capture frame returns and garbage collection runs. The raw artifacts record
a SHA-256 of each harness, so results produced before the harness commit remain tied to the exact
source that generated them.

Raw evidence:

- [`results/kernel-baseline.json`](./results/kernel-baseline.json)
- [`results/kernel-size.json`](./results/kernel-size.json)
- [`results/numeric-storage.json`](./results/numeric-storage.json)
- [`results/renderer-production.json`](./results/renderer-production.json)

## Behavioral baseline

The independent reference model and Koota adapter exposed ten intentional differences between
Koota 0.6.5 and the Flatland contract:

1. Passing a partial initializer to a Koota object-backed trait replaces the factory result, so
   omitted defaults disappear. Flatland merges the partial into a fresh factory result.
2. Koota changed-event queries do not enforce an ordinary required tag. The current routing query
   could therefore return an entity without `IsBatched`; later relation rejection happened to hide it.
   Flatland filters required traits when the event is enqueued.
3. Adding and removing a trait before the first added-event drain loses the Koota added event.
   Flatland preserves independent added and removed queues.
4. Destroying an entity causes Koota to report removed traits. Flatland reserves removed events for
   explicit trait removal so destruction cannot queue unreadable entity handles.
5. If an index is destroyed and recycled before an added-event drain, Koota collapses the old and
   new generations into one result. Flatland retains both packed handles as distinct events.
6. Adding a trait an entity already has is a silent no-op in Koota. Flatland treats duplicate add
   as an internal error, preserving the original value and emitting no changed event.
7. Koota accepts duplicate traits in one spawn and creates observable state. Flatland preflights
   composition and throws before consuming an index or touching stores, selectors, or events.
8. Koota accepts an empty all-entities selector. Flatland rejects it because the renderer has no
   all-entities query and should not maintain a global membership index for an unused feature.
9. Koota's 12-bit generation wraps and aliases the original handle on the 4,096th recycle. Flatland
   uses the safe-integer generation range and permanently retires an index before it could wrap.
10. Removing an exclusive relation from a destroyed source silently no-ops in Koota. Flatland
    rejects stale-source unassignment consistently with every other structural mutation.

All three candidates and the specialized private production runtime exactly match the intended
reference snapshot. The Koota deltas have explicit tests so they cannot be mistaken for accidental
incompatibilities during migration.

## Size baseline

| Artifact                                  | Minified |     Gzip |  Brotli |
| ----------------------------------------- | -------: | -------: | ------: |
| Koota seven-import kernel                 | 34,910 B | 10,584 B | 9,362 B |
| Shared candidate superset, signature mode |  8,637 B |  3,209 B | 2,940 B |
| Private production runtime                | 11,681 B |  3,828 B | 3,432 B |

The prototype result is conservative: the candidate artifact still contains the shared
benchmark-adapter shell and branches for all three query modes. Even that superset is 26,273 bytes
smaller minified, 7,375 bytes smaller gzip, and 6,422 bytes smaller Brotli than the exact Koota
import surface. It is below the isolated kernel caps of 12,000 / 4,000 / 3,800 bytes.

The specialized private runtime now measures 23,229 bytes smaller minified, 6,756 bytes smaller
gzip, and 5,930 bytes smaller Brotli than the exact Koota import surface. Its additional entity
safety, nominal types, explicit per-world event activation, and release paths remain below the
12,000 / 4,000 / 3,800 byte caps. This isolated result does not substitute for the required basic
Three.js, basic React, stress, and dynamic-effect consumer attribution after the core migration.

## Full microbenchmark summary

Times are milliseconds per sample. Lower is better.

| Workload                              | Koota median / p95 | Production median / p95 | Median change |
| ------------------------------------- | -----------------: | ----------------------: | ------------: |
| Lifecycle, 1,000                      |      1.837 / 2.347 |           1.290 / 1.903 |        -29.8% |
| Lifecycle, 16,384                     |    33.903 / 38.039 |         16.228 / 20.980 |        -52.1% |
| Lifecycle, 60,000                     |  123.567 / 132.225 |         60.453 / 65.511 |        -51.1% |
| 256-effect-trait lifecycle, 12,000    |    58.880 / 63.114 |         45.738 / 52.014 |        -22.3% |
| 256-effect-trait lifecycle, 60,000    |  259.267 / 268.755 |       122.061 / 133.156 |        -52.9% |
| Stable view retrieval, 1,000 calls    |      8.974 / 9.284 |           0.015 / 0.029 |        -99.8% |
| Stable view iteration, 16.384M visits |    15.934 / 16.161 |           8.508 / 9.093 |        -46.6% |
| Dynamic add/remove, 12,000            |    13.350 / 14.794 |           2.564 / 2.893 |        -80.8% |
| Three routing writes, 12,000          |      4.994 / 5.202 |           1.694 / 1.947 |        -66.1% |
| Exclusive assign/read/remove, 12,000  |      3.689 / 4.435 |           1.455 / 1.600 |        -60.6% |

The production stable-iteration observations include two 86.3–86.7 ms timing outliers;
the other 43 observations cluster between 8.43 and 9.09 ms. The aggregate p95 remains 9.093 ms, and
the raw result intentionally retains that timing variance instead of filtering it
from the evidence.

The production 16,384-entity lifecycle observations likewise retain two slower samples at 20.980
and 25.618 ms; the other 28 span 15.537–17.137 ms, producing the reported 20.980 ms p95.

The direct-store loop measured 0.182 ms for the production runtime and 0.175 ms for Koota, with an
absolute median difference of 0.007 ms. After setup, that loop performs only identical cached index and
`number[]` operations—no adapter operation is in the timed region—so the disagreement is classified
as sub-millisecond process/JIT noise rather than a kernel result. The end-to-end schedule and
batch-local traversal gates remain authoritative. The assignment row uses a full packed handle in a
numeric field with `0` as the unassigned sentinel, matching the planned `BatchSlot.batchEntity`
storage rather than a general relation or `Map` shim.

## Production renderer schedule

The production `SpriteGroup`/`SystemSchedule` harness ran all eight accepted cases at both 16,384 and
60,000 sprites on the same Apple M4 host. Each case used five warm-ups, ten measured frames, three
GC-controlled create/destroy cycles, and the ordinary production batch-size ladder. These timings
include per-system User Timing instrumentation, so they are diagnostic schedule measurements rather
than the ordinary uninstrumented browser merge gate.

| Case                   | 16,384 median / p95 | Batches | 60,000 median / p95 | Batches |
| ---------------------- | ------------------: | ------: | ------------------: | ------: |
| Static                 |       4.998 / 5.584 |     1→1 |     22.073 / 22.265 |     4→4 |
| Moving, alpha/depth    |       6.129 / 6.644 |     1→1 |     24.948 / 26.036 |     4→4 |
| Transparent CPU sort   |     10.619 / 18.244 |     1→1 |     44.116 / 47.388 |     4→4 |
| 12,000 routing changes |     42.866 / 44.278 |     1→4 |     61.650 / 63.696 |     4→7 |
| 10% add/remove churn   |     17.361 / 25.966 |     1→1 |     49.421 / 53.463 |     4→4 |
| Dynamic-effect churn   |       5.814 / 9.130 |     1→1 |     22.135 / 22.327 |     4→4 |
| Mixed scene            |       7.822 / 8.358 |     2→2 |     34.691 / 35.711 |     4→4 |
| Multiple worlds        |       8.498 / 8.986 |     2→2 |     35.862 / 36.832 |     4→4 |

Every initial batch count matched the production ladder: one batch for a single 16,384-sprite run
and four for a single 60,000-sprite run, with the expected sums for mixed and multi-world cases.
Across all 160 measured frames, the packed member count exactly matched the number of occupied
physical rows. The separate unreported topology frame confirmed that transform, sort, and dirty-range
flush traversal never returned to an earlier batch after advancing to another. Routing intentionally
moves individual owners between batches and is not subject to that traversal-order invariant.

Transform sync dominates settled workloads; batch reassignment dominates the 12,000-routing-change
case. With ten measured frames, nearest-rank p95 is the observed maximum. The 16,384 transparent-sort,
add/remove, and dynamic-effect rows retain their upper-tail samples rather than filtering them.
Per-cycle retained deltas spanned -1,063,240 to +1,173,256 bytes; the 60,000-sprite subset spanned
-615,472 to +640,800 bytes. Final cross-cycle deltas spanned -354,032 to +375,656 bytes. Positive and
negative values remain bounded without a consistent upward post-destroy trend; with three cycles this
is stabilization evidence, not proof of leak absence. This is JavaScript heap, not browser GPU memory.

## Numeric storage decision

Keep ordinary `number[]` fields for the production SoA stores.

| Workload                       | `number[]` median / p95 | Fixed `Float64Array` | Stable growable wrapper |
| ------------------------------ | ----------------------: | -------------------: | ----------------------: |
| Sequential read/write          |           0.109 / 0.212 |        0.342 / 0.388 |           1.403 / 1.596 |
| Random read/write              |           0.360 / 0.393 |        0.246 / 0.257 |           0.761 / 0.778 |
| Growth and tail initialization |           0.271 / 0.398 |        0.205 / 0.458 |           0.310 / 1.093 |

The fixed typed array wins the random-access and growth medians in this run, while ordinary arrays
win the sequential median. More importantly, `number[]` is the only direct indexed container whose
captured reference sees later growth. A fixed typed array must replace its view, while the stable
growable wrapper preserves its wrapper identity by replacing the backing buffer and adds
method-call indirection to every hot read and write. All 110 measured sample checksums match across
strategies.

## Candidate disposition

### Selected: signatures plus persistent views

The signature candidate is 8.9% faster than sparse-persistent at the 60,000-entity lifecycle,
10.4% faster for structural churn, 52.8% faster for the 256-effect-trait lifecycle, 7.8% faster for
exclusive assignment, 22.0% faster for routing, and uses 44.5% less active heap. Multiple 32-bit
words support dynamic effect traits without a fixed 32-trait ceiling. The specialized production
runtime's dense active-signature-word scan with present-bit traversal improves another 23.6% over
the shared signature prototype on the 60,000-entity base lifecycle and 67.5% on the dynamic-effect
lifecycle.

### Rejected: sparse membership plus persistent views

This candidate is viable and remains the rollback design. Its stable-view iteration is effectively
tied with signatures, but its larger memory footprint and slower lifecycle, event, and structural
paths make it the weaker overall kernel.

### Rejected: anchored scans

Anchored scans are small and fast under structural churn, but the unchanged 16,384-entity query
retrieval workload took 349.3 ms versus Koota's 9.0 ms, and full iteration took 354.5 ms versus
15.9 ms. Recomputing intersections per frame is incompatible with Flatland's stable sprite-wide queries.

## Next gate

Run the deterministic Knightmark and lighting A/B matrix against identical production fixtures.
Record the 60 Hz RAF-cadence crossover against an explicit 16.667 ms callback budget, the 40,000-sprite
result, per-system production-profile diagnostics, and paired traces for any regression. Remove Koota
only after the renderer result confirms the batch-local packed-member traversal and physical-row
sorting perform as intended.
