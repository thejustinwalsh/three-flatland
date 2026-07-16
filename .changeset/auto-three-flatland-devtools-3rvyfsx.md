---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (Phase C, epic #116)

- Adds a size-based IndexedDB quota + pruning policy for the protocol store, so a long dashboard session no longer grows storage unbounded; pruning is throttled, oldest-first, and never touches a provider's pinned tail window
- Adds an always-on rolling ring buffer for encoded buffer chunks plus a windowed stats-arrival log; freeze clones the ring and parks the cursor, enabling scrub playback while frozen without interrupting live ingest
- Tightens VP9 encoder keyframe cadence from 2000ms to 500ms so a scrub cursor is always near a decodable anchor
- Adds periodic registry checkpoint snapshots so time-travel reconstruction never replays further back than one cadence window
- Generalizes the flight recorder to multi-buffer: buffers panel supports marking multiple buffers with a responsive grid layout (1/2/2x2/3x2/3x3) and a soft GPU-cost guardrail past ~4 concurrent streams; registry panel gains multi-select via pinned tabs (Ctrl/Cmd-click)

## Fixes

- Fixes the frozen scrubber's claimable frame range being incorrectly widened by a union with the stats ring instead of intersected, which could let the slider claim frames a buffer couldn't actually decode
- Fixes out-of-order scrub decode outputs during rapid cursor movement by correlating each decoded frame to the request that issued it (FIFO tracking) instead of a raw counter
- Fixes six protocol-store quota/pruning issues: per-provider tail windows are now pinned by retained id count (not a global id span), in-memory accounting rolls back on failed writes, a one-shot timer arms pruning after a throttled burst, `dispose()` cleans up timers/connections, `total` is derived from retained ids instead of drifting, and `retainedRange().oldestFrame` recovers correctly when a prune stops early
- Fixes a registry checkpoint edge case where an entry degraded to metadata-only (pool overflow) could get permanently stuck; it now retries and marks itself `partial` so reconstruction can skip it and fall back to the nearest complete checkpoint
- Fixes protocol-store persistence being an implicit side effect of the Protocol Log panel's mount/pause state; ingest now runs unconditionally from dashboard bootstrap
- Adds a flush-listener so parked registry reconstruction re-queries once a write batch is durably committed, closing a debounce race against fresh data

## Summary

Completes the devtools flight recorder: persistent, quota-bounded protocol logging, multi-buffer ring recording with scrub playback, and consistent registry reconstruction while frozen.
