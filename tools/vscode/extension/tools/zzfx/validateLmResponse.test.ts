import { describe, expect, it } from 'vitest'
import { PARAM_SPECS } from '../../../webview/zzfx/params'
import { validateLmResponse } from './validateLmResponse'

describe('validateLmResponse', () => {
  it('accepts a clean JSON object of recognized params', () => {
    const result = validateLmResponse('{"volume":0.6,"frequency":880}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.params.volume).toBeCloseTo(0.6)
      expect(result.params.frequency).toBe(880)
      // Omitted keys fall back to their spec default.
      expect(result.params.attack).toBe(PARAM_SPECS.attack.default)
    }
  })

  it('strips a single ```json ... ``` fence', () => {
    const result = validateLmResponse('```json\n{"volume":0.5}\n```')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.params.volume).toBeCloseTo(0.5)
  })

  it('strips a bare ``` ... ``` fence (no "json" tag)', () => {
    const result = validateLmResponse('```\n{"volume":0.5}\n```')
    expect(result.ok).toBe(true)
  })

  it('rejects unparseable JSON', () => {
    const result = validateLmResponse('not json at all')
    expect(result.ok).toBe(false)
  })

  it('rejects a JSON array (not an object)', () => {
    const result = validateLmResponse('[1, 0.05, 220]')
    expect(result.ok).toBe(false)
  })

  it('rejects null', () => {
    const result = validateLmResponse('null')
    expect(result.ok).toBe(false)
  })

  it('rejects an empty response', () => {
    const result = validateLmResponse('')
    expect(result.ok).toBe(false)
  })

  it('filters out unrecognized keys but keeps the recognized ones', () => {
    const result = validateLmResponse('{"volume":0.7,"reverb":0.9,"totallyMadeUp":42}')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.params.volume).toBeCloseTo(0.7)
  })

  it('filters out non-numeric values but keeps the numeric ones', () => {
    const result = validateLmResponse('{"volume":0.7,"frequency":"loud"}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.params.volume).toBeCloseTo(0.7)
      expect(result.params.frequency).toBe(PARAM_SPECS.frequency.default)
    }
  })

  it('rejects an object with only unrecognized/non-numeric keys — zero usable keys', () => {
    const result = validateLmResponse('{"reverb":0.9,"frequency":"loud"}')
    expect(result.ok).toBe(false)
  })

  it('filters out a value that overflows to Infinity (valid JSON exponent syntax, non-finite result)', () => {
    // `1e400` is valid JSON number syntax but overflows to Infinity in
    // JS — a real edge case the `Number.isFinite` filter exists for.
    const result = validateLmResponse('{"volume":1e400,"frequency":880}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.params.volume).toBe(PARAM_SPECS.volume.default)
      expect(result.params.frequency).toBe(880)
    }
  })

  it('clamps out-of-range numeric values rather than rejecting them', () => {
    const result = validateLmResponse('{"volume":50,"randomness":-10}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.params.volume).toBe(1)
      expect(result.params.randomness).toBe(0)
    }
  })
})
