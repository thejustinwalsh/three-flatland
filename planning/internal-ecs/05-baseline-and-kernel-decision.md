# Baseline and kernel decision

Status: initial kernel direction selected; expanded evidence and production implementation remain gated

Date: 2026-08-22

## Decision

Proceed with **entity signatures plus incrementally maintained selector views** as the production
runtime direction.

It is the best current balance for Flatland's bounded trait surface:

- 68.5% less active heap than Koota at 60,000 entities,
- 44.6% less active heap than the sparse-persistent candidate,
- 59.2% lower median for the 60,000-entity lifecycle workload than Koota,
- 99.8% lower median for repeated stable-query retrieval,
- 57.8% lower median when actually iterating 16.384 million stable-query entities,
- 60.6% lower median for 12,000 routing changes,
- 87.5% lower median for 12,000 dynamic structural changes, and
- 77.5% lower median for exclusive assignment lookup.

The production runtime still has to pass the full `SystemSchedule`, allocation, representative
consumer bundle, declaration, and live WebGPU gates. This decision chooses the implementation
direction; it does not waive any shipping threshold.

## Reproducible environment

| Input                 | Value                                      |
| --------------------- | ------------------------------------------ |
| Merge base            | `6868ff18d65ae5cb0edc75abef00d8f02e860ac6` |
| Node                  | 26.5.0                                     |
| pnpm                  | 10.28.1                                    |
| OS                    | Darwin 25.5.0 arm64                        |
| Koota                 | 0.6.5                                      |
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

The independent reference model and Koota adapter exposed nine intentional differences between
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

All three candidates exactly match the intended reference snapshot. The Koota deltas have explicit
tests so they cannot be mistaken for accidental incompatibilities during migration.

## Size baseline

| Artifact                                  | Minified |     Gzip |  Brotli |
| ----------------------------------------- | -------: | -------: | ------: |
| Koota seven-import kernel                 | 34,910 B | 10,584 B | 9,362 B |
| Shared candidate superset, signature mode |  8,490 B |  3,181 B | 2,893 B |

The prototype result is conservative: the candidate artifact still contains the shared
benchmark-adapter shell and branches for all three query modes. Even that superset is 26,420 bytes
smaller minified, 7,403 bytes smaller gzip, and 6,469 bytes smaller Brotli than the exact Koota
import surface. It is below the isolated kernel caps of 12,000 / 4,000 / 3,800 bytes.

The specialized production kernel must be measured again. This isolated result does not substitute
for the required basic Three.js, basic React, stress, and dynamic-effect consumer attribution.

## Full microbenchmark summary

Times are milliseconds per sample. Lower is better.

| Workload                              | Koota median / p95 | Signature median / p95 | Median change |
| ------------------------------------- | -----------------: | ---------------------: | ------------: |
| Lifecycle, 1,000                      |      1.799 / 2.281 |          0.927 / 1.313 |        -48.5% |
| Lifecycle, 16,384                     |    33.043 / 35.204 |        13.464 / 13.686 |        -59.3% |
| Lifecycle, 60,000                     |  123.779 / 134.136 |        50.449 / 53.106 |        -59.2% |
| Stable view retrieval, 1,000 calls    |      8.881 / 9.146 |          0.016 / 0.023 |        -99.8% |
| Stable view iteration, 16.384M visits |    15.924 / 16.574 |          6.728 / 6.775 |        -57.8% |
| Dynamic add/remove, 12,000            |    12.142 / 13.084 |          1.513 / 1.915 |        -87.5% |
| Three routing writes, 12,000          |      4.118 / 4.453 |          1.623 / 1.752 |        -60.6% |
| Exclusive assign/read/remove, 12,000  |      3.123 / 4.052 |          0.703 / 0.791 |        -77.5% |

The direct-store loop showed a 10.3% slower signature median at 0.182 ms versus 0.165 ms. After setup,
that loop performs only identical cached index and `number[]` operations—no adapter operation is in
the timed region—so the disagreement is classified as sub-millisecond process/JIT noise rather
than a kernel result. The end-to-end schedule gate remains authoritative.

## Numeric storage decision

Keep ordinary `number[]` fields for the production SoA stores.

| Workload                       | `number[]` median / p95 | Fixed `Float64Array` | Stable growable wrapper |
| ------------------------------ | ----------------------: | -------------------: | ----------------------: |
| Sequential read/write          |           0.123 / 0.131 |        0.163 / 0.173 |           1.239 / 1.255 |
| Random read/write              |           0.333 / 0.351 |        0.235 / 0.248 |           0.694 / 0.744 |
| Growth and tail initialization |           0.242 / 0.334 |        0.260 / 0.342 |           0.323 / 1.084 |

The fixed typed array wins the random-access median in this run, while ordinary arrays win the
sequential and growth medians. More importantly, `number[]` is the only direct indexed container
whose captured reference sees later growth. A fixed typed array must replace its view, while a
stable growable wrapper preserves only the wrapper and adds method-call indirection to every hot
read and write. All 110 measured sample checksums match across strategies.

## Candidate disposition

### Selected: signatures plus persistent views

The signature candidate is 15.8% faster than sparse-persistent at the 60,000-entity lifecycle,
6.0% faster for routing events, 10.1% faster for structural churn, and uses 44.6% less active heap. Multiple 32-bit words support
dynamic effect traits without a fixed 32-trait ceiling.

### Rejected: sparse membership plus persistent views

This candidate is viable and remains the rollback design. Its stable-view iteration is effectively
tied with signatures, but its larger memory footprint and slower lifecycle, event, structural, and
assignment paths make it the weaker overall kernel.

### Rejected: anchored scans

Anchored scans are small and fast under structural churn, but the unchanged 16,384-entity query
retrieval workload took 169.7 ms versus Koota's 8.9 ms, and full iteration took 175.5 ms versus
15.9 ms. Recomputing intersections per frame is incompatible with Flatland's stable sprite-wide queries.

## Next gate

First expand the kernel matrix called out in the validation plan, including raw-index comparison,
randomized lifecycle/recycle passes, match densities, and allocation checks. Then implement the
selected private runtime without a production consumer and run the same behavior contract,
compile-time inference tests, isolated production bundle budget, stale-handle tests, and
world-disposal tests. Only after that gate passes should core call sites move off Koota.
