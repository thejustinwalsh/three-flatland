import { describe, it, expect } from 'vitest'
import { Color } from 'three'
import { deltaEOklab, relativeLuminance, contrastRatio, wcagLevel } from './distance'

describe('deltaEOklab', () => {
  it('identical colors have distance 0', () => {
    const c = new Color(0.5, 0.3, 0.7)
    expect(deltaEOklab(c, c)).toBeCloseTo(0, 5)
  })

  it('black vs white has maximum distance', () => {
    const black = new Color(0, 0, 0)
    const white = new Color(1, 1, 1)
    expect(deltaEOklab(black, white)).toBeCloseTo(1, 1)
  })

  it('similar colors have small distance', () => {
    const a = new Color(0.5, 0.3, 0.2)
    const b = new Color(0.52, 0.31, 0.21)
    expect(deltaEOklab(a, b)).toBeLessThan(0.05)
  })
})

describe('relativeLuminance', () => {
  it('white has luminance 1', () => {
    expect(relativeLuminance(new Color(1, 1, 1))).toBeCloseTo(1, 3)
  })

  it('black has luminance 0', () => {
    expect(relativeLuminance(new Color(0, 0, 0))).toBeCloseTo(0, 5)
  })

  it('uses Rec. 709 weights', () => {
    // Green contributes more than red or blue
    const lR = relativeLuminance(new Color(1, 0, 0))
    const lG = relativeLuminance(new Color(0, 1, 0))
    const lB = relativeLuminance(new Color(0, 0, 1))
    expect(lG).toBeGreaterThan(lR)
    expect(lR).toBeGreaterThan(lB)
  })
})

describe('contrastRatio', () => {
  it('black on white returns 21', () => {
    const black = new Color(0, 0, 0)
    const white = new Color(1, 1, 1)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0)
  })

  it('same color returns 1', () => {
    const c = new Color(0.5, 0.5, 0.5)
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    const a = new Color(0.2, 0.4, 0.6)
    const b = new Color(0.9, 0.8, 0.7)
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5)
  })
})

describe('wcagLevel', () => {
  it('black on white is AAA', () => {
    expect(wcagLevel(new Color(0, 0, 0), new Color(1, 1, 1))).toBe('AAA')
  })

  it('same color fails', () => {
    const c = new Color(0.5, 0.5, 0.5)
    expect(wcagLevel(c, c)).toBe('fail')
  })
})
