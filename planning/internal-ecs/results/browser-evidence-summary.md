# Final headed browser evidence

Status: **accepted final capture**

Capture date: 2026-08-24

Release source: `6a11576769772223146228b4e799c178eb173d71`

Historical base: `c0441b6fab15b918217a8f5587b8078541fd7b1d`

Raw evidence: [`browser-evidence.tar.gz`](./browser-evidence.tar.gz)

Archive SHA-256: `26c655ff12cc3b6afc4f9d214636f2a5f1c40441e1668239e7c9319b21d8a212`

## Validation

The archive contains exactly 24 complete headed Chrome reports: 12 ordinary-production reports and
12 profile-build reports. An independent post-capture validator checked all 1,038 observations:

- schema v4 and `complete: true`;
- exact base and release revisions in the report, targets, served builds, and observations;
- clean source and fixture-source parity;
- Chrome 151 on the same Apple/metal-3 adapter for both targets;
- 180 warm-up frames, 600 sampled RAF intervals, and three samples per load;
- zero harness failures and zero browser diagnostics;
- production builds contain no ECS timing markers;
- profile builds contain `ecs:run` and every expected system marker exactly 601 times per observation;
- devtools are disabled in both modes.

Two Chrome processes exceeded the 120-second close deadline during saturated profile captures. Each
incomplete attempt was preserved outside the authoritative archive, the runner backed off for 60
seconds, and the complete report was recaptured from the beginning. Neither retry recorded a browser
diagnostic or runtime failure.

## Production Knightmark

The crossover is the largest load with pooled late RAF callbacks at or below 5%. An interval above
25.0005 ms is late. Refinement uses 1,000-sprite steps around the first failing coarse band.

| Variant  | Collisions | Base largest pass | Release largest pass |    Change | 40k median late callbacks |
| -------- | ---------: | ----------------: | -------------------: | --------: | ------------------------: |
| Three.js |        off |       33k (0.83%) |          34k (0.83%) |       +1k |           20.33% → 16.83% |
| Three.js |         on |       28k (2.56%) |          28k (3.06%) | preserved |           48.17% → 43.83% |
| React    |        off |       33k (3.22%) |          33k (3.61%) | preserved |           20.67% → 21.67% |
| React    |         on |       27k (3.67%) |          27k (2.22%) | preserved |           51.83% → 48.50% |

The ordinary-production merge verdict is therefore one refined +1k gain, three preserved refined
crossovers, and no Knightmark regression.

## Production lighting

Lighting uses 10k-wide high-load steps. The largest measured passing load is a coarse lower-bound
bracket, not an exact crossover or a percentage-speed claim.

| Variant  | Lights | Base largest measured pass | Release largest measured pass | 20k pooled late | 30k median late | 40k median late |
| -------- | -----: | -------------------------: | ----------------------------: | --------------: | --------------: | --------------: |
| Three.js |      0 |                        20k |                           20k |   0.06% → 0.00% | 44.67% → 31.50% | 90.33% → 73.50% |
| Three.js |      1 |                        20k |                           20k |   0.06% → 0.00% | 44.17% → 32.17% | 91.00% → 73.83% |
| React    |      0 |                        10k |                           20k |   9.17% → 0.00% | 60.33% → 37.00% | 99.67% → 76.67% |
| React    |      1 |                        10k |                           20k |   8.72% → 0.00% | 61.67% → 36.67% | 99.50% → 75.83% |

Both Three.js fixtures remain in the same 20k–30k bracket while reducing high-load missed cadence.
Both React fixtures move from the 10k–20k bracket to the 20k–30k bracket.

## Profile diagnostics

Profile builds are diagnostic and are not the ordinary-production merge verdict. The separate
`ecs:run` crossover is the largest load whose pooled nearest-rank p95 is at or below 16.667 ms.

| Fixture                             | Base `ecs:run` pass | Release `ecs:run` pass | 40k p95 base → release |
| ----------------------------------- | ------------------: | ---------------------: | ---------------------: |
| Three.js Knightmark, collisions off |                 40k |                    50k |     12.600 → 12.400 ms |
| Three.js Knightmark, collisions on  |                 50k |                    50k |     11.400 → 11.100 ms |
| React Knightmark, collisions off    |                 50k |                    50k |     13.200 → 13.100 ms |
| React Knightmark, collisions on     |                 50k |                    50k |     12.400 → 12.000 ms |
| Three.js lighting, 0 lights         |                 20k |                    30k |     24.700 → 22.100 ms |
| Three.js lighting, 1 light          |                 20k |                    20k |     24.800 → 22.200 ms |
| React lighting, 0 lights            |                 20k |                    20k |     26.300 → 21.700 ms |
| React lighting, 1 light             |                 20k |                    20k |     26.200 → 21.600 ms |

Profile RAF cadence contains two retained non-monotonic host outliers. Three.js Knightmark with
collisions passes 29k on the base at exactly 5.00% and 28k on the release before failing 29k at
5.28%. Three.js lighting with one light has two 0% release samples at 20k and one 15.5% sample,
producing a pooled 5.17%. Adjacent loads, the production matrix, and the pooled `ecs:run` diagnostic
do not establish a production regression. The raw samples remain in the archive.

## Scope

RAF callback cadence is a browser main-thread signal. It does not prove GPU completion, confirmed
presentation timing, or end-to-end input latency. Ordinary production evidence decides the release;
profile markers explain system cost. The frozen source, fixture hashes, adapter identity, raw 600-frame
intervals, heap boundaries, long tasks, simulation counts, and marker samples remain available in the
archive for independent review.
