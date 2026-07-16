---
"@three-flatland/devtools": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (#29 Phase C, epic #116)

- Rolling ring buffer for encoded buffer chunks plus a stats-arrival log, windowed by wall-clock time (10s chunks, 30s stats)
- Freeze/unfreeze scrubbing: freezing clones the ring(s) and parks the frame cursor while live ingest keeps recording underneath; unfreeze wired into all existing "go live" affordances (LIVE button, double-click, Esc)
- Frozen buffers panel decodes the actual frame at the scrub cursor instead of showing a placeholder notice
- Multi-buffer support: mark and view several buffers at once on a responsive grid layout (1/2/2x2/3x2/3x3) with per-cell decode and a soft guardrail past ~4 concurrent streams
- Registry panel gains multi-select via a pinned-tabs strip (Ctrl/Cmd-click to pin), each pinned entry staying scrub-consistent while parked
- Registry checkpoint snapshots let time-travel reconstruction replay no further back than one cadence window, reconstructing parked state from the nearest checkpoint plus forward deltas
- Tightened VP9 keyframe cadence (2000ms -> 500ms) so scrubbing is never far from a decodable anchor
- Docs updated for the multi-buffer flight recorder workflow

### Fixes

- Frozen scrub range now correctly intersects marked buffers' chunk ranges with the stats ring's range instead of unioning them, so the scrubber can no longer claim frames a buffer can't actually decode
- Scrub decode outputs are now correlated to their originating request via a FIFO tracker, preventing a superseded request's late output from being drawn as the wrong frame during rapid cursor movement
- Checkpoints that would degrade an oversized registry entry to metadata-only now retry instead of silently claiming a complete checkpoint, falling back to `partial: true` after bounded attempts; reconstruction skips partial checkpoints as anchors
- Protocol-store persistence moved to dashboard bootstrap, independent of the Protocol Log panel's mount/pause state, so recording is never an implicit side effect of one panel's display toggle
- Registry reconstruction re-queries when a write batch actually commits to IndexedDB, closing a race where a debounce could fire before the newest rows were durably queryable

## Protocol store quota and pruning

- Added a byte-budget policy for IndexedDB persistence (`navigator.storage.estimate()`, capped/overridable, with a fixed fallback) and throttled oldest-first pruning so long dashboard sessions no longer grow the store unbounded
- `retainedRange()` exposes what actually survives per provider for the flight recorder's scrubber
- Each provider's protected tail window is now pinned by its own retained id count rather than a global id span, fixing under-protection when providers are interleaved
- In-memory accounting rolls back when a write-batch transaction fails to commit; a one-shot timer ensures a throttled over-budget push still gets pruned; `dispose()` added to cancel timers and close the IDB connection cleanly
- `statsFor().total` and `retainedRange().oldestFrame` are now derived from actual retained state instead of separately tracked counters, preventing drift

Files: packages/devtools/src/dashboard/flight-ring.ts, panels/buffers.tsx, panels/scrubber.tsx, panels/registry.tsx, panels/protocol-log.tsx, grid-layout.ts, hooks.ts, log-ingest.ts, protocol-store.ts, registry-reconstruction.ts, scrub-request-tracker.ts, devtools-client.ts, registry-delta.ts, index.html, docs/src/content/docs/guides/devtools.mdx, packages/three-flatland/src/debug-protocol.ts, debug/DebugRegistry.ts, debug/DevtoolsProvider.ts, debug/bus-worker.ts, packages/devtools/package.json, pnpm-lock.yaml (+ tests)
Stats: 9 commits, 44 files changed (net across commits), ~4384 insertions(+), ~458 deletions(-)

---

Ships the flight recorder feature end-to-end for the devtools dashboard (recording, freeze/scrub, multi-buffer grid, registry checkpoints) plus reliability and correctness fixes for scrub playback and protocol-store storage quota/pruning.
