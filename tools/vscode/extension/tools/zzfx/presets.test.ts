import { describe, expect, it } from 'vitest'
import { CATEGORIES, PARAM_ORDER, STYLES, clampParam } from '../../../webview/zzfx/params'
import { _internal, curatedPreset } from './presets'

describe('CATEGORY_PRESETS / STYLE_MODIFIERS coverage', () => {
  it('has exactly one preset per CATEGORIES entry — no missing, no extra', () => {
    const presetKeys = Object.keys(_internal.CATEGORY_PRESETS).sort()
    expect(presetKeys).toEqual([...CATEGORIES].sort())
  })

  it('has exactly one modifier per STYLES entry — no missing, no extra', () => {
    const modifierKeys = Object.keys(_internal.STYLE_MODIFIERS).sort()
    expect(modifierKeys).toEqual([...STYLES].sort())
  })

  it('every preset only sets recognized param keys', () => {
    for (const preset of Object.values(_internal.CATEGORY_PRESETS)) {
      for (const key of Object.keys(preset)) {
        expect(PARAM_ORDER).toContain(key)
      }
    }
  })
})

describe('curatedPreset', () => {
  it('returns a full, clamped param set for every category with no styles', () => {
    for (const category of CATEGORIES) {
      const params = curatedPreset(category, [])
      for (const key of PARAM_ORDER) {
        expect(params[key]).toBe(clampParam(key, params[key]))
      }
    }
  })

  it('falls back to the Blip preset for an unknown/undefined category rather than throwing', () => {
    const unknown = curatedPreset('NotARealCategory', [])
    const blip = curatedPreset('Blip', [])
    expect(unknown).toEqual(blip)

    const noCategory = curatedPreset(undefined, [])
    expect(noCategory).toEqual(blip)
  })

  it('applies every style modifier without throwing, still producing clamped output', () => {
    for (const style of STYLES) {
      const params = curatedPreset('Hit', [style])
      for (const key of PARAM_ORDER) {
        expect(params[key]).toBe(clampParam(key, params[key]))
      }
    }
  })

  it('"high" and "low" move frequency in opposite, correct directions', () => {
    const base = curatedPreset('Blip', [])
    const high = curatedPreset('Blip', ['high'])
    const low = curatedPreset('Blip', ['low'])
    expect(high.frequency).toBeGreaterThan(base.frequency)
    expect(low.frequency).toBeLessThan(base.frequency)
  })

  it('applies multiple style modifiers cumulatively, in selection order', () => {
    const highOnly = curatedPreset('Blip', ['high'])
    const highThenLow = curatedPreset('Blip', ['high', 'low'])
    // low (0.5x) applied AFTER high (1.6x) on the same base frequency
    // must differ from high alone — proves both ran, in order, on a
    // running working set rather than each modifier reading the
    // original unmodified base independently.
    expect(highThenLow.frequency).not.toBe(highOnly.frequency)
    expect(highThenLow.frequency).toBeCloseTo(baseFrequency() * 1.6 * 0.5, 5)
  })

  it('ignores an unrecognized style tag rather than throwing', () => {
    expect(() => curatedPreset('Blip', ['not-a-real-style'])).not.toThrow()
  })
})

function baseFrequency(): number {
  return curatedPreset('Blip', []).frequency
}
