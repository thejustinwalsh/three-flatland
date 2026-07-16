---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (debug protocol)

- Add registry checkpoint snapshots: periodic full re-sends of registry state (`checkpoint: true` on `RegistryPayload`) so time-travel reconstruction never replays further back than one cadence window.
- Fix checkpoints that had to degrade an entry to metadata-only (pool overflow): no longer falsely claim `checkpoint: true`; retry, then settle on `checkpoint: true, partial: true` instead of starving. Reconstruction skips partial checkpoints as anchors and falls back to the nearest complete one.
- Tighten VP9 encoder keyframe cadence from 2000ms to 500ms so scrub playback is never far from a decodable anchor.

## Bug fixes

- Share one fold function between the live client and reconstruction core for registry deltas, preventing divergence between them.

## Summary

Adds checkpoint-based registry snapshots and hardens the flight-recorder's debug protocol against partial-checkpoint and keyframe-cadence edge cases.
