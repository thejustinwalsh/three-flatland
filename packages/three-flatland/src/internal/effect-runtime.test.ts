import { describe, expect, it, vi } from 'vitest'
import {
  beginEffectReadOverride,
  readEffectScalarValue,
  readEffectVectorSnapshot,
  restoreEffectReadOverride,
} from './effect-runtime'

describe('effect vector runtime snapshots', () => {
  it('reuses one override record across steady writes and fixed reentrant nesting', () => {
    const effect = {}
    const record = beginEffectReadOverride(effect, 'vector', 2, 1, 2)
    expect(readEffectVectorSnapshot(effect, 'vector', 2, 9, 10)).toEqual([1, 2])
    const nestedRecord = beginEffectReadOverride(effect, 'vector', 2, 3, 4)
    expect(nestedRecord).toBe(record)
    expect(readEffectVectorSnapshot(effect, 'vector', 2, 9, 10)).toEqual([3, 4])
    restoreEffectReadOverride(effect)
    expect(readEffectVectorSnapshot(effect, 'vector', 2, 9, 10)).toEqual([1, 2])
    restoreEffectReadOverride(effect)
    expect(readEffectVectorSnapshot(effect, 'vector', 2, 9, 10)).toEqual([9, 10])

    const weakMapSet = vi.spyOn(WeakMap.prototype, 'set')
    const freeze = vi.spyOn(Object, 'freeze')
    let reused = true
    let setCalls = -1
    let freezeCalls = -1
    try {
      for (let i = 0; i < 3_000; i++) {
        reused = beginEffectReadOverride(effect, 'vector', 2, i, i + 1) === record && reused
        restoreEffectReadOverride(effect)
      }
      setCalls = weakMapSet.mock.calls.length
      freezeCalls = freeze.mock.calls.length
    } finally {
      freeze.mockRestore()
      weakMapSet.mockRestore()
    }
    expect(reused).toBe(true)
    expect(setCalls).toBe(0)
    expect(freezeCalls).toBe(0)
  })

  it('reuses the same override frames for scalar reads and nesting', () => {
    const effect = {}
    const record = beginEffectReadOverride(effect, 'amount', 1, 1)
    expect(readEffectScalarValue(effect, 'amount', 9)).toBe(1)
    const nestedRecord = beginEffectReadOverride(effect, 'amount', 1, 3)
    expect(nestedRecord).toBe(record)
    expect(readEffectScalarValue(effect, 'amount', 9)).toBe(3)
    restoreEffectReadOverride(effect)
    expect(readEffectScalarValue(effect, 'amount', 9)).toBe(1)
    restoreEffectReadOverride(effect)
    expect(readEffectScalarValue(effect, 'amount', 9)).toBe(9)

    const weakMapSet = vi.spyOn(WeakMap.prototype, 'set')
    let reused = true
    let setCalls = -1
    try {
      for (let i = 0; i < 3_000; i++) {
        reused = beginEffectReadOverride(effect, 'amount', 1, i) === record && reused
        restoreEffectReadOverride(effect)
      }
      setCalls = weakMapSet.mock.calls.length
    } finally {
      weakMapSet.mockRestore()
    }
    expect(reused).toBe(true)
    expect(setCalls).toBe(0)
  })

  it('creates the per-effect snapshot record only on the first read', () => {
    const effect = {}
    const weakMapSet = vi.spyOn(WeakMap.prototype, 'set')
    const freeze = vi.spyOn(Object, 'freeze')
    let first: readonly number[] | undefined
    let unchanged: readonly number[] | undefined
    let changed: readonly number[] | undefined
    let setCallsAfterFirst = -1
    let freezeCallsAfterFirst = -1
    let setCallsAfterUnchanged = -1
    let freezeCallsAfterUnchanged = -1
    let setCallsAfterChanged = -1
    let freezeCallsAfterChanged = -1
    try {
      first = readEffectVectorSnapshot(effect, 'vector', 3, 1, 2, 3)
      setCallsAfterFirst = weakMapSet.mock.calls.length
      freezeCallsAfterFirst = freeze.mock.calls.length
      unchanged = readEffectVectorSnapshot(effect, 'vector', 3, 1, 2, 3)
      setCallsAfterUnchanged = weakMapSet.mock.calls.length
      freezeCallsAfterUnchanged = freeze.mock.calls.length
      changed = readEffectVectorSnapshot(effect, 'vector', 3, 4, 5, 6)
      setCallsAfterChanged = weakMapSet.mock.calls.length
      freezeCallsAfterChanged = freeze.mock.calls.length
    } finally {
      freeze.mockRestore()
      weakMapSet.mockRestore()
    }
    expect(setCallsAfterFirst).toBe(1)
    expect(freezeCallsAfterFirst).toBe(1)
    expect(unchanged).toBe(first)
    expect(setCallsAfterUnchanged).toBe(1)
    expect(freezeCallsAfterUnchanged).toBe(1)
    expect(changed).not.toBe(first)
    expect(setCallsAfterChanged).toBe(1)
    expect(freezeCallsAfterChanged).toBe(2)
  })
})
