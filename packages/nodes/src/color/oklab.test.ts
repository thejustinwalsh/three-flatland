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
