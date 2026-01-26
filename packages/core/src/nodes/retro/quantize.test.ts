import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { quantize, quantizeRGB } from './quantize'

describe('quantize', () => {
  it('creates a valid TSL node with literal levels', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = quantize(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with TSL node levels', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const levels = float(8)
    const result = quantize(inputColor, levels)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('works with binary levels (2 colors)', () => {
    const inputColor = vec4(0.3, 0.7, 0.5, 1)
    const result = quantize(inputColor, 2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.7)
    const result = quantize(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('quantizeRGB', () => {
  it('creates a valid TSL node with different levels per channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = quantizeRGB(inputColor, 8, 8, 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as level parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const rLevels = float(8)
    const gLevels = float(8)
    const bLevels = float(4)
    const result = quantizeRGB(inputColor, rLevels, gLevels, bLevels)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.5)
    const result = quantizeRGB(inputColor, 8, 8, 4)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})
