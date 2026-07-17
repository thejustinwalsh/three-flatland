---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (Phase C, epic #116)

New always-on recording and time-travel debugging for the devtools dashboard:

- Rolling ring buffer records each buffer's encoded video chunks and stats arrivals on a wall-clock window (10s chunks, 30s stats), evicting oldest data first while always preserving the newest keyframe so a frozen snapshot can decode from its own start
- Freeze/unfreeze scrubbing: freezing clones the ring and parks the frame cursor while live ingest keeps writing underneath; unfreeze is wired into every existing "go live" action (LIVE button, double-click, Esc)
- Buffers panel decodes the frozen ring's keyframe-anchored chain for the scrubbed frame instead of showing "no playback yet"
- Multi-buffer support: mark several buffers at once, laid out on a responsive grid (1 / 2 / 2x2 / 3x2 / 3x3) with per-cell decode and a soft guardrail past ~4 concurrent streams
- Registry panel gains multi-select via pinned tabs (Ctrl/Cmd-click), reconstructing every pinned entry consistently while parked
- Registry now emits periodic full checkpoint snapshots (`checkpoint: true`) so time-travel reconstruction never replays further back than one cadence window; partial checkpoints (from pool overflow) are retried and skipped as anchors in favor of the nearest complete one
- Protocol store adds size-based IndexedDB quota + pruning (byte-budget policy via `navigator.storage.estimate()`, throttled oldest-first eviction that never touches a provider's pinned tail window) so long dashboard sessions no longer grow the store unbounded
- VP9 encoder keyframe cadence tightened from 2000ms to 500ms so a scrub cursor is never far from a decodable anchor

## Fixes

- Frozen scrubber range is now correctly intersected (not unioned) against the stats ring's bounds, so a narrow marked-buffer window can no longer be overridden by a wider stats window and claim frames that buffer can't decode
- Scrub decode outputs are now correlated to their originating request via a FIFO tracker, preventing a superseded request's late output from being drawn as the wrong frame during rapid cursor moves
- Protocol-store quota pruning: per-provider tail windows are now sized by each provider's own retained id count rather than a shared global id span; in-memory accounting rolls back on failed writes; a one-shot timer ensures a throttled prune still runs after a burst; `dispose()` closes the IDB connection and cancels timers; `retainedRange()` no longer points at deleted rows
- Protocol-store ingest moved to dashboard bootstrap so persistence no longer depends on the Protocol Log panel being mounted or unpaused
- `ProtocolStore` adds `addFlushListener`, firing after a write batch commits, so the registry panel's parked reconstruction re-queries once new rows are durably queryable instead of racing a debounce

This release completes the flight recorder's core feature set: continuous recording, freeze/scrub playback, multi-buffer and multi-registry review, and durable, bounded persistence for long dashboard sessions.
