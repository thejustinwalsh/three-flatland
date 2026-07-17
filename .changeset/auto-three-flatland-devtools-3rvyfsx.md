---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (epic #116, #29 Phase C)

Multi-slice feature adding time-travel debugging to the devtools dashboard: freeze the live stream, scrub back through recorded frames, and replay decoded buffer video and registry state at any point.

- **Ring buffer + scrub playback**: always-on rolling ring of encoded chunks (10s window) and stats (30s window) per buffer. Freeze clones the ring and parks the frame cursor while live ingest keeps writing underneath; unfreeze works from any existing "go live" entry point (LIVE button, double-click, Esc). While frozen, the buffers panel decodes real frames from the ring via a dedicated scrub decoder. VP9 keyframe cadence tightened from 2000ms to 500ms so the scrub cursor is always near a decodable anchor.
- **Registry checkpoint snapshots**: periodic full re-sends of registry state (`checkpoint: true`) so reconstructing state at a parked frame never has to replay further back than one cadence window. The registry panel reconstructs from the nearest checkpoint plus forward deltas instead of approximating from the nearest delta.
- **Multi-buffer grid + multi-select registry (slice 4)**: buffers panel supports marking several buffers at once on a responsive grid layout (1/2/2x2/3x2/3x3) with per-cell decode and a GPU-cost guardrail past ~4 concurrent streams. Registry panel supports multi-select via a pinned-tabs strip (Ctrl/Cmd-click to pin), reusing the existing reconstruction so every pinned entry stays scrub-consistent.
- **Size-based IDB quota + pruning**: the protocol store now enforces a byte budget (via `navigator.storage.estimate()`, capped/overridable) with throttled oldest-first pruning that never touches a provider's pinned tail window, plus a self-heal retry for passes that under-deliver. `retainedRange()` exposes what actually survives per provider so the scrubber has an honest claimable range.

## Fixes

- Scrub decode outputs are now correlated to the request that issued them (`ScrubRequestTracker`), preventing a superseded request's late output from being drawn as the wrong frame during rapid cursor movement.
- Frozen claimable frame range is now correctly intersected against the primary stats ring instead of unioned away — a narrow marked-buffer chunk window could previously be overridden by a much wider stats window, letting the scrubber claim frames that couldn't actually be decoded.
- Protocol store quota pruning: per-provider tail windows are now pinned by each provider's own retained id count (not a shared global id span), in-memory accounting rolls back on failed writes, a one-shot timer catches bursts followed by silence, `dispose()` cleans up timers/IDB connections, and `retainedRange().oldestFrame` recovers correctly when a prune pass stops early.
- Protocol-store persistence now runs unconditionally at dashboard bootstrap rather than depending on the Protocol Log panel's mount/pause state; a registry checkpoint that would degrade to metadata-only now retries and settles as a partial checkpoint instead of never completing; live client and reconstruction logic share one fold function to prevent drift.

This release delivers the full flight-recorder feature set (record, freeze, scrub, multi-buffer/multi-registry playback) along with the quota management and correctness fixes needed to make it reliable under sustained sessions.
