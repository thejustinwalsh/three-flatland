---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder: multi-buffer scrub, freeze, and checkpointed registry (#29 Phase C, epic #116)

- Added an always-on rolling ring buffer per encoded chunk stream plus a stats-arrival log, windowed by wall-clock time (10s chunks, 30s stats), with eviction that never drops past the newest keyframe still outside the window
- Freeze/unfreeze: freezing clones the ring and parks the frame cursor while live ingest keeps writing underneath; unfreeze is wired into every existing "go live" entry point (LIVE button, double-click, Esc)
- While frozen, the buffers panel decodes the frozen ring's keyframe-anchored chain through a dedicated scrub decoder instead of showing a "no playback yet" placeholder
- Generalized the buffers panel from single-buffer to multi-buffer: mark several buffers at once on a responsive grid (1/2/2x2/3x2/3x3) with per-cell decode and a soft GPU-cost guardrail past ~4 concurrent streams
- Registry panel gains multi-select via a pinned-tabs strip (Ctrl/Cmd-click to pin), reusing whole-registry reconstruction so every pinned entry stays scrub-consistent
- Registry checkpoint snapshots: periodic full re-sends of registry state so time-travel reconstruction never has to replay further back than one cadence window; reconstruction reads from the protocol store's persisted history instead of approximating from the nearest delta
- Added size-based IndexedDB quota and pruning to the protocol store (byte-budget policy via `navigator.storage.estimate()`, throttled oldest-first pruning that never touches a provider's pinned tail window, self-heal retry for under-delivered passes); `retainedRange()` now exposes what actually survives per provider

## Bug fixes

- Protocol-store ingest moved to dashboard bootstrap so persistence no longer depends on the Protocol Log panel's mount state or Pause toggle — Pause now only freezes that panel's own list
- `ProtocolStore` gains `addFlushListener`, firing after a write batch's IDB transaction commits, closing a race where parked registry reconstruction could re-query before the newest rows were durably queryable
- Fixed `frozenUnionFrameRange` (renamed `frozenClaimableFrameRange`) incorrectly unioning a marked buffer's narrow chunk range with the primary stats ring's wider range, letting the scrubber claim frames a buffer's own decode chain couldn't resolve
- `ScrubRequestTracker` replaces raw expected/received counters with a FIFO that correlates every decoder output back to its issuing request, fixing misattributed frames when a rapid cursor move queues a new keyframe chain before the previous one's outputs arrive
- Closed six adversarial-review gaps in the protocol store's quota pruning: per-provider tail windows now counted by retained ids (not a global id span), rolled-back in-memory accounting on failed write-batch commits, a one-shot timer to prune after a throttled burst goes quiet, `dispose()` to cancel timers and close the IDB connection, `statsFor().total` derived from actual retained ids, and safer `retainedRange().oldestFrame` recovery

### Summary

Completes the flight-recorder feature (#29 Phase C, epic #116): buffer ring/freeze/scrub playback, multi-buffer grid support, checkpointed registry reconstruction, and IndexedDB quota/pruning for the protocol store, along with a run of bug fixes closing races and edge cases found in adversarial review.
