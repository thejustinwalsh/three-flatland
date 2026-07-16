---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (Phase C)

- Adds periodic registry checkpoint snapshots so time-travel reconstruction never replays further back than one cadence window
- Adds an always-on rolling ring buffer for the selected buffer's encoded video chunks plus a windowed stats-arrival log, enabling scrub playback while frozen
- Freeze/unfreeze now clones the ring and parks the frame cursor without interrupting live ingest; all existing "go live" actions (LIVE button, double-click, Esc) unfreeze
- Tightens VP9 encoder keyframe cadence from 2000ms to 500ms so scrub cursors stay close to a decodable anchor
- Fixes a race where a registry checkpoint could get stuck claiming completeness after degrading an oversized entry to metadata-only; reconstruction now retries and correctly skips partial checkpoints when picking an anchor
- Fixes protocol-store persistence being tied to the Protocol Log panel's mount/pause state; ingest now runs unconditionally from dashboard bootstrap
- Adds a flush-listener hook so parked registry reconstruction re-queries once writes are durably committed, closing a debounce race

## Summary

Lays the groundwork for the devtools flight recorder: persistent protocol logging, rolling buffer playback, and consistent registry state reconstruction while frozen and scrubbing.
