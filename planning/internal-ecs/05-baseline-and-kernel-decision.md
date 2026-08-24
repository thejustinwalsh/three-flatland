# Baseline and kernel decision

Status: kernel decision accepted; final frozen-source Node, consumer, and live browser evidence pending

Date: 2026-08-22

## Decision

Proceed with **entity signatures plus incrementally maintained selector views** as the production
runtime direction.

It is the best current balance for Flatland's bounded trait surface:

- 68.5% less active heap than Koota at 60,000 entities,
- the production runtime uses 44.6% less active heap than the sparse-persistent candidate,
- 50.0% lower median for the 60,000-entity lifecycle workload than Koota,
- 55.6% lower median for the 60,000-entity, 256-dynamic-effect-trait lifecycle,
- 99.8% lower median for repeated stable-query retrieval,
- 46.3% lower median across 16.384 million stable-query iteration visits,
- 65.2% lower median for 12,000 routing changes,
- 81.0% lower median for 12,000 dynamic structural changes, and
- 58.7% lower median for full-handle numeric batch assignment.

The production runtime passes the `SystemSchedule`, allocation, isolated-kernel-size, declaration,
and package gates. The earlier production-source Node matrix passed on its captured revision, but
runtime lifecycle fixes landed afterward. The frozen implementation must repeat that matrix, the
consumer-budget capture, and deterministic Knightmark and lighting runs before release. This
decision does not waive those shipping thresholds.

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
| Renderer source HEAD  | `7faf7f400a20741f9686bd15a3e9a0652c4c15fd` |
| Renderer merge base   | `c596ac2313e33cace825fe197a6d730269019175` |
| Three.js              | 0.185.1                                    |
| three-flatland        | 0.1.0-alpha.10                             |
| Browser bundle target | ES2022 ESM                                 |
| CPU                   | Apple M4                                   |

Every adapter ran in three fresh Node processes with explicit garbage collection available. Per
process, ordinary workloads used five warm-ups and fifteen observations. Lifecycle workloads used
three warm-ups and ten observations at 1,000 and 16,384 entities, and five observations at 60,000
entities. Medians and p95s use nearest-rank order statistics; at ten observations the median is the
fifth ordered value and p95 is the maximum. The aggregates therefore include process/JIT variance, not only repeated
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
- [`results/consumer-bundle-budget.json`](./results/consumer-bundle-budget.json)

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
9. Koota's 8-bit generation wraps and aliases the original handle on the 256th recycle. Flatland
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
| Private production runtime                | 10,905 B |  3,865 B | 3,507 B |
| Optional capacity extension alone         |     56 B |     71 B |    60 B |
| Shipped runtime with capacity             | 10,954 B |  3,887 B | 3,529 B |

The prototype result is conservative: the candidate artifact still contains the shared
benchmark-adapter shell and branches for all three query modes. Even that superset is 26,273 bytes
smaller minified, 7,375 bytes smaller gzip, and 6,422 bytes smaller Brotli than the exact Koota
import surface. It is below the isolated kernel caps of 12,000 / 4,000 / 3,800 bytes.

The base private runtime measures 24,005 bytes smaller minified, 6,719 bytes smaller gzip, and 5,855
bytes smaller Brotli than the exact Koota import surface. The statically shipped runtime with
capacity measures 23,956 / 6,697 / 5,833 bytes smaller and remains below the unchanged 12,000 /
4,000 / 3,800-byte caps. The standalone extension row is attribution evidence, not an arithmetically
additive compressed size: the authoritative shipped delta over the base runtime is 49 bytes
minified, 22 bytes gzip, and 22 bytes Brotli.

Representative consumer sizes were gated against the reviewed earlier-source budget. The final
frozen-source capture must replace and reproduce that budget. The pinned historical comparison is
intentionally report-only because it spans every package change reachable from those fixtures:
basic Three, basic React, and pass/lighting are larger, while Knightmark is smaller. Publication
checks continue to reject Koota and duplicate private-runtime output.

## Full microbenchmark summary

Times are milliseconds per sample. Lower is better.

| Workload                              | Koota median / p95 | Production median / p95 | Median change |
| ------------------------------------- | -----------------: | ----------------------: | ------------: |
| Lifecycle, 1,000                      |      1.813 / 2.260 |           1.332 / 2.013 |        -26.5% |
| Lifecycle, 16,384                     |    33.608 / 36.101 |         16.567 / 17.494 |        -50.7% |
| Lifecycle, 60,000                     |  125.005 / 131.482 |         62.524 / 67.680 |        -50.0% |
| 256-effect-trait lifecycle, 12,000    |    58.171 / 62.703 |         42.942 / 51.059 |        -26.2% |
| 256-effect-trait lifecycle, 60,000    |  255.771 / 260.366 |       113.610 / 116.619 |        -55.6% |
| Stable view retrieval, 1,000 calls    |      8.889 / 9.127 |           0.015 / 0.023 |        -99.8% |
| Stable view iteration, 16.384M visits |    15.903 / 16.369 |           8.539 / 8.799 |        -46.3% |
| Dynamic add/remove, 12,000            |    13.182 / 13.921 |           2.501 / 2.779 |        -81.0% |
| Three routing writes, 12,000          |      5.007 / 5.276 |           1.742 / 1.821 |        -65.2% |
| Exclusive assign/read/remove, 12,000  |      3.570 / 4.628 |           1.476 / 1.600 |        -58.7% |

