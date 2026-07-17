---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (dashboard)

- Protocol store persists all messages to IndexedDB with size-based quota and throttled pruning, so long sessions no longer grow the store unbounded — each provider keeps its own protected recent-history tail
- Added an always-on rolling ring buffer for the selected buffer's encoded chunks and stats, windowed by wall-clock time; freezing clones the ring and parks the frame cursor while live ingest continues underneath
- Buffers panel decodes frozen recordings for scrub playback; unfreeze is wired into every existing "go live" affordance (LIVE button, double-click, Esc)
- Generalized from single-buffer to multi-buffer: buffers panel supports marking and viewing several buffers at once on a responsive grid (1/2/2x2/3x2/3x3) with a soft guardrail past ~4 concurrent streams
- Registry panel supports multi-select via a pinned-tabs strip (Ctrl/Cmd-click to pin) and reconstructs state at the parked frame from the nearest checkpoint plus forward deltas
- Protocol-store ingest moved to dashboard bootstrap, decoupling persistence from the Protocol Log panel's mount/pause state — pause now only freezes that panel's own list
- `ProtocolStore.addFlushListener` lets the registry panel's parked reconstruction re-query as soon as a write batch durably commits, closing a race with stale reads

### Fixes
- Frozen scrubber claimable range is now correctly intersected against the primary stats ring instead of unioned, so a narrow marked-buffer window can no longer be overridden by a wider stats window
- Scrub decode outputs are correlated back to their originating request via a FIFO tracker, so a rapid cursor move during scrubbing can no longer draw a stale/superseded frame
- Protocol store quota pruning: per-provider tail windows are now sized by each provider's own retained id count (not a shared global id span), in-memory counters roll back on failed writes, a one-shot timer catches bursts followed by silence, `dispose()` cleans up timers and the IDB connection, and `retainedRange()` recovers correctly when a prune pass stops early

### Summary
Ships the devtools flight recorder: persisted, quota-managed protocol history with time-travel scrub playback across multiple buffers and multi-select registry reconstruction, plus several correctness fixes found in adversarial review.
