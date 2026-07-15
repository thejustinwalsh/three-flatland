import { describe, expect, it } from 'vitest'
import { fitRegionLabelFontSize } from './regionLabelFit'

describe('fitRegionLabelFontSize', () => {
  it('matches the preview policy on comfortable regions (16×16, 2 digits → 7px)', () => {
    // availableW/H = 14; aesthetic = min(11, 14·0.5) = 7; width max = 14/(2·0.62) ≈ 11.3.
    expect(fitRegionLabelFontSize(16, 16, 2)).toBe(7)
  })

  it('caps huge regions at the ceiling', () => {
    expect(fitRegionLabelFontSize(200, 200, 1)).toBe(11)
  })

  it('renders split children the preview policy hides (8×6, 3 digits)', () => {
    // Preview's fit-or-hide returns null here (its 4px floor); the baker
    // policy bends to its 3px floor and the text-width cap keeps it inside.
    const size = fitRegionLabelFontSize(8, 6, 3)
    expect(size).not.toBeNull()
    expect(size!).toBeGreaterThanOrEqual(3)
    // Fit invariant: estimated text width stays inside the region.
    expect(size! * 3 * 0.62).toBeLessThanOrEqual(8)
  })

  it('keeps shrinking below the floor when that is what fits (4×4, 3 digits)', () => {
    const size = fitRegionLabelFontSize(4, 4, 3)
    expect(size).not.toBeNull()
    expect(size!).toBeLessThan(3)
    expect(size! * 3 * 0.62).toBeLessThanOrEqual(4)
  })

  it('hides only degenerate regions where text would be sub-render-size noise', () => {
    expect(fitRegionLabelFontSize(2, 2, 3)).toBeNull()
  })

  it('never exceeds the text-width fit constraint', () => {
    for (const [w, h, len] of [
      [16, 4, 3],
      [10, 10, 4],
      [64, 8, 2],
      [5, 20, 3],
    ] as const) {
      const size = fitRegionLabelFontSize(w, h, len)
      if (size == null) continue
      const padding = Math.min(1, w * 0.125, h * 0.125)
      expect(size * len * 0.62).toBeLessThanOrEqual(w - padding * 2 + 1e-9)
      expect(size).toBeLessThanOrEqual(h - padding * 2 + 1e-9)
    }
  })

  it('rejects empty/invalid inputs', () => {
    expect(fitRegionLabelFontSize(0, 10, 2)).toBeNull()
    expect(fitRegionLabelFontSize(10, 0, 2)).toBeNull()
    expect(fitRegionLabelFontSize(10, 10, 0)).toBeNull()
  })
})
