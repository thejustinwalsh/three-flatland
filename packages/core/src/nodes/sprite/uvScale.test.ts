import { describe, it, expect } from 'vitest'
import { vec2 } from 'three/tsl'
import { uvScale } from './uvScale'

describe('uvScale', () => {
  it('creates a valid TSL node with literal values', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvScale(inputUV, [2, 2])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as scale parameter', () => {
    const inputUV = vec2(0.5, 0.5)
    const scaleNode = vec2(2, 2)
    const result = uvScale(inputUV, scaleNode)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom pivot point', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvScale(inputUV, [2, 2], [0, 0])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as pivot', () => {
    const inputUV = vec2(0.5, 0.5)
    const pivotNode = vec2(0.5, 0.5)
    const result = uvScale(inputUV, [2, 2], pivotNode)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
