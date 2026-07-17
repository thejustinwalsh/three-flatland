---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (Phase C, epic #116)

New always-on recording pipeline for the dashboard, letting you freeze the live view and scrub backward through recent history:

- **Ring buffer + freeze** — a rolling ring of encoded video chunks (10s window) and a stats-arrival log (30s window) record continuously. Freeze (LIVE button, double-click, or Esc to unfreeze) clones the ring and parks the frame cursor without interrupting live ingest.
- **Scrub playback** — while frozen, the buffers panel decodes the frozen ring's keyframe-anchored chain for the cursor frame instead of showing a static notice.
- **Multi-buffer grid** — mark several buffers at once; the panel lays them out on a responsive grid (1 / 2 / 2x2 / 3x2 / 3x3) with per-cell decode and a soft guardrail past ~4 concurrent streams.
- **Multi-select registry** — pin multiple registry entries via a pinned-tabs strip (Ctrl/Cmd-click), all staying scrub-consistent while parked.
- **Registry checkpoints** — periodic full-state snapshots so reconstructing the registry at a parked frame never has to replay further back than one cadence window, reading through the protocol store's persisted history.
- **Protocol store persistence decoupled from panel UI** — ingest now runs unconditionally from dashboard bootstrap rather than depending on the Protocol Log panel being mounted or unpaused; Pause only freezes that panel's own list.
- **Size-based IndexedDB quota + pruning** — the protocol store now enforces a byte budget (via `navigator.storage.estimate()`, capped/overridable) with throttled oldest-first pruning that always preserves each provider's pinned tail window, so long sessions no longer grow the store unbounded.

## Fixes

- Fixed the frozen scrubber's claimable range being incorrectly widened by the stats ring instead of intersected with it, which could let the slider claim frames a marked buffer couldn't actually decode.
- Fixed scrub decode outputs sometimes being attributed to the wrong (stale) request during rapid cursor movement, by correlating each decoded output back to its issuing request via FIFO instead of a raw counter.
- Fixed the registry checkpoint/reconstruction race where a parked reconstruction could re-query before newly flushed rows were durably queryable; the protocol store now fires a flush listener after each write batch commits.
- Fixed six adversarial-review gaps in protocol store quota pruning: per-provider tail windows now pin on retained id count (not a global id span), in-memory accounting rolls back on failed writes, a one-shot timer arms pruning after a throttled burst, `dispose()` cleans up timers/IDB connections, `total` is derived from retained ids instead of tracked separately, and `retainedRange().oldestFrame` recovers correctly when a prune pass stops early.

## BREAKING CHANGES

None — additive `RegistryPayload`/protocol changes and new dashboard panels/APIs (`flight-ring.ts`, `grid-layout.ts`, `scrub-request-tracker.ts`, `log-ingest.ts`).

## Summary

This PR completes the flight recorder feature (#29 Phase C): freeze the dashboard, scrub through recorded buffers and registry state across multiple panels at once, with a bounded, self-pruning IndexedDB backing store.
