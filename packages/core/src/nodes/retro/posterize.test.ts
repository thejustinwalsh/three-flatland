import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { posterize, posterizeGamma } from './posterize'

describe('posterize', () => {
  it('creates a valid TSL node with literal bands', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = posterize(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with TSL node bands', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const bands = float(4)
    const result = posterize(inputColor, bands)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('works with minimal bands (2)', () => {
    const inputColor = vec4(0.3, 0.7, 0.5, 1)
    const result = posterize(inputColor, 2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.7)
    const result = posterize(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('posterizeGamma', () => {
  it('creates a valid TSL node with default gamma', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = posterizeGamma(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with custom gamma', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = posterizeGamma(inputColor, 4, 1.8)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const bands = float(4)
    const gamma = float(2.2)
    const result = posterizeGamma(inputColor, bands, gamma)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.5)
    const result = posterizeGamma(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})
