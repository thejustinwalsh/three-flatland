---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (#29 Phase C)

- Rolling ring buffer for the selected debug buffer's encoded chunks plus a stats-arrival log, windowed by wall-clock time (10s chunks, 30s stats)
- Freeze/unfreeze scrubbing: freezing clones the ring and parks the frame cursor while live ingest keeps recording underneath; unfreeze wired into all existing "go live" affordances (LIVE button, double-click, Esc)
- Frozen buffers panel decodes the actual frame at the scrub cursor instead of showing a placeholder notice
- Tightened VP9 keyframe cadence (2000ms -> 500ms) so scrubbing is never far from a decodable anchor
- Registry panel gains periodic checkpoint snapshots so time-travel reconstruction never replays further back than one cadence window, reconstructing parked state from the nearest checkpoint plus forward deltas
- Checkpoints that would degrade an oversized entry to metadata-only now retry instead of silently claiming a complete checkpoint, falling back to `partial: true` after bounded attempts; reconstruction skips partial checkpoints as anchors
- Protocol-store persistence moved to dashboard bootstrap, independent of the Protocol Log panel's mount/pause state, so recording is never an implicit side effect of one panel's display toggle
- Registry reconstruction now re-queries when a write batch actually commits to IndexedDB, closing a race where a debounce could fire before the newest rows were durably queryable
Files: packages/devtools/src/dashboard/flight-ring.ts, panels/buffers.tsx, panels/scrubber.tsx, panels/registry.tsx, panels/protocol-log.tsx, hooks.ts, log-ingest.ts, protocol-store.ts, registry-reconstruction.ts, devtools-client.ts, registry-delta.ts, packages/three-flatland/src/debug-protocol.ts, debug/DebugRegistry.ts, debug/DevtoolsProvider.ts, debug/bus-worker.ts (+ tests)
Stats: 3 commits, 28 files changed, 2257 insertions(+), 193 deletions(-)

---

Adds the flight recorder's core recording, freeze, and time-travel scrub/checkpoint capabilities to the devtools dashboard, plus reliability fixes for checkpoint persistence and reconstruction timing.
