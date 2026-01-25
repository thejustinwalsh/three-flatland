import { describe, it, expect } from 'vitest'
import { vec2, float } from 'three/tsl'
import { uvFlip } from './uvFlip'

describe('uvFlip', () => {
  it('creates a valid TSL node with boolean flip values', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvFlip(inputUV, true, false)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts number flip values', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvFlip(inputUV, 1, 0)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as flip parameters', () => {
    const inputUV = vec2(0.5, 0.5)
    const flipX = float(1)
    const flipY = float(0)
    const result = uvFlip(inputUV, flipX, flipY)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('defaults to no flip when called without flip parameters', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvFlip(inputUV)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
