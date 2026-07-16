---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder — core registry checkpointing

- Registry feature now periodically emits full checkpoint snapshots (`checkpoint: true` on `RegistryPayload`), so time-travel reconstruction never has to replay further back than one cadence window
- Buffer encoder tightens keyframe cadence from 2000ms to 500ms so a scrub cursor is never far from a decodable anchor
- Checkpoints that would otherwise degrade an entry to metadata-only (pool overflow) now retry, settling on `checkpoint: true, partial: true` instead of never completing; reconstruction skips partial checkpoints and falls back to the nearest complete one
- Registry reconstruction and the live client now share a single fold function, preventing the two from drifting apart

## Fixes

- `DebugRegistry` protocol payloads gain checkpoint metadata used by both live updates and historical reconstruction

## Summary

Lays the debug-protocol groundwork for the devtools flight recorder: periodic registry checkpoints with partial-checkpoint retry/fallback, and a fold function shared between live and replayed registry state.
