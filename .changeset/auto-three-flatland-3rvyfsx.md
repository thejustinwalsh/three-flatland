---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

Debug-protocol and registry changes powering the new devtools flight recorder:

- `RegistryPayload` gains periodic full checkpoints (`checkpoint: true`) so devtools time-travel reconstruction never has to replay further back than one cadence window
- Checkpoints that must degrade an entry to metadata-only (pool overflow) no longer falsely report as complete — they retry and settle as `partial: true` instead of starving on an oversized entry
- `bus-worker.ts` tightens the VP9 encoder's keyframe cadence from 2000ms to 500ms so a scrub cursor is never far from a decodable anchor, and adds the encoded-chunk stream the flight recorder's ring buffer consumes

Summary: extends `DebugRegistry`/`debug-protocol` with checkpointing and faster keyframe cadence to support devtools' new flight-recorder (record/freeze/scrub) feature.
