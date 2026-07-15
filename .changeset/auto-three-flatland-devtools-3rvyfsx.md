---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder — multi-buffer playback, registry checkpoints, and quota pruning (#29 Phase C, epic #116)

### Multi-buffer recording and playback (slice 4)
- Buffers panel now supports marking and viewing several buffers at once on a responsive grid (1 / 2 / 2x2 / 3x2 / 3x3), with a soft guardrail past ~4 concurrent decode streams.
- Registry panel gains multi-select via a pinned-tabs strip (Ctrl/Cmd-click to pin), reusing the existing reconstruction so every pinned entry stays scrub-consistent while parked.
- Fixed: the frozen scrubber's claimable range is now the intersection of marked buffers' chunk ranges with the primary stats ring, instead of unioning them — previously a narrow buffer window could get overridden by a wider stats window, letting the slider claim frames a buffer couldn't actually decode.
- Fixed: rapid cursor moves while frozen could show the wrong decoded frame because async decoder outputs from a superseded scrub request could satisfy a newer request's expected count. Outputs are now correlated back to the request that issued them via a FIFO tracker.

### Registry checkpoint snapshots (slice 3)
- Registry payloads now periodically re-send every registered entry as a full checkpoint (`RegistryPayload.checkpoint: true`, additive), bounding how far time-travel reconstruction has to replay.
- Fixed: a checkpoint that had to degrade an entry to metadata-only no longer falsely claims completeness — it retries and marks itself `partial: true`; reconstruction skips partials and falls back to the nearest complete checkpoint.
- Fixed: protocol log persistence no longer depends on the Protocol Log panel's mount/pause state — it's unconditional at dashboard bootstrap.
- Fixed: registry reconstruction re-queries once a write batch actually commits, closing a race where a debounce could fire before the newest rows were durably queryable.

### Ring buffer, freeze, and scrub playback (slice 2)
- Added an always-on rolling ring buffer for the selected buffer's encoded chunks and stats, windowed by wall-clock time, so freezing always has a decodable start point.
- Tightened the VP9 encoder keyframe cadence from 2000ms to 500ms so a scrub cursor is never far from a decodable frame.

### Protocol store quota and pruning
- Added a byte-budget policy and throttled oldest-first pruning for the IndexedDB-backed protocol store, so long dashboard sessions no longer grow storage unbounded.
- `retainedRange()` reports what actually survives per provider, giving the scrubber an honest claimable range.
- Fixed six issues in the pruning pass: per-provider tail windows are now pinned by actual retained row counts (not a global id span), in-memory counters roll back on failed writes, a one-shot timer catches throttled bursts followed by silence, `dispose()` cleanly cancels timers and closes the IDB connection, `total` stats are derived from retained ids instead of tracked separately, and `retainedRange().oldestFrame` recovers correctly when a prune pass stops early.

Delivers the full flight-recorder feature set for the devtools dashboard: multi-buffer scrub playback, registry time-travel, and bounded storage growth. No breaking changes.
