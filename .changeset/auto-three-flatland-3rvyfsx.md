---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder registry checkpoints

- Registry feature now emits periodic full-state checkpoints (`checkpoint: true`) so time-travel reconstruction never has to replay further back than one cadence window.
- `DebugRegistry` and `DevtoolsProvider` gain the checkpoint plumbing needed to support scrub/reconstruction in the devtools dashboard.
- Checkpoints that had to degrade an entry to metadata-only (pool overflow) no longer falsely claim to be complete — they retry and, if still oversized, settle on a `partial: true` checkpoint that reconstruction correctly skips as an anchor.

## Flight recorder ring buffer, freeze, and scrub playback

- `debug/bus-worker.ts`: tightened the VP9 encoder's keyframe cadence from 2000ms to 500ms so a scrub cursor is always near a decodable anchor.

## Summary

Backing changes in `three-flatland` core (`DebugRegistry`, `DevtoolsProvider`, `debug-protocol`, `bus-worker`) that support the devtools dashboard's new flight-recorder checkpoint/scrub/freeze features — see `@three-flatland/devtools` for the full feature changelog.
