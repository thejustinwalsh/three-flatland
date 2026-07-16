---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder — multi-buffer scrub playback (#29, epic #116)

- New always-on rolling ring buffer for encoded video chunks + stats arrivals, windowed by wall-clock time (10s chunks, 30s stats); chunk eviction never evicts past the newest keyframe still outside the window so a frozen snapshot can always decode from its own start
- Freeze/unfreeze: freezing clones the ring and parks the frame cursor while live ingest keeps writing underneath; unfreeze is wired into every existing "go live" affordance (LIVE button, double-click, Esc)
- Buffers panel now decodes actual frames while frozen via a dedicated scrub decoder, replacing the old "no playback yet" placeholder
- Generalized from single-buffer to multi-buffer: mark several buffers at once, laid out on a responsive grid (1/2/2x2/3x2/3x3) with a soft GPU-cost guardrail past ~4 concurrent streams; freeze clones every marked ring atomically
- Registry panel gains multi-select via a pinned-tabs strip (Ctrl/Cmd-click to pin), reusing whole-registry reconstruction so every pinned entry stays scrub-consistent while parked
- Registry feature now periodically emits full checkpoint snapshots so time-travel reconstruction never has to replay further back than one cadence window; a checkpoint that would otherwise degrade to metadata-only (pool overflow) retries instead of starving, settling on a partial-checkpoint state that reconstruction skips as an anchor
- Protocol store persistence moved to dashboard bootstrap, independent of the Protocol Log panel's mount/pause state
- Tightened VP9 encoder keyframe cadence from 2000ms to 500ms so a scrub cursor is never far from a decodable anchor

## Protocol store — size-based quota and pruning

- Added a byte-budget policy (`navigator.storage.estimate()`, capped and overridable, with a fixed fallback) and throttled oldest-first pruning so long dashboard sessions no longer grow IndexedDB storage unbounded
- `retainedRange()` exposes what actually survives per provider for honest scrubber bounds
- Added `dispose()` to cancel background timers and close the IDB connection cleanly
- Added `addFlushListener`, firing after a write batch's IDB transaction commits, so parked reconstructions re-query once new rows are durably queryable

## Fixes

- Fixed frozen claimable frame range: a single marked buffer with a narrow chunk window could be overridden by a much wider stats window, letting the scrubber claim frames a buffer could never resolve; the range is now the marked-buffer union intersected with the stats bound (`frozenClaimableFrameRange`, renamed from `frozenUnionFrameRange`)
- Fixed scrub decode output correlation: a rapid cursor move during a frozen scrub could let a superseded decode request's late output get drawn as the wrong frame; outputs are now tracked via a FIFO correlated to their originating request
- Fixed six quota-pruning edge cases: per-provider tail windows now pinned by each provider's own retained ids (not a global id span), in-memory accounting rolls back on failed writes, a one-shot timer catches throttled bursts followed by silence, `statsFor().total` derives from retained ids so it can't drift, and `retainedRange().oldestFrame` recovers from cache instead of pointing at a deleted row
- Registry reconstruction and the live client now share one fold function so they can't diverge

## Summary

Completes the devtools flight recorder (#29 Phase C, epic #116): multi-buffer scrub playback with a responsive grid, registry checkpointing and multi-select, and a size-bounded protocol store with several adversarial-review correctness fixes.
