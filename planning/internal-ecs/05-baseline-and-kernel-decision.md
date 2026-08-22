# Baseline and kernel decision

Status: evidence gate complete; production implementation remains gated

Date: 2026-08-22

## Decision

Proceed with **entity signatures plus incrementally maintained selector views** as the production
runtime direction.

It is the best current balance for Flatland's bounded trait surface:

- 68.5% less active heap than Koota at 60,000 entities,
- 44.4% less active heap than the sparse-persistent candidate,
- 57.1% lower median for the 60,000-entity lifecycle workload than Koota,
- 99.8% lower median for repeated stable-query retrieval,
- 69.4% lower median for 12,000 routing changes,
- 57.1% lower median for 12,000 dynamic structural changes, and
- 77.9% lower median for exclusive assignment lookup.

The production runtime still has to pass the full `SystemSchedule`, allocation, representative
consumer bundle, declaration, and live WebGPU gates. This decision chooses the implementation
direction; it does not waive any shipping threshold.

## Reproducible environment

| Input | Value |
| --- | --- |
| Merge base | `6868ff18d65ae5cb0edc75abef00d8f02e860ac6` |
| Node | 26.5.0 |
| pnpm | 10.28.1 |
| OS | Darwin 25.5.0 arm64 |
| Koota | 0.6.5 |
| esbuild | 0.28.1 |
| Browser bundle target | ES2022 ESM |

Every adapter ran in a fresh Node process with explicit garbage collection available. Ordinary
workloads used five warm-ups and fifteen observations. Lifecycle workloads used three warm-ups and
ten observations at 1,000 and 16,384 entities, and five observations at 60,000 entities. The JSON
records every raw observation, not only summaries.

Raw evidence:

- [`results/kernel-baseline.json`](./results/kernel-baseline.json)
- [`results/kernel-size.json`](./results/kernel-size.json)

## Behavioral baseline

The independent reference model and Koota adapter exposed three intentional differences between
Koota 0.6.5 and the Flatland contract:

1. Passing a partial initializer to a Koota object-backed trait replaces the factory result, so
   omitted defaults disappear. Flatland will merge the partial into a fresh factory result.
2. Koota changed-event queries do not enforce an ordinary required tag. The current routing query
   can therefore return an entity without `IsBatched`; later relation rejection happens to hide it.
   Flatland will filter required traits when the event is enqueued.
3. Adding and removing a trait before the first added-event drain loses the Koota added event.
   Flatland will preserve independent added and removed queues.

All three candidates exactly match the intended reference snapshot. The Koota deltas have explicit
tests so they cannot be mistaken for accidental incompatibilities during migration.

## Size baseline

| Artifact | Minified | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| Koota seven-import kernel | 34,910 B | 10,584 B | 9,362 B |
| Shared candidate superset, signature mode | 7,968 B | 2,953 B | 2,706 B |

The prototype result is conservative: the candidate artifact still contains the shared
benchmark-adapter shell and branches for all three query modes. Even that superset is 26,942 bytes
smaller minified, 7,631 bytes smaller gzip, and 6,656 bytes smaller Brotli than the exact Koota
import surface. It is below the isolated kernel caps of 12,000 / 4,000 / 3,800 bytes.

The specialized production kernel must be measured again. This isolated result does not substitute
for the required basic Three.js, basic React, stress, and dynamic-effect consumer attribution.

## Full microbenchmark summary

Times are milliseconds per sample. Lower is better.

| Workload | Koota median / p95 | Signature median / p95 | Median change |
| --- | ---: | ---: | ---: |
| Lifecycle, 1,000 | 1.753 / 1.966 | 1.233 / 1.623 | -29.7% |
| Lifecycle, 16,384 | 32.447 / 34.436 | 14.123 / 15.318 | -56.5% |
| Lifecycle, 60,000 | 124.565 / 130.210 | 53.413 / 56.195 | -57.1% |
| Stable query, 16.384M entity visits | 8.847 / 9.146 | 0.015 / 0.037 | -99.8% |
| Dynamic add/remove, 12,000 | 3.610 / 4.644 | 1.549 / 1.883 | -57.1% |
| Three routing writes, 12,000 | 4.224 / 4.743 | 1.294 / 1.373 | -69.4% |
| Exclusive assign/read/remove, 12,000 | 3.019 / 3.946 | 0.667 / 0.686 | -77.9% |

The direct-store loop showed a 26.5% slower signature median but an 8.7% better p95. After setup,
that loop performs only identical cached index and `number[]` operations—no adapter operation is in
the timed region—so the disagreement is classified as sub-millisecond process/JIT noise rather
than a kernel result. The end-to-end schedule gate remains authoritative.

## Candidate disposition

### Selected: signatures plus persistent views

The signature candidate is 16.7% faster than sparse-persistent at the 60,000-entity lifecycle and
10.9% faster for routing events while using 44.4% less active heap. Multiple 32-bit words support
dynamic effect traits without a fixed 32-trait ceiling.

### Rejected: sparse membership plus persistent views

This candidate is viable and remains the rollback design. It slightly wins structural churn and
exclusive assignment in this run, but those paths share the same event and direct-owner machinery;
the larger memory footprint and slower lifecycle make it the weaker overall kernel.

### Rejected: anchored scans

Anchored scans are small and fast under structural churn, but the unchanged 16,384-entity query
workload took 163.7 ms versus Koota's 8.8 ms. Recomputing intersections per frame is incompatible
with Flatland's stable sprite-wide queries.

## Next gate

Implement the selected private runtime without a production consumer, then run the same behavior
contract, compile-time inference tests, isolated production bundle budget, stale-handle tests,
world-disposal tests, and allocation checks. Only after that gate passes should core call sites move
off Koota.
