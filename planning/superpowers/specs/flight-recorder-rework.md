# Flight Recorder Rework — Coherent Point-in-Time Snapshot Store

**Status:** planned · supersedes the parked PR #146 approach · originating spec #29 · epic #116
**Decision (2026-07-08):** the devtools flight-recorder changes do **not** ship until complete. #146 is parked (draft); the rework lands **after #117 merges**.

## Why the rework

#146 (flight-recorder slices 1–4) was approved on code review but fails observably in the running dashboard. Manual testing surfaced four symptoms:

1. **Stats sparklines don't scrub** — while frozen and scrubbing, the sparklines keep showing the live signal, not the window at the cursor.
2. **Registry flashes `(updating…)`** when scrubbed back.
3. **Protocol-log doesn't follow the cursor** — rows stay live instead of jumping to the parked frame.
4. **Freeze/Live toggle behaves oddly** — the stats strip in particular misbehaves as freeze is toggled on/off.

These are not four independent bugs. They share **one root cause**.

## Root cause — one missing contract

There is no single, coherent, **synchronous** "state at frame N" that every panel reads. Each panel independently reaches into a *different* source with *different* freshness:

| Panel | Data source today | Failure |
|-------|-------------------|---------|
| Stats (`panels/stats.tsx`) | `DevtoolsState.series.*` — the **live** ring, always advancing | The flight-ring snapshot (`flight-ring.ts`) only captures marked **buffers** (`markBuffer` / `getBufferFrozenRing`); the stats series is never frozen. `seriesValueAtFrame` marks a parked value but the sparkline curve is still live. |
| Registry (`panels/registry.tsx`) | `reconstructRegistryAt(history, target)` run **async** in a `useEffect` on every cursor tick | `reconstructing` state flips true→false each tick → `(updating…)` flash; no memoized synchronous snapshot. |
| Protocol (`panels/protocol-log.tsx`) | `store.queryFiltered(...).then(...)` nearest-frame, parked-cursor keyed | Async cursor→row mapping doesn't resolve the parked frame's rows. |
| Buffers (`panels/buffers.tsx`) | `getBufferFrozenRing(name)` | The one source that *is* frozen — hence the only panel that scrubs. |

So the fix is not to patch four panels. It is to give the store a **coherent point-in-time snapshot contract** that freeze captures atomically across *all* sources, and that scrubbing reads synchronously — then rewire each panel to that one contract.

## Target behavior — how it should work

- **Freeze captures a coherent snapshot** across every data source at once: stats series, registry checkpoint, protocol rows, and marked buffers — all pinned to the same frozen frame window. Nothing keeps advancing behind the scrubber.
- **Scrubbing to frame N yields a synchronous, consistent view.** A panel asks the store for the state at frame N and gets it *now* — no per-tick async that flashes loading state. Reconstruction (registry deltas → checkpoint, protocol nearest-frame) is computed once at freeze (or memoized per frame), not re-run on every drag tick.
- **Every panel reads the same snapshot.** Stats sparkline window, registry tree, protocol rows, and buffer contents at cursor frame N are mutually consistent — they describe the same instant.
- **Freeze / Live toggle is a clean lifecycle.** Freeze installs the snapshot for all consumers; Live (goLive/unfreeze) drops it for all consumers; toggling repeatedly is idempotent and leaves no source half-frozen.
- **Pruning interplay (slice 1) stays honest.** The scrubber's claimable range never offers a frame whose backing rows/series/checkpoint already pruned out.

## Workstreams (→ GitHub issues under epic #116)

1. **Foundation — unified point-in-time snapshot contract** (`flight-ring.ts`, `frame-cursor.ts`, `protocol-store.ts`, `registry-reconstruction.ts`). Define and implement the single "snapshot at frame N" the panels read. Freeze captures all sources; a synchronous accessor returns the coherent per-frame view; freeze/unfreeze lifecycle is idempotent and total. This is the load-bearing piece — everything else depends on it. Heavy invariant tests.
2. **Stats sparklines scrub** (`panels/stats.tsx`) — freeze the stats series into the snapshot; sparklines render the frozen window at the cursor, not the live ring.
3. **Registry synchronous snapshot** (`panels/registry.tsx`) — read a memoized point-in-time reconstruction; eliminate the per-tick async `(updating…)` flash.
4. **Protocol-log cursor-follow** (`panels/protocol-log.tsx`) — rows resolve to the parked frame against the frozen snapshot.
5. **Integration tests — cross-panel scrub coherence** — end-to-end: freeze, scrub to frame N, assert stats/registry/protocol/buffers all describe the same instant; freeze/Live toggle invariants; pruning-vs-claimable-range invariants.

## Sequencing

- **Blocked by #117 merge** — per the decision, the devtools rework starts after the VS Code tools land. #146 stays draft until then.
- **Foundation (1) blocks (2)–(4).** The panel rewires consume the contract. (5) spans all.
- Salvage from #146: the ProtocolStore quota/pruning/`retainedRange` work (slice 1) and its 15 store tests are sound and reusable; the rework builds the snapshot contract *on top of* that, it does not throw it away.

## Non-goals

- No new profiling/telemetry features — this is correctness of the existing scrub, not scope expansion.
- Not reworking the discovery/transport bus (`bus-*`) — the snapshot contract is dashboard-side.
