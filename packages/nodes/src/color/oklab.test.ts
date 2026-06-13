import { describe, it, expect } from 'vitest'
import { vec4 } from 'three/tsl'
import { linearRgbToOklab, oklabToLinearRgb, rgbToOklab, oklabToRgb } from './oklab'

describe('linearRgbToOklab', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = linearRgbToOklab(inputColor)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklabToLinearRgb', () => {
  it('creates a valid TSL node', () => {
    const lab = vec4(0.63, 0.22, 0.13, 1)
    const result = oklabToLinearRgb(lab)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('rgbToOklab', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = rgbToOklab(inputColor)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklabToRgb', () => {
  it('creates a valid TSL node', () => {
    const lab = vec4(0.7, 0.0, 0.0, 1)
    const result = oklabToRgb(lab)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('rgbToOklab negative-input guard', () => {
  it('constructs without throwing for out-of-range input (clamp guard in graph)', () => {
    // Display sRGB is [0,1] by definition; the gamma entry point clamps before
    // the EOTF so an out-of-range input still builds a valid node graph.
    const outOfRange = vec4(-0.5, 1.7, 2.3, 1)
    expect(() => rgbToOklab(outOfRange)).not.toThrow()
    const result = rgbToOklab(outOfRange)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
