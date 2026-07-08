---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (Phase C) support

- Added `checkpoint`/`partial` flags to `RegistryPayload` and `DebugRegistry` so the devtools dashboard can periodically re-send full registry snapshots instead of only incremental deltas
- Registry checkpoints that would otherwise degrade an oversized entry to metadata-only no longer falsely claim `checkpoint: true` — they retry and mark `partial: true` once bounded retries are exhausted, so time-travel reconstruction can skip partial anchors and fall back to the nearest complete one
- Tightened the VP9 encoder's keyframe cadence from 2000ms to 500ms in `bus-worker.ts` so a frozen buffer scrub cursor is never far from a decodable keyframe
- Exported a shared registry-delta fold function so the live client and the devtools reconstruction core apply deltas identically and can't diverge

### Summary

Lays the groundwork in `three-flatland`'s debug protocol and registry for the devtools flight recorder: checkpointed registry snapshots, safer partial-checkpoint handling, and a tighter keyframe cadence for scrub playback.
