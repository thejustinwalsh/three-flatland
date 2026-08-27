# Trusted Node renderer timing

Status: **accepted supporting evidence**

Capture date: 2026-08-24

Baseline source: `7faf7f400a20741f9686bd15a3e9a0652c4c15fd`

Release candidate: `c25f74c3e37bb9b521d416a81d749c925df00df2`

Raw evidence: [`renderer-labs-evidence.tar.gz`](./renderer-labs-evidence.tar.gz)

Archive SHA-256: `6c1734a613ff20078e080d3a208339b4f26d181e1dd76ec80de310a94670b6ba`

## Verdict

The trusted `@pmndrs/labs` 0.6.0 production comparison does not establish a renderer regression.
The tighter 60,000-sprite pair used adaptive 0.5% confidence sampling, at least five seconds of CPU
time and 100 samples per case, inner garbage collection, stable clocks, Mann-Whitney U, a 3%
practical-delta threshold, and a Cliff's d threshold of 0.474.

| Case                       | Baseline p50 | Candidate p50 | Delta | Labs verdict | Effective noise |
| -------------------------- | -----------: | ------------: | ----: | ------------ | --------------: |
| Static, 60,000             |     31.48 ms |      31.74 ms | +0.8% | neutral      |             ±8% |
| Moving alpha/depth, 60,000 |     33.15 ms |      32.05 ms | −3.3% | neutral      |            ±11% |

Both CPUs remained near 4.00–4.03 GHz and every retained observation passed Labs' stability checks.
An earlier broad pair reported nominal +13.0% and +9.4% movements, but reversing execution order
reduced them to roughly +5% and +8% and classified every case as neutral. The tighter pair therefore
supersedes the hand-rolled Node timing warning.

## Scope

The timed callback contains only `SpriteGroup.update()`. Fixture creation, initial assignment,
assertions, and next-frame mutation remain outside the measurement. The six production workloads
cover static, moving, transparent sort, and routing scenes at 16,384 sprites, plus static and moving
scenes at 60,000 sprites.

The custom renderer evidence remains authoritative for deterministic topology, packed ownership,
memory/GC cycles, and per-system attribution. Its instrumented wall-time medians are diagnostic, not
the release timing verdict. The headed browser matrix remains the end-to-end ordinary-production
gate.

## Retained diagnosis

The raw archive includes an intentionally rejected external optimization candidate and a lookup
microbenchmark. A private `WeakMap` ownership read costs about 0.48 ms per 60,000 lookups on this
host, but the whole-frame candidate run had 5.1% CPU-frequency drift and is not merge evidence. No
runtime optimization was taken from that rejected run.

The private benchmark package now pins Labs and provides non-cacheable smoke, save, baseline, and
compare targets. CI verifies the fixture, types, and Labs CLI contract; controlled same-host saved
comparisons remain release evidence rather than a shared-runner timing gate.
