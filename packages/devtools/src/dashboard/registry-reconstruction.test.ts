import { describe, expect, it } from 'vitest'
import { reconstructRegistryAt } from './registry-reconstruction'
import type { RegistryHistoryEntry } from './registry-reconstruction'
import type { RegistryEntryDelta } from 'three-flatland/debug-protocol'

function entry(sample: number[], version: number): RegistryEntryDelta {
  return { kind: 'float', version, count: sample.length, sample: new Float32Array(sample) }
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
