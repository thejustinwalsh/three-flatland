---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (dashboard) — freeze, scrub, checkpoints (#29, epic #116)

- Freeze/live toggle with a rolling ring of encoded chunks + stats (10s/30s windows), scrubbing decodes the frozen ring's keyframe-anchored chain instead of showing a "no playback yet" notice
- Multi-buffer support: mark several buffers at once, responsive grid layout (1/2/2x2/3x2/3x3) with per-cell decode and a soft guardrail past ~4 concurrent streams
- Registry panel: multi-select via pinned-tabs strip (Ctrl/Cmd-click), periodic checkpoint snapshots so time-travel reconstruction never replays past one cadence window
- Protocol store persists to IndexedDB unconditionally at dashboard bootstrap (no longer tied to the Protocol Log panel's mount/pause state)
- VP9 encoder keyframe cadence tightened from 2000ms to 500ms so scrub cursors stay near a decodable anchor

## Protocol store: size-based quota + pruning

- Byte-budget policy (via `navigator.storage.estimate()`, capped/overridable) with throttled oldest-first pruning; pinned per-provider tail window is never evicted
- `retainedRange()` reports what's actually retained per provider; `addFlushListener` fires after a write batch durably commits
- `dispose()` cancels background timers and closes the IDB connection

## Fixes

- Frozen scrubber range: fixed `frozenClaimableFrameRange` (renamed from `frozenUnionFrameRange`) to intersect marked buffers' chunk ranges with the stats ring instead of unioning them, so the slider can no longer claim frames a buffer can't decode
- Scrub decode outputs are now correlated to their originating request via a FIFO tracker, preventing a superseded request's late output from being drawn as the wrong frame during rapid cursor moves
- Registry checkpoints that would degrade to metadata-only now retry with a bounded attempt count before falling back to `partial: true`, instead of starving forever; reconstruction skips partial checkpoints as anchors
- Protocol store quota pruning: per-provider tail window now counted by retained ids (not a global id span), in-memory counters roll back on failed writes, a one-shot timer catches throttled bursts, and `retainedRange().oldestFrame` recovers correctly when a prune pass stops early

## Summary
Ships the devtools flight recorder (freeze/scrub playback, multi-buffer grid, registry checkpoints, size-bounded protocol-store persistence) along with a round of adversarial-review fixes covering scrub-range correctness, request/output correlation, checkpoint reliability, and quota-pruning accounting.
