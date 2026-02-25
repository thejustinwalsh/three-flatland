import { describe, it, expect } from 'vitest'
import { vec2 } from 'three/tsl'
import { pixelate, pixelateBySize } from './pixelate'

describe('pixelate', () => {
  it('creates a valid TSL node with literal resolution', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = pixelate(inputUV, [16, 16])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as resolution', () => {
    const inputUV = vec2(0.5, 0.5)
    const resolutionNode = vec2(16, 16)
    const result = pixelate(inputUV, resolutionNode)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('pixelateBySize', () => {
  it('creates a valid TSL node with literal pixel size', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = pixelateBySize(inputUV, 8)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
