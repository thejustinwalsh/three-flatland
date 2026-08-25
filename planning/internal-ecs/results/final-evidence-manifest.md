# Final internal ECS evidence manifest

Status: **accepted**

Review date: 2026-08-24

## Koota lineage

[Koota](https://github.com/pmndrs/koota) made this renderer design possible. Its typed traits,
structure-of-arrays storage, queries, and systems are the foundation from which Flatland's narrow
renderer-owned specialization grew. The private runtime does not supersede Koota; Koota remains the
recommended general-purpose ECS for application and gameplay state.

## Source boundaries

| Evidence                                      | Source revision                            | Scope                                                                                           |
| --------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Foundational kernel, size, capacity, renderer | `c25f74c3e37bb9b521d416a81d749c925df00df2` | Private-runtime migration, topology, ownership, memory, and capacity evidence                   |
| Headed foundational browser matrix            | `6a11576769772223146228b4e799c178eb173d71` | Same foundational runtime plus private benchmark tooling and accepted budget provenance         |
| Post-migration conversion comparisons         | Multiple clean revisions, named in archive | Baseline/candidate Labs captures for animation, tile animation, lighting, and hierarchy         |
| Converted runtime and consumer candidate      | `00206b54ff592329c0bafc3682a5016b689f40c0` | All five follow-up conversions, final size accounting, and clean accepted-current bundle maxima |
| Converted-runtime acceptance rerun            | `969b677d9eacf050a677a565f0bf2199275acf13` | Zero-delta consumer rerun plus package, declaration, benchmark, and evidence-integrity gates    |
| Interactive example walkthrough               | `c7b55928bb9a035ebc301d14aaf4e80beb2eef78` | Full interaction walkthrough for all 28 Three, React, and starter surfaces                      |
| Converted-surface live recertification        | `158e510065908aec3836e4076f1f68c82c232bc1` | All 28 surfaces relaunched and visually inspected after every follow-up conversion              |
| Browser historical base                       | `c0441b6fab15b918217a8f5587b8078541fd7b1d` | Pre-migration runtime with byte-identical benchmark fixtures                                    |

The foundational Node and browser artifacts remain the decision record for the private kernel,
capacity, topology, ownership, and migration-wide end-to-end comparison. Later source commits do
change the published runtime: they consolidate pass ownership and add the accepted animation, tile,
lighting, and hierarchy projections. Those follow-ups are supported by their clean Labs captures,
focused lifecycle and GPU-row tests, final package/consumer gates, and the converted-surface live
recertification. The manifest deliberately does not present the earlier renderer timing artifact as
a measurement of code that landed afterward.

## Checksums

| Artifact                              | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `kernel-baseline.json`                | `d212bcc81421f93018387e656da35746658d655997d8a3e40fabdfa1788e8251` |
| `kernel-size.json`                    | `b7267d61500829391861f024b082fb419080c126f74b8cdbbf03c51fb0cdefb8` |
| `expected-sprites.json`               | `84fe6cde3cd1dcb9eb6917bb736bc53bef876679a3f3acb7ac49eec8ffa03ed2` |
| `renderer-production.json`            | `5efcbc5e08efdab0862d06a352ba1fb2eabfc1200f17f90637e3cb538fb35c63` |
| `consumer-bundle-budget.json`         | `a04d4d3465f171deb2f054272646d0fb79947110744d1368e08b2abcde371ff4` |
| `renderer-labs-evidence.tar.gz`       | `6c1734a613ff20078e080d3a208339b4f26d181e1dd76ec80de310a94670b6ba` |
| `browser-evidence.tar.gz`             | `26c655ff12cc3b6afc4f9d214636f2a5f1c40441e1668239e7c9319b21d8a212` |
| `example-smoke-evidence.tar.gz`       | `6406f7bf72285bdde68d0d39d6c0b9445d04d4b7f4b382533f12ed9d801be903` |
| `conversion-labs-evidence.tar.gz`     | `30db1780e3802c967e3bd22360aec0f1b8b17f8e15f815892ddcdd7ffd3efa99` |
| `current-example-render-smoke.tar.gz` | `7b2a7aa6576396fb06c3a56becf0cc32ca7c2686942647833ea488187a39a7dd` |

## Acceptance boundaries

- Kernel medians, heap, and isolated size establish the private runtime decision.
- `expected-sprites.json` establishes bounded planning-hint allocation and reuse.
- `renderer-production.json` establishes deterministic topology, ownership, memory/GC, and
  per-system attribution. Its embedded `measured-unreviewed` label is generator state; the decision
  record provides the independent acceptance.
- The Labs archive establishes the controlled-host Node timing verdict. Shared CI runs only smoke
  the fixture and CLI contract.
- The conversion Labs archive preserves every clean baseline, rejected animation SoA prototype,
  intermediate animation/hierarchy candidate, and accepted animation, tile, lighting, and hierarchy
  comparison. Each JSON embeds its exact source revision, clean-tree state, Labs version, lockfile,
  configuration, fixture, runner, hardware, raw samples, and stability verdict.
- The browser archive establishes the ordinary-production end-to-end timing verdict and retains the
  separate profile diagnostics.
- The example-smoke archive establishes live final-head behavior and reviewed visual output for all
  28 application surfaces, including the two starters. The converted-surface archive provides the
  final post-conversion render recertification for the same 28 surfaces.
- The consumer artifact is the reviewed absolute budget captured at `00206b54`. Its clean second
  capture at `969b677d` reproduced zero deltas across all fixtures.
