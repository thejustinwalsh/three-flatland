import { describe, expect, it } from 'vitest'
import { reconstructRegistryAt } from './registry-reconstruction'
import type { RegistryHistoryEntry } from './registry-reconstruction'
import type { RegistryEntryDelta } from 'three-flatland/debug-protocol'
import { applyRegistryEntryDelta } from '../registry-delta'
import type { RegistryEntrySnapshot } from '../devtools-client'

function entry(sample: number[], version: number): RegistryEntryDelta {
  return { kind: 'float', version, count: sample.length, sample: new Float32Array(sample) }
}

/** Structural equality for two reconstructed/live registry maps. */
function snapshotsEqual(
  a: Map<string, RegistryEntrySnapshot>,
  b: Map<string, RegistryEntrySnapshot>,
): boolean {
  if (a.size !== b.size) return false
  for (const [name, av] of a) {
    const bv = b.get(name)
    if (bv === undefined) return false
    if (av.kind !== bv.kind || av.version !== bv.version || av.count !== bv.count || av.label !== bv.label) return false
    if (av.sample.length !== bv.sample.length) return false
    for (let i = 0; i < av.sample.length; i++) if (av.sample[i] !== bv.sample[i]) return false
  }
  return true
}

/** Drives the same fold `devtools-client.ts`'s `_applyRegistry` uses, live-style: every payload in arrival order, no checkpoint anchoring. */
function liveAccumulate(history: readonly RegistryHistoryEntry[]): Map<string, RegistryEntrySnapshot> {
  const entries = new Map<string, RegistryEntrySnapshot>()
  for (const h of history) applyRegistryEntryDelta(entries, h.payload)
  return entries
}

describe('reconstructRegistryAt', () => {
  it('applies a checkpoint then its following deltas in order', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 10, payload: { checkpoint: true, entries: { a: entry([1, 1, 1], 1), b: entry([9], 1) } } },
      { frame: 11, payload: { entries: { a: entry([2, 2, 2], 2) } } },
      { frame: 12, payload: { entries: { a: entry([3, 3, 3], 3) } } },
    ]

    const result = reconstructRegistryAt(history, 12)

    expect(result.complete).toBe(true)
    expect(Array.from(result.entries.get('a')!.sample)).toEqual([3, 3, 3])
    expect(result.entries.get('a')!.version).toBe(3)
    // 'b' was never touched again after the checkpoint — still present
    // with its checkpoint-time value.
    expect(Array.from(result.entries.get('b')!.sample)).toEqual([9])
  })

  it('picks the nearest checkpoint at or before the cursor when several exist', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([100], 1) } } },
      { frame: 5, payload: { entries: { a: entry([101], 2) } } },
      { frame: 10, payload: { checkpoint: true, entries: { a: entry([1], 3) } } },
      { frame: 15, payload: { entries: { a: entry([2], 4) } } },
      { frame: 20, payload: { checkpoint: true, entries: { a: entry([999], 5) } } },
    ]

    // Cursor sits between the second and third checkpoints — must
    // anchor on frame 10's checkpoint, NOT frame 0's or frame 20's.
    const result = reconstructRegistryAt(history, 17)

    expect(result.complete).toBe(true)
    expect(Array.from(result.entries.get('a')!.sample)).toEqual([2])
    expect(result.entries.get('a')!.version).toBe(4)
  })

  it('falls back honestly when the cursor predates the first retained checkpoint', () => {
    const history: RegistryHistoryEntry[] = [
      // No checkpoint at all in the retained history — e.g. pruned out,
      // or the session hasn't reached its first cadence tick.
      { frame: 3, payload: { entries: { a: entry([7], 1) } } },
      { frame: 4, payload: { entries: { a: entry([8], 2) } } },
    ]

    const result = reconstructRegistryAt(history, 4)

    expect(result.complete).toBe(false)
    // Still best-effort populated from whatever deltas were available,
    // not silently empty.
    expect(Array.from(result.entries.get('a')!.sample)).toEqual([8])
  })

  it('applies a delta for an entry the checkpoint lacks (created after the checkpoint)', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([1], 1) } } },
      { frame: 1, payload: { entries: { b: entry([42], 1) } } },
    ]

    const result = reconstructRegistryAt(history, 1)

    expect(result.complete).toBe(true)
    expect(result.entries.has('a')).toBe(true)
    expect(Array.from(result.entries.get('b')!.sample)).toEqual([42])
  })

  it('applies deletion deltas', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([1], 1), b: entry([2], 1) } } },
      { frame: 1, payload: { entries: { a: null } } },
    ]

    const result = reconstructRegistryAt(history, 1)

    expect(result.entries.has('a')).toBe(false)
    expect(result.entries.has('b')).toBe(true)
  })

  it('ignores payloads after the target frame', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([1], 1) } } },
      { frame: 5, payload: { entries: { a: entry([2], 2) } } },
      { frame: 10, payload: { entries: { a: entry([999], 3) } } },
    ]

    const result = reconstructRegistryAt(history, 5)

    expect(Array.from(result.entries.get('a')!.sample)).toEqual([2])
  })

  it('falls back to a metadata-only sample when neither the checkpoint nor deltas ever carried one', () => {
    const metaOnly: RegistryEntryDelta = { kind: 'float', version: 1, count: 4 }
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: metaOnly } } },
    ]

    const result = reconstructRegistryAt(history, 0)

    expect(result.entries.get('a')!.sample.length).toBe(0)
  })

  it('returns an empty, incomplete result for an empty history', () => {
    const result = reconstructRegistryAt([], 5)
    expect(result.complete).toBe(false)
    expect(result.entries.size).toBe(0)
  })
})

