/**
 * Registry checkpoint reconstruction (#29 Phase C — slice 3).
 *
 * Registry data on the wire is delta-encoded (`RegistryPayload` in
 * `debug-protocol.ts`): most `data` packets only carry entries that
 * changed since the producer's last drain. The live client
 * (`devtools-client.ts`) accumulates these by replaying every delta
 * it's ever seen, in arrival order — correct for "what does the
 * registry look like right now", but the wrong tool for "what did it
 * look like at frame N": replaying from session start gets slower the
 * longer the session runs, and reading only the one packet nearest
 * frame N (Phase A's original "nearest arrival ≤ cursor"
 * approximation) shows just whichever entries happened to change in
 * that packet, not the full registry.
 *
 * The producer's periodic checkpoint (`REGISTRY_CHECKPOINT_MS`,
 * `DebugRegistry.resetDelta`) bounds the real fix: a checkpoint-flagged
 * payload is a full re-send of every entry the producer currently
 * tracks (subject to the consumer's selection filter), so
 * reconstructing frame N only needs the nearest checkpoint at or
 * before N, plus the — bounded to at most one cadence window's worth
 * of — deltas from there forward.
 *
 * This module is the pure replay core: checkpoint-locating and
 * delta-folding over an already-fetched, already-ordered history. It
 * touches no DOM, no IndexedDB, no bus — callers (the registry panel)
 * read that history out of the `ProtocolStore` and hand it over in
 * ascending-frame order.
 */
import type { RegistryPayload } from 'three-flatland/debug-protocol'
import type { RegistryEntrySnapshot } from '../devtools-client.js'
import { applyRegistryEntryDelta } from '../registry-delta.js'

/** One registry-carrying `data` packet, reduced to what replay needs. */
export interface RegistryHistoryEntry {
  /** Engine frame the packet was emitted from. */
  frame: number
  /** The packet's `registry` feature payload (callers only include entries where this was present and non-null). */
  payload: RegistryPayload
}

export interface RegistryReconstruction {
  /** Reconstructed name → snapshot map, same shape the live client's `state.registry` uses. */
  entries: Map<string, RegistryEntrySnapshot>
  /**
   * `true` when a COMPLETE checkpoint at or before the target frame
   * anchored the replay — `entries` reflects the producer's actual
   * full state at that point. `false` means no complete checkpoint was
   * found at or before the target frame in the supplied history
   * (pruned out of retention, the session hasn't reached its first
   * cadence tick yet, or every checkpoint in range was flagged
   * `partial` — see below); `entries` is still populated from
   * whatever deltas were available, starting from the earliest
   * history supplied, but callers should present that as a
   * best-effort partial result, not a verified one.
   */
  complete: boolean
}

/**
 * Reconstruct registry state at `targetFrame` from an ordered
 * (ascending-frame) history of registry payloads.
 *
 * Scans for the last COMPLETE checkpoint-flagged payload
 * (`checkpoint: true`, `partial` NOT set) at or before `targetFrame`,
 * then replays every payload from there forward through `targetFrame`
 * — the same delta rules the live client applies (`applyRegistryEntryDelta`,
 * shared with `devtools-client.ts` so the two can't diverge):
 * `entries[name] === null` removes the entry, a present delta
 * overwrites it (falling back to the previously known sample when the
 * new delta didn't carry one — i.e. it was outside the consumer's
 * selection filter, or the producer had to degrade it to metadata-only).
 * Entries created after the checkpoint (absent from it) apply normally
 * the first time their delta arrives; payloads at frames after
 * `targetFrame` are ignored.
 *
 * A checkpoint flagged `partial: true` (the producer gave up retrying
 * a degraded entry — see `DebugRegistry.drain`) is deliberately NOT
 * eligible as an anchor: it doesn't actually carry every entry's full
 * state, so treating it as one would silently lose whatever sample an
 * earlier, genuinely complete checkpoint (or the live accumulator)
 * still had for the degraded entry. Its `entries` are still applied
 * as ordinary deltas when replay passes through it — only its
 * eligibility as a REPLAY START is excluded.
 *
 * If no complete checkpoint exists at or before `targetFrame`, replay
 * still runs from the start of the supplied history so the panel has
 * *something* to show — `complete: false` marks it as best-effort
 * rather than a point-in-time-accurate snapshot.
 */
export function reconstructRegistryAt(
  history: readonly RegistryHistoryEntry[],
  targetFrame: number,
): RegistryReconstruction {
  let checkpointIdx = -1
  let scanEnd = history.length
  for (let i = 0; i < history.length; i++) {
    if (history[i]!.frame > targetFrame) {
      scanEnd = i
      break
    }
    const payload = history[i]!.payload
    if (payload.checkpoint === true && payload.partial !== true) checkpointIdx = i
  }

  const complete = checkpointIdx !== -1
  const startIdx = complete ? checkpointIdx : 0
  const entries = new Map<string, RegistryEntrySnapshot>()

  for (let i = startIdx; i < scanEnd; i++) {
    applyRegistryEntryDelta(entries, history[i]!.payload)
  }

  return { entries, complete }
}
