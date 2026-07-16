---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (Phase C, epic #116)

- Add always-on rolling ring buffer for the selected buffer's encoded video chunks plus a stats-arrival log, windowed by wall-clock time (10s chunks, 30s stats).
- Add freeze/unfreeze: freezing clones the ring and parks the frame cursor while live ingest keeps writing underneath; unfreeze is wired into every existing "go live" action (LIVE button, double-click, Esc).
- Add scrub playback while frozen: decode the frozen ring's keyframe-anchored chain for the cursor frame, replacing the old "no playback yet" placeholder with an actual decoded frame.
- Add registry checkpoint snapshots (periodic full re-sends flagged `checkpoint: true`) so the registry panel reconstructs parked state from the nearest checkpoint plus forward deltas instead of approximating from whichever delta landed nearest the cursor.
- Generalize from single-buffer to multi-buffer: mark and view several buffers at once on a responsive grid (1 / 2 / 2x2 / 3x2 / 3x3), each cell decoding independently, with a soft GPU-cost guardrail past ~4 concurrent streams.
- Add multi-select to the registry panel via a pinned-tabs strip (Ctrl/Cmd-click to pin), so every pinned entry stays scrub-consistent while parked.
- Tighten VP9 encoder keyframe cadence from 2000ms to 500ms so a scrub cursor is never far from a decodable anchor.

## Protocol store (IndexedDB persistence)

- Add size-based storage quota and pruning: byte-budget policy via `navigator.storage.estimate()` (capped, overridable, with a fixed fallback) and a throttled oldest-first prune pass that never touches a provider's pinned tail window.
- Add `retainedRange()` to expose what actually survives per provider, giving the scrubber an honest claimable range.
- Add `addFlushListener`, firing after a write batch's IDB transaction actually commits, so the registry panel's parked reconstruction re-queries once new rows are durably queryable.
- Move protocol-store ingest to dashboard bootstrap, independent of the Protocol Log panel's mount state or Pause toggle — persistence no longer depends on a display toggle; Pause now only freezes that panel's own list.

## Bug fixes

- Fix frozen scrubber claimable range: intersect marked buffers' chunk-range union with the primary stats ring's range instead of unioning them, so a narrow buffer window can no longer be overridden by a much wider stats window (previously the slider could claim frames a buffer's decode chain couldn't resolve).
- Fix scrub decode output correlation: replace plain expected/received counters with a FIFO request tracker so a superseded scrub request's late outputs can never be drawn as the wrong frame during rapid cursor movement.
- Fix protocol-store quota pruning: pin each provider's tail window by its own retained id count (not a global id span), roll back in-memory accounting on failed writes, arm a one-shot retry timer for throttled prunes, add `dispose()` to stop background timers/close the IDB connection, and recover `retainedRange().oldestFrame` correctly when a prune pass stops early.
- Fix registry checkpoints that degrade an entry to metadata-only (pool overflow): no longer falsely report `checkpoint: true`; retry, then settle on `checkpoint: true, partial: true`. Reconstruction skips partial checkpoints as anchors, falling back to the nearest complete one. Live client and reconstruction now share one fold function so they can't diverge.

## Summary

Completes the flight-recorder feature (Phase C): rolling-buffer freeze/scrub playback, multi-buffer/multi-registry viewing, checkpointed registry reconstruction, and a size-bounded, crash-safe protocol store, along with several correctness fixes uncovered during adversarial review.