Production stable iteration retained two 86.004–86.105 ms timing observations. The other 43
observations span 8.420–8.799 ms. Because nearest-rank p95 at 45 samples selects the 43rd ordered
observation, the reported p95 is 8.799 ms; no observations were filtered.

The direct-store loop measured 0.128 ms for production and 0.175 ms for Koota, an absolute median
difference of 0.047 ms. Koota retained three 0.864–0.932 ms upper-tail observations, producing a
0.864 ms p95; production p95 was 0.190 ms. Because the timed region contains identical cached index
and `number[]` operations and no adapter call, this is not interpreted as an ECS-kernel result. The
end-to-end schedule and batch-local traversal gates remain authoritative. The assignment row uses a
full packed handle in a numeric field with `0` as the unassigned sentinel, matching the planned
`BatchSlot.batchEntity` storage rather than a general relation or `Map` shim.

## Historical production renderer schedule

The production `SpriteGroup`/`SystemSchedule` harness ran all eight cases at both 16,384 and 60,000
sprites on the same Apple M4 host at renderer source `7faf7f40`. This matrix established the prior
acceptance baseline; it must be repeated on the frozen implementation before release. Each case
first used three fresh GC-controlled memory-only
contexts. Those contexts contained no retained User Timing measures, probe events, topology
summaries, or timing samples. A separate production context then ran one untimed
topology-validation frame, five warm-ups, and ten instrumented measured frames. These timings include
per-system User Timing instrumentation, so they are diagnostic schedule measurements rather than
the ordinary uninstrumented browser merge gate. The raw artifact preserves its capture-time
`measured-unreviewed` status; the tables below remain historical until the final recapture is
independently reviewed.

| Case                   | 16,384 median / p95 | Batches | 60,000 median / p95 | Batches |
| ---------------------- | ------------------: | ------: | ------------------: | ------: |
| Static                 |       5.002 / 5.617 |     1→1 |     21.962 / 22.133 |     4→4 |
| Moving, alpha/depth    |       6.253 / 6.667 |     1→1 |     25.314 / 25.992 |     4→4 |
| Transparent CPU sort   |      9.885 / 10.185 |     1→1 |     47.216 / 48.143 |     4→4 |
| 12,000 routing changes |     43.196 / 46.011 |     1→4 |     62.456 / 62.895 |     4→7 |
| 10% add/remove churn   |     17.755 / 19.903 |     1→1 |     49.815 / 55.034 |     4→4 |
| Dynamic-effect churn   |       5.653 / 6.038 |     1→1 |     21.654 / 22.049 |     4→4 |
| Mixed scene            |      8.370 / 10.583 |     2→2 |     36.222 / 36.884 |     4→4 |
| Multiple worlds        |       9.184 / 9.416 |     2→2 |     37.889 / 38.922 |     4→4 |

Every initial batch count matched the production ladder: one batch for a single 16,384-sprite run
and four for a single 60,000-sprite run, with the expected sums for mixed and multi-world cases.
Across all 160 measured frames, the packed member count exactly matched the number of occupied
physical rows. The separate untimed topology frame confirmed that transform, sort, and dirty-range
flush traversal never returned to an earlier batch after advancing to another. Routing intentionally
moves individual owners between batches and is not subject to that traversal-order invariant.

Transform sync dominates settled workloads; batch reassignment dominates the 12,000-routing-change
case. With ten measured frames, nearest-rank p95 is the observed maximum. All maxima remain in the
evidence. The most distinct 16,384-sprite upper-tail observations are mixed scene at 10.583 ms versus
9.424 ms next-highest, and routing at 46.011 ms versus 44.160 ms next-highest. No observations were
filtered. Per-cycle retained deltas spanned -1,073,072 to +1,192,952 bytes; the 60,000-sprite subset
spanned -754,112 to +721,040 bytes. Final cross-cycle deltas spanned -334,200 to +395,216 bytes.
Positive and negative values remain bounded without a consistent upward post-destroy trend; with
three cycles this is stabilization evidence, not proof of leak absence. This is JavaScript heap, not
browser GPU memory.

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

The signature candidate is 7.0% faster than sparse-persistent at the 60,000-entity lifecycle, 4.3%
faster for structural churn, 54.8% faster for the 256-effect-trait lifecycle, 6.0% faster for
exclusive assignment, 17.1% faster for routing, and uses 44.5% less active heap. Multiple 32-bit
words support dynamic effect traits without a fixed 32-trait ceiling. The specialized production
runtime's dense active-signature-word scan with present-bit traversal improves another 20.3% over
the shared signature prototype on the 60,000-entity base lifecycle and 69.5% on the dynamic-effect
lifecycle.

### Rejected: sparse membership plus persistent views

This candidate is viable and remains the rollback design. Its stable-view iteration is effectively
tied with signatures, but its larger memory footprint and slower lifecycle, event, and structural
paths make it the weaker overall kernel.

### Rejected: anchored scans

Anchored scans are small and fast under structural churn, but the unchanged 16,384-entity query
retrieval workload took 346.1 ms versus Koota's 8.9 ms, and full iteration took 352.2 ms versus
15.9 ms. Recomputing intersections per frame is incompatible with Flatland's stable sprite-wide queries.

## Next gate

Run the deterministic Knightmark and lighting A/B matrix against identical production fixtures.
Record the 60 Hz RAF-cadence crossover against an explicit 16.667 ms callback budget, the 40,000-sprite
result, per-system production-profile diagnostics, and paired traces for any regression. Koota is
already absent from the current source, declarations, published output, and consumer graphs; the live
browser matrix remains the final timing gate for the batch-local packed-member traversal and
physical-row sorting.