/**
 * Partial-checkpoint anchor exclusion (#29 Phase C review fix). A
 * checkpoint flagged `partial: true` (producer gave up retrying a
 * degraded entry — see `DebugRegistry.drain`) must never be picked as
 * the replay anchor: it doesn't actually carry every entry's full
 * state, so anchoring there would silently lose a sample an earlier,
 * genuinely complete checkpoint (or continuous live accumulation)
 * still has.
 */
describe('reconstructRegistryAt — partial checkpoints', () => {
  it('skips a partial checkpoint and anchors on the nearest complete one instead', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([5, 5], 1) } } },
      // A later checkpoint degrades 'a' to metadata-only and gives up.
      {
        frame: 10,
        payload: {
          checkpoint: true,
          partial: true,
          entries: { a: { kind: 'float', version: 5, count: 2, label: 'meta-update' } },
        },
      },
    ]

    // Target sits AFTER the partial checkpoint. A naive implementation
    // would anchor there and lose 'a's sample entirely.
    const result = reconstructRegistryAt(history, 10)

    expect(result.complete).toBe(true) // anchored on frame 0, not frame 10
    expect(Array.from(result.entries.get('a')!.sample)).toEqual([5, 5])
    // The partial checkpoint's own entries still apply as an ordinary
    // delta during replay — its metadata updates even though the
    // sample it couldn't carry falls back to the earlier one.
    expect(result.entries.get('a')!.version).toBe(5)
    expect(result.entries.get('a')!.label).toBe('meta-update')
  })

  it('falls back to complete: false when every checkpoint in range is partial', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, partial: true, entries: { a: { kind: 'float', version: 1, count: 2 } } } },
      { frame: 1, payload: { entries: { a: entry([3, 3], 2) } } },
    ]

    const result = reconstructRegistryAt(history, 1)

    expect(result.complete).toBe(false)
    // Still best-effort populated, not silently empty.
    expect(Array.from(result.entries.get('a')!.sample)).toEqual([3, 3])
  })

  it('a complete checkpoint AFTER a partial one is still a valid anchor', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([1, 1], 1) } } },
      { frame: 10, payload: { checkpoint: true, partial: true, entries: { a: { kind: 'float', version: 1, count: 2 } } } },
      { frame: 20, payload: { checkpoint: true, entries: { a: entry([7, 7], 3) } } },
    ]

    const result = reconstructRegistryAt(history, 20)

    expect(result.complete).toBe(true)
    expect(Array.from(result.entries.get('a')!.sample)).toEqual([7, 7])
  })
})

/**
 * Live/reconstruction parity (#29 Phase C review fix). Both paths now
 * share `applyRegistryEntryDelta` — this suite proves the SURROUNDING
 * logic (checkpoint anchoring, partial exclusion) never produces a
 * result that diverges from continuous live accumulation over the
 * same history, at any target frame.
 */
describe('reconstructRegistryAt — parity with live accumulation', () => {
  it('matches a live accumulator fed the same history, at the latest frame', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([1, 1], 1), b: entry([9], 1) } } },
      { frame: 1, payload: { entries: { a: entry([2, 2], 2) } } },
      // Metadata-only delta (e.g. outside the consumer's selection filter) — no sample.
      { frame: 2, payload: { entries: { b: { kind: 'float', version: 2, count: 1 } } } },
      { frame: 3, payload: { entries: { a: entry([3, 3], 3) } } },
    ]

    const live = liveAccumulate(history)
    const reconstructed = reconstructRegistryAt(history, 3)

    expect(reconstructed.complete).toBe(true)
    expect(snapshotsEqual(reconstructed.entries, live)).toBe(true)
  })

  it('still matches live accumulation when the anchor has to skip back past a partial checkpoint', () => {
    const history: RegistryHistoryEntry[] = [
      { frame: 0, payload: { checkpoint: true, entries: { a: entry([5, 5], 1) } } },
      {
        frame: 10,
        payload: {
          checkpoint: true,
          partial: true,
          entries: { a: { kind: 'float', version: 5, count: 2, label: 'meta-update' } },
        },
      },
      { frame: 20, payload: { checkpoint: true, entries: { a: entry([7, 7], 6) } } },
    ]

    // Between the partial checkpoint and the next complete one — this
    // is exactly the gap a naive anchor-on-any-checkpoint
    // implementation would get wrong.
    const liveUpToFrame10 = liveAccumulate(history.slice(0, 2))
    const reconstructedAt10 = reconstructRegistryAt(history, 10)
    expect(snapshotsEqual(reconstructedAt10.entries, liveUpToFrame10)).toBe(true)

    // And at the latest frame, both converge on the fresh sample.
    const live = liveAccumulate(history)
    const reconstructedAtLatest = reconstructRegistryAt(history, 20)
    expect(snapshotsEqual(reconstructedAtLatest.entries, live)).toBe(true)
  })
})
