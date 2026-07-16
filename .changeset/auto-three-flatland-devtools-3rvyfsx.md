---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

New flight recorder feature for the devtools dashboard (record, freeze, and scrub playback of buffers, registry, and protocol log), plus IndexedDB persistence with quota management.

**Protocol store persistence & quota**
- Persists every dashboard message to IndexedDB with a byte-budget policy (via `navigator.storage.estimate()`, capped/overridable) and throttled oldest-first pruning that never touches a provider's pinned tail window
- Fixes six pruning bugs: per-provider tail window now counts retained ids instead of a global id span, in-memory counters roll back on failed writes, a one-shot timer arms pruning after a throttled burst, `dispose()` cleans up timers/IDB connections, `statsFor().total` derives from `ids.length`, and `retainedRange().oldestFrame` recovers correctly when a prune stops early
- Ingest moves to dashboard bootstrap so persistence no longer depends on the Protocol Log panel being mounted or unpaused

**Flight recorder ring, freeze & scrub**
- Adds an always-on rolling ring of encoded buffer chunks and a stats-arrival log, windowed by wall-clock time, that freezes into a scrub-able snapshot while live ingest continues underneath
- Unfreeze is wired into every existing "go live" action (LIVE button, double-click, Esc)
- Fixes async decode-output races during rapid scrubbing by correlating each decoded frame back to the request that issued it (FIFO tracker), so a superseded request's stale output can no longer be drawn as the wrong frame
- Fixes the frozen claimable scrub range to intersect (not union) marked buffers' chunk ranges with the primary stats range, so the slider can no longer claim frames a buffer can't actually decode

**Multi-buffer & registry**
- Buffers panel supports marking and viewing several buffers at once on a responsive grid (1/2/2x2/3x2/3x3) with a soft GPU-cost guardrail past ~4 concurrent streams
- Registry panel supports multi-select (Ctrl/Cmd-click to pin) and reconstructs pinned entries from the nearest checkpoint plus forward deltas, so time-travel scrubbing stays consistent across a full recording window
- Registry reconstruction and the live client now share one fold function, and re-queries after a write batch actually commits, closing a race with stale reads

This completes the flight recorder work tracked in epic #116.
