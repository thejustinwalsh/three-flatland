import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  MAX_STYLES,
  PARAM_GROUPS,
  PARAM_ORDER,
  PARAM_SPECS,
  STYLES,
  clampParam,
  defaultParams,
  fromArgs,
  fromPartial,
  toArgs,
  toDenseArgs,
  type ParamKey,
} from './params'

describe('PARAM_ORDER / PARAM_SPECS / PARAM_GROUPS invariants', () => {
  it('has exactly 21 positional params', () => {
    expect(PARAM_ORDER).toHaveLength(21)
  })

  it('has a spec for every positional key, keyed to itself', () => {
    for (const key of PARAM_ORDER) {
      expect(PARAM_SPECS[key].key).toBe(key)
    }
  })

  it('every default sits within [min, max]', () => {
    for (const key of PARAM_ORDER) {
      const spec = PARAM_SPECS[key]
      expect(spec.default).toBeGreaterThanOrEqual(spec.min)
      expect(spec.default).toBeLessThanOrEqual(spec.max)
    }
  })

  it('groups partition PARAM_ORDER exactly — no missing, no duplicate keys', () => {
    const grouped = PARAM_GROUPS.flatMap((g) => g.params)
    expect(grouped).toHaveLength(PARAM_ORDER.length)
    expect(new Set(grouped)).toEqual(new Set(PARAM_ORDER))
    expect(new Set(grouped).size).toBe(grouped.length)
  })
})

describe('defaultParams', () => {
  it('matches every spec default', () => {
    const params = defaultParams()
    for (const key of PARAM_ORDER) {
      expect(params[key]).toBe(PARAM_SPECS[key].default)
    }
  })
})

describe('clampParam', () => {
  it('clamps below min and above max', () => {
    expect(clampParam('volume', -5)).toBe(0)
    expect(clampParam('volume', 5)).toBe(1)
    expect(clampParam('filter', -9999)).toBe(-2000)
    expect(clampParam('filter', 9999)).toBe(2000)
  })

  it('rounds integer params (shape)', () => {
    expect(clampParam('shape', 2.4)).toBe(2)
    expect(clampParam('shape', 2.6)).toBe(3)
    expect(clampParam('shape', -1)).toBe(0)
    expect(clampParam('shape', 10)).toBe(4)
  })

  it('falls back to the spec default for non-finite input', () => {
    expect(clampParam('frequency', Number.NaN)).toBe(PARAM_SPECS.frequency.default)
    expect(clampParam('frequency', Number.POSITIVE_INFINITY)).toBe(PARAM_SPECS.frequency.default)
  })

  it('passes through in-range values unchanged', () => {
    expect(clampParam('slide', -3.5)).toBe(-3.5)
  })
})

describe('toDenseArgs', () => {
  it('always emits all 21 params, clamped', () => {
    const params = defaultParams()
    params.volume = 99 // out of range
    const dense = toDenseArgs(params)
    expect(dense).toHaveLength(21)
    expect(dense[0]).toBe(1) // clamped to max
  })
})

describe('toArgs — trailing-default trim', () => {
  it('trims to an empty array for untouched defaults', () => {
    expect(toArgs(defaultParams())).toEqual([])
  })

  it('keeps only the first param when just volume changes', () => {
    const params = defaultParams()
    params.volume = 0.5
    expect(toArgs(params)).toEqual([0.5])
  })

  it('keeps leading defaults dense up through the last non-default value', () => {
    // frequency is positional index 2; randomness/volume before it stay
    // at their defaults but must not be trimmed (only TRAILING runs trim).
    const params = defaultParams()
    params.frequency = 440
    const args = toArgs(params)
    expect(args).toEqual([PARAM_SPECS.volume.default, PARAM_SPECS.randomness.default, 440])
  })

  it('emits the full 21-length array when the last param (filter) changes', () => {
    const params = defaultParams()
    params.filter = 500
    expect(toArgs(params)).toHaveLength(21)
    expect(toArgs(params)[20]).toBe(500)
  })

  it('does not trim a default value that appears BEFORE a later non-default one', () => {
    const params = defaultParams()
    params.attack = 0.2 // index 3
    params.decay = 0.3 // index 18 — later positional index
    const args = toArgs(params)
    expect(args).toHaveLength(19)
    expect(args[3]).toBeCloseTo(0.2)
    expect(args[18]).toBeCloseTo(0.3)
    // everything strictly between stays dense at its default
    expect(args[4]).toBe(PARAM_SPECS.sustain.default)
  })
})

