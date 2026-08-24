# Final internal ECS evidence manifest

Status: **accepted**

Review date: 2026-08-24

## Source boundaries

| Evidence                              | Source revision                            | Scope                                                                                  |
| ------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Kernel, size, capacity, Node renderer | `c25f74c3e37bb9b521d416a81d749c925df00df2` | Frozen production runtime and release metadata                                         |
| Consumer budget                       | `24a74640673cf55cdda85e024968897b5598b11e` | Same production source with the final pinned Labs lockfile                             |
| Headed browser matrix                 | `6a11576769772223146228b4e799c178eb173d71` | Same production source plus private benchmark tooling and accepted budget provenance   |
| Final example walkthrough             | `c7b55928bb9a035ebc301d14aaf4e80beb2eef78` | All 28 Three, React, and starter surfaces after evidence/documentation synchronization |
| Browser historical base               | `c0441b6fab15b918217a8f5587b8078541fd7b1d` | Pre-migration runtime with byte-identical benchmark fixtures                           |

The commits after `c25f74c3` change only private benchmark tooling and evidence provenance. They do not
change the published `three-flatland` runtime used by the Node or browser fixtures.

## Checksums

| Artifact                        | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `kernel-baseline.json`          | `d212bcc81421f93018387e656da35746658d655997d8a3e40fabdfa1788e8251` |
| `kernel-size.json`              | `b7267d61500829391861f024b082fb419080c126f74b8cdbbf03c51fb0cdefb8` |
| `expected-sprites.json`         | `84fe6cde3cd1dcb9eb6917bb736bc53bef876679a3f3acb7ac49eec8ffa03ed2` |
| `renderer-production.json`      | `5efcbc5e08efdab0862d06a352ba1fb2eabfc1200f17f90637e3cb538fb35c63` |
| `consumer-bundle-budget.json`   | `abcc38a6171565f25e1d532fe6930b063b45f242a2d1dadcbd752767e4c3395d` |
| `renderer-labs-evidence.tar.gz` | `6c1734a613ff20078e080d3a208339b4f26d181e1dd76ec80de310a94670b6ba` |
| `browser-evidence.tar.gz`       | `26c655ff12cc3b6afc4f9d214636f2a5f1c40441e1668239e7c9319b21d8a212` |
| `example-smoke-evidence.tar.gz` | `6406f7bf72285bdde68d0d39d6c0b9445d04d4b7f4b382533f12ed9d801be903` |

## Acceptance boundaries

- Kernel medians, heap, and isolated size establish the private runtime decision.
- `expected-sprites.json` establishes bounded planning-hint allocation and reuse.
- `renderer-production.json` establishes deterministic topology, ownership, memory/GC, and
  per-system attribution. Its embedded `measured-unreviewed` label is generator state; the decision
  record provides the independent acceptance.
- The Labs archive establishes the controlled-host Node timing verdict. Shared CI runs only smoke
  the fixture and CLI contract.
- The browser archive establishes the ordinary-production end-to-end timing verdict and retains the
  separate profile diagnostics.
- The example-smoke archive establishes live final-head behavior and reviewed visual output for all
  28 application surfaces, including the two starters.
- The consumer artifact is the reviewed absolute budget. Its clean second capture reproduced zero
  deltas across all fixtures.
