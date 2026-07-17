---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146


## Changes

- Registry checkpoint snapshots: the debug registry protocol now periodically emits a full-state `checkpoint: true` snapshot in addition to incremental deltas, so time-travel/reconstruction of registry state never has to replay further back than one checkpoint cadence window
- Checkpoints that must degrade an oversized entry to metadata-only no longer falsely claim to be complete — they retry, and settle on a `checkpoint: true, partial: true` state that reconstruction skips as an anchor, falling back to the nearest complete checkpoint
- Registry delta application (adding/removing/updating entries) is now shared between the live client and the reconstruction path via a single fold function, so the two can't drift apart
- Buffer bus worker: tightened the VP9 encoder's keyframe cadence from 2000ms to 500ms so a frozen scrub cursor is never far from a decodable keyframe anchor

## Summary

Backs the devtools flight recorder (checkpoint snapshots + tighter keyframe cadence) with protocol- and registry-level changes that make paused/scrubbed reconstruction reliable and race-free.
