# Baseline and kernel decision

Status: private production runtime validated; core migration and renderer gates remain pending

Date: 2026-08-22

## Decision

Proceed with **entity signatures plus incrementally maintained selector views** as the production
runtime direction.

It is the best current balance for Flatland's bounded trait surface:

- 68.5% less active heap than Koota at 60,000 entities,
- the production runtime uses 44.6% less active heap than the sparse-persistent candidate,
- 48.3% lower median for the 60,000-entity lifecycle workload than Koota,
- 51.4% lower median for the 60,000-entity, 256-dynamic-effect-trait lifecycle,
- 99.9% lower median for repeated stable-query retrieval,
- 47.1% lower median when actually iterating 16.384 million stable-query entities,
- 65.8% lower median for 12,000 routing changes,
- 80.9% lower median for 12,000 dynamic structural changes, and
- 58.2% lower median for full-handle numeric batch assignment.

The production runtime still has to pass the full `SystemSchedule`, allocation, representative
consumer bundle, declaration, and live WebGPU gates. This decision chooses the implementation
direction; it does not waive any shipping threshold.

## Reproducible environment

| Input                 | Value                                      |
| --------------------- | ------------------------------------------ |
| Kernel merge base     | `93c7d9cc9a5c35844ea2f08daf090c3bc06080e5` |
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

## Behavioral baseline

The independent reference model and Koota adapter exposed ten intentional differences between
Koota 0.6.5 and the Flatland contract:

1. Passing a partial initializer to a Koota object-backed trait replaces the factory result, so
   omitted defaults disappear. Flatland will merge the partial into a fresh factory result.
2. Koota changed-event queries do not enforce an ordinary required tag. The current routing query
   can therefore return an entity without `IsBatched`; later relation rejection happens to hide it.
   Flatland will filter required traits when the event is enqueued.
3. Adding and removing a trait before the first added-event drain loses the Koota added event.
   Flatland will preserve independent added and removed queues.
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
| Private production runtime                | 11,647 B |  3,824 B | 3,427 B |

The prototype result is conservative: the candidate artifact still contains the shared
benchmark-adapter shell and branches for all three query modes. Even that superset is 26,273 bytes
smaller minified, 7,375 bytes smaller gzip, and 6,422 bytes smaller Brotli than the exact Koota
import surface. It is below the isolated kernel caps of 12,000 / 4,000 / 3,800 bytes.

The specialized private runtime now measures 23,263 bytes smaller minified, 6,760 bytes smaller
gzip, and 5,935 bytes smaller Brotli than the exact Koota import surface. Its additional entity
safety, nominal types, explicit per-world event activation, and release paths remain below the
12,000 / 4,000 / 3,800 byte caps. This isolated result does not substitute for the required basic
Three.js, basic React, stress, and dynamic-effect consumer attribution after the core migration.

## Full microbenchmark summary

Times are milliseconds per sample. Lower is better.

| Workload                              | Koota median / p95 | Production median / p95 | Median change |
| ------------------------------------- | -----------------: | ----------------------: | ------------: |
| Lifecycle, 1,000                      |      1.809 / 2.234 |           1.316 / 1.928 |        -27.2% |
| Lifecycle, 16,384                     |    33.442 / 35.400 |         17.174 / 17.732 |        -48.6% |
| Lifecycle, 60,000                     |  125.074 / 130.579 |         64.675 / 67.889 |        -48.3% |
| 256-effect-trait lifecycle, 12,000    |    58.411 / 61.294 |         45.496 / 52.397 |        -22.1% |
| 256-effect-trait lifecycle, 60,000    |  253.709 / 261.141 |       123.362 / 143.071 |        -51.4% |
| Stable view retrieval, 1,000 calls    |      8.817 / 9.041 |           0.013 / 0.028 |        -99.9% |
| Stable view iteration, 16.384M visits |    16.047 / 16.497 |           8.494 / 8.908 |        -47.1% |
| Dynamic add/remove, 12,000            |    13.054 / 14.006 |           2.499 / 2.704 |        -80.9% |
| Three routing writes, 12,000          |      5.049 / 5.190 |           1.729 / 1.930 |        -65.8% |
| Exclusive assign/read/remove, 12,000  |      3.577 / 4.660 |           1.494 / 1.652 |        -58.2% |

The production stable-iteration observations include two 86–87 ms startup/JIT outliers;
the other 43 observations cluster between 8.42 and 8.91 ms. The aggregate p95 remains 8.908 ms, and
the raw result intentionally retains that startup/JIT scheduling variance instead of filtering it
from the evidence.

The direct-store loop measured 0.172 ms for the production runtime versus 0.174 ms for Koota, an
absolute difference of 0.002 ms. After setup, that loop performs only identical cached index and
`number[]` operations—no adapter operation is in the timed region—so the disagreement is classified
as sub-millisecond process/JIT noise rather than a kernel result. The end-to-end schedule and
batch-local traversal gates remain authoritative. The assignment row uses a full packed handle in a
numeric field with `0` as the unassigned sentinel, matching the planned `BatchSlot.batchEntity`
storage rather than a general relation or `Map` shim.

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

The signature candidate is 9.6% faster than sparse-persistent at the 60,000-entity lifecycle,
10.0% faster for structural churn, 53.9% faster for the 256-effect-trait lifecycle, 11.5% faster for
exclusive assignment, 0.8% slower for routing, and uses 44.5% less active heap. Multiple 32-bit
words support dynamic effect traits without a fixed 32-trait ceiling. The specialized production
runtime's dense active-signature-word scan with present-bit traversal improves another 16.1% over
the shared signature prototype on the 60,000-entity base lifecycle and 66.2% on the dynamic-effect
lifecycle.

### Rejected: sparse membership plus persistent views

This candidate is viable and remains the rollback design. Its stable-view iteration is effectively
tied with signatures, but its larger memory footprint and slower lifecycle, event, and structural
paths make it the weaker overall kernel.

### Rejected: anchored scans

Anchored scans are small and fast under structural churn, but the unchanged 16,384-entity query
retrieval workload took 362.0 ms versus Koota's 8.8 ms, and full iteration took 369.2 ms versus
16.0 ms. Recomputing intersections per frame is incompatible with Flatland's stable sprite-wide queries.

## Next gate

Finish the private-runtime PR review with behavior, compile-time inference, isolated production
bundle, packed-package boundary, stale-handle, and disposal gates green. Then migrate core call
sites, enforce allocation-free hot numeric access and batch-local physical-slot iteration, and run
the full schedule, representative consumer, declaration, and live WebGPU gates before removing
Koota.
