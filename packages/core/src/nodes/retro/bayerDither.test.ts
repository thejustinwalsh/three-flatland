import { describe, it, expect } from 'vitest'
import { vec4, vec2, float } from 'three/tsl'
import { bayerDither, bayerDither2x2, bayerDither4x4, bayerDither8x8 } from './bayerDither'

describe('bayerDither', () => {
  it('creates a valid TSL node with default parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = bayerDither(inputColor)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with custom levels', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = bayerDither(inputColor, 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with custom scale', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = bayerDither(inputColor, 2, 2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with screen coordinates', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const coord = vec2(100, 100)
    const result = bayerDither(inputColor, 2, 1, coord)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const levels = float(4)
    const scale = float(2)
    const coord = vec2(100, 100)
    const result = bayerDither(inputColor, levels, scale, coord)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.7)
    const result = bayerDither(inputColor, 2)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('bayerDither2x2', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = bayerDither2x2(inputColor)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with screen coordinates', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const coord = vec2(50, 50)
    const result = bayerDither2x2(inputColor, 2, 1, coord)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('bayerDither4x4', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = bayerDither4x4(inputColor)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with different level counts', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)

    const result2 = bayerDither4x4(inputColor, 2)
    const result4 = bayerDither4x4(inputColor, 4)
    const result8 = bayerDither4x4(inputColor, 8)

    expect(result2).toBeDefined()
    expect(result4).toBeDefined()
    expect(result8).toBeDefined()
  })
})

describe('bayerDither8x8', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = bayerDither8x8(inputColor)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with all parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const coord = vec2(200, 200)
    const result = bayerDither8x8(inputColor, 8, 2, coord)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