describe('fromArgs', () => {
  it('returns defaults for an empty array', () => {
    expect(fromArgs([])).toEqual(defaultParams())
  })

  it('fills missing trailing params with their defaults', () => {
    const params = fromArgs([0.5, 0, 880])
    expect(params.volume).toBe(0.5)
    expect(params.randomness).toBe(0)
    expect(params.frequency).toBe(880)
    expect(params.attack).toBe(PARAM_SPECS.attack.default)
    expect(params.filter).toBe(PARAM_SPECS.filter.default)
  })

  it('treats null/undefined holes as "use default", like sparse zzfx literals', () => {
    const params = fromArgs([0.5, undefined, 880, null])
    expect(params.randomness).toBe(PARAM_SPECS.randomness.default)
    expect(params.attack).toBe(PARAM_SPECS.attack.default)
  })

  it('clamps out-of-range values', () => {
    const params = fromArgs([50, -10])
    expect(params.volume).toBe(1)
    expect(params.randomness).toBe(0)
  })

  it('ignores extra elements beyond the 21st position', () => {
    const args = new Array(25).fill(0)
    const params = fromArgs(args)
    expect(Object.keys(params)).toHaveLength(21)
  })
})

describe('round-trip: fromArgs(toArgs(params)) === clamp(params)', () => {
  it('round-trips a sparse, partially-edited param set', () => {
    const params = defaultParams()
    params.frequency = 660
    params.attack = 0.05
    params.release = 0.3
    params.shape = 2

    const roundTripped = fromArgs(toArgs(params))
    for (const key of PARAM_ORDER) {
      expect(roundTripped[key]).toBeCloseTo(params[key], 9)
    }
  })

  it('round-trips every-param-changed (dense) case', () => {
    const params = defaultParams()
    const keys = Object.keys(params) as ParamKey[]
    keys.forEach((key, i) => {
      const spec = PARAM_SPECS[key]
      // Nudge every param off its default, staying in range.
      params[key] = clampParam(key, spec.default + spec.step * (i + 1))
    })

    const roundTripped = fromArgs(toArgs(params))
    for (const key of PARAM_ORDER) {
      expect(roundTripped[key]).toBeCloseTo(params[key], 9)
    }
  })
})

describe('fromPartial', () => {
  it('fills every omitted key with its default', () => {
    const params = fromPartial({ frequency: 880 })
    expect(params.frequency).toBe(880)
    expect(params.volume).toBe(PARAM_SPECS.volume.default)
    expect(params.filter).toBe(PARAM_SPECS.filter.default)
  })

  it('returns all defaults for an empty object', () => {
    expect(fromPartial({})).toEqual(defaultParams())
  })

  it('clamps every provided value', () => {
    const params = fromPartial({ volume: 50, randomness: -10, shape: 2.6 })
    expect(params.volume).toBe(1)
    expect(params.randomness).toBe(0)
    expect(params.shape).toBe(3)
  })

  it('ignores keys not present in the partial without touching the rest', () => {
    const params = fromPartial({ attack: 0.3, decay: 0.4 })
    expect(params.attack).toBeCloseTo(0.3)
    expect(params.decay).toBeCloseTo(0.4)
    expect(params.sustain).toBe(PARAM_SPECS.sustain.default)
  })
})

describe('category / style option lists', () => {
  it('exposes 12 categories and 15 styles per the spec', () => {
    expect(CATEGORIES).toHaveLength(12)
    expect(STYLES).toHaveLength(15)
  })

  it('MAX_STYLES is 3', () => {
    expect(MAX_STYLES).toBe(3)
  })
})
