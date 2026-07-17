---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder — registry checkpoints and time-travel reconstruction

- Registry panel can now reconstruct state at any parked frame using periodic full checkpoint snapshots plus forward deltas, instead of approximating from the nearest delta.
- Checkpoints that would otherwise degrade an entry to metadata-only (pool overflow) retry and settle as a partial checkpoint rather than never completing; reconstruction skips partial checkpoints as anchors and falls back to the nearest complete one.
- Protocol-store persistence now runs unconditionally at dashboard bootstrap instead of depending on the Protocol Log panel being mounted or un-paused — Pause now only affects that panel's own list.
- Registry reconstruction re-queries as soon as a write batch is durably committed, closing a race where a debounce could fire before the newest rows were queryable.
- Live client and reconstruction logic now share a single fold function, so they can't drift apart.

## Flight recorder — ring buffer, freeze, and scrub playback

- Adds an always-on rolling ring of encoded chunks (10s) and stats (30s) for the selected buffer, enabling frame-accurate scrub playback while frozen.
- Freezing clones the ring and parks the frame cursor while live ingest continues underneath; unfreezing works from any existing "go live" entry point (LIVE button, double-click, Esc).
- While frozen, the buffers panel decodes actual frames from the ring instead of showing a "no playback yet" placeholder.
- VP9 encoder keyframe cadence tightened from 2000ms to 500ms so scrub cursors are always near a decodable anchor.

A summary of related fixes and follow-on work for `@three-flatland/devtools` is tracked in that package's own changeset.
