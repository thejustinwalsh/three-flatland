import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { saturate, grayscale } from './saturate'

describe('saturate', () => {
  it('creates a valid TSL node with literal amount', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = saturate(inputColor, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as amount', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const amount = float(0)
    const result = saturate(inputColor, amount)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('supports oversaturation', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = saturate(inputColor, 1.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('grayscale', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(1, 0.5, 0, 1)
    const result = grayscale(inputColor)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
