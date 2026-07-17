---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Registry checkpoint snapshots (flight recorder)

- `DebugRegistry` now periodically emits full checkpoint snapshots (`checkpoint: true` on `RegistryPayload`) so devtools time-travel reconstruction never replays further back than one cadence window
- Checkpoints that would degrade an entry to metadata-only (pool overflow) now retry and settle on `checkpoint: true, partial: true` instead of silently claiming a complete snapshot or starving forever

## Fixes

- Registry reconstruction now skips partial checkpoints as anchors, falling back to the nearest complete one; live client and reconstruction core share one fold function so they can't diverge
- Protocol-store ingest moved to dashboard bootstrap — persistence no longer depends on the Protocol Log panel being mounted or unpaused (Pause now only freezes that panel's own list)

A summary of underlying flight-recorder groundwork (rolling ring buffer, freeze/scrub playback, tighter VP9 keyframe cadence) lands alongside these registry changes to support scrub-through-time debugging.
