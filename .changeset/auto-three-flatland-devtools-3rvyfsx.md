---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146


## Changes

**Flight recorder (new)** — pause the live dashboard, scrub back through recent history, and replay decoded buffer frames:

- Protocol log persistence now runs unconditionally at dashboard bootstrap, independent of any panel's mount state or Pause toggle — Pause only freezes that panel's own list, not the underlying record
- Size-based IndexedDB quota + pruning for the protocol store: a byte budget (via `navigator.storage.estimate()`, capped/overridable, with a fixed fallback) with throttled oldest-first pruning that never touches a provider's pinned tail window; `retainedRange()` exposes what actually survives per provider
- Rolling ring buffer for encoded buffer chunks + a stats-arrival log, windowed by wall-clock time (10s chunks, 30s stats), with eviction that never removes the newest keyframe still inside the window
- Freeze/unfreeze: freezing clones the ring and parks the frame cursor while live ingest continues underneath; unfreeze is wired into every existing "go live" action (LIVE button, double-click, Esc)
- While frozen, the buffers panel decodes the ring's keyframe-anchored chain for the parked cursor frame via a dedicated scrub decoder, replacing the old "no playback yet" placeholder with an actual frame
- Registry checkpoint snapshots: periodic full-state resends so reconstructing registry state at a parked frame only has to replay from the nearest checkpoint, not from the start of history
- Multi-buffer support: mark and view several buffers at once on a responsive grid (1 / 2 / 2x2 / 3x2 / 3x3) with per-cell decode and a soft guardrail past ~4 concurrent streams; registry panel gains multi-select via pinned tabs (Ctrl/Cmd-click to pin)

**Fixes**

- Frozen claimable scrub range is now correctly intersected (not unioned) between marked buffers' chunk ranges and the primary stats ring's range, so the scrubber can no longer claim frames a buffer's decode chain can't resolve
- Scrub decode outputs are now correlated to the request that issued them (FIFO tracker) instead of a plain counter, preventing a superseded request's late output from being drawn as the wrong frame during rapid cursor movement
- Protocol store quota pruning: per-provider tail windows are now pinned by each provider's own retained id count (not a shared global id span); in-memory accounting rolls back on failed write-batch commits; a one-shot timer arms pruning after a throttled over-budget push so a quiet period still triggers it; `dispose()` cancels background timers and closes the IDB connection; `statsFor().total` is derived directly from retained ids; `retainedRange().oldestFrame` recovers correctly when a prune pass stops before observing the first survivor

## Summary

Adds a full "flight recorder" to the devtools dashboard — persistent protocol history with quota-based pruning, a rolling chunk ring with freeze/scrub/replay, registry checkpoint snapshots, and multi-buffer grid viewing — plus a run of adversarial-review fixes closing races and correctness gaps across the new persistence, ring, and scrub-decode paths.
