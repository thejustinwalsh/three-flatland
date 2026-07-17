---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder support (devtools protocol)

- `DebugRegistry` now emits periodic checkpoint snapshots (`checkpoint: true` on `RegistryPayload`), so the devtools dashboard can reconstruct registry state at any point in time without replaying from the beginning
- Checkpoints that would otherwise overflow the entry pool degrade gracefully: an entry is marked metadata-only, retried a bounded number of times, then flagged `checkpoint: true, partial: true` instead of blocking forever
- Registry fold logic is now shared between the live client and reconstruction paths (`registry-delta.ts`), preventing the two from drifting apart
- Bus worker's VP9 encoder keyframe cadence tightened from 2000ms to 500ms, keeping scrub playback closer to a decodable anchor

### Summary
Lays the groundwork in the debug protocol and registry for the devtools flight recorder — checkpoint snapshots, safer overflow handling, and tighter keyframe cadence.
