import { describe, expect, it } from 'vitest'
import { fitLabelFontSize } from './labelFit'

describe('fitLabelFontSize', () => {
  it('gives a large region the ceiling size, not an unbounded one', () => {
    expect(fitLabelFontSize(1000, 1000, 1)).toBe(11)
  })

  it('shrinks proportionally to the region — a mid-size region gets a mid-size font', () => {
    // available after padding = 18×18 → fillFraction*18 = 9, under the ceiling
    const size = fitLabelFontSize(20, 20, 1)
    expect(size).toBe(9)
  })

  it('hides the label (returns null) when even the floor size would overflow the region', () => {
    expect(fitLabelFontSize(3, 3, 1)).toBeNull()
  })

  it('hides the label for a region so thin on one axis it has no usable area', () => {
    expect(fitLabelFontSize(50, 1, 1)).toBeNull()
  })

  it('a longer label (more digits) gets a smaller font than a shorter one in the same region', () => {
    // 40×40: shape target hits the ceiling (11) for a short label; an
    // 8-character label is wide enough that the text-width constraint
    // (not the region's shape) becomes the binding one.
    const oneDigit = fitLabelFontSize(40, 40, 1)!
    const eightChars = fitLabelFontSize(40, 40, 8)!
    expect(eightChars).toBeLessThan(oneDigit)
  })

  it('a longer label can flip a region from fitting to not fitting', () => {
    // 20×500: shape target (9, from the narrow width) comfortably fits a
    // single digit, but an 8-character label's estimated width no longer
    // fits even at the floor size.
    expect(fitLabelFontSize(20, 500, 1)).not.toBeNull()
    expect(fitLabelFontSize(20, 500, 8)).toBeNull()
  })

  it('never returns a size whose estimated text width exceeds the region width', () => {
    const w = 12
    const textLength = 3
    const size = fitLabelFontSize(w, 1000, textLength)
    if (size !== null) {
      const estimatedTextWidth = size * textLength * 0.62
      expect(estimatedTextWidth).toBeLessThanOrEqual(w - 2 /* padding */ + 1e-9)
    }
  })

  it('rejects a non-positive region or empty text rather than dividing by zero', () => {
    expect(fitLabelFontSize(0, 20, 1)).toBeNull()
    expect(fitLabelFontSize(20, 0, 1)).toBeNull()
    expect(fitLabelFontSize(20, 20, 0)).toBeNull()
  })

  it('rounds to a whole pixel for crisp SVG text rendering', () => {
    const size = fitLabelFontSize(23, 23, 1)
    expect(size).not.toBeNull()
    expect(Number.isInteger(size)).toBe(true)
  })
})
