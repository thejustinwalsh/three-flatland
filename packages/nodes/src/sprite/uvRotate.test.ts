import { describe, it, expect } from 'vitest'
import { vec2, float } from 'three/tsl'
import { uvRotate } from './uvRotate'

describe('uvRotate', () => {
  it('creates a valid TSL node with literal angle', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvRotate(inputUV, Math.PI / 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as angle parameter', () => {
    const inputUV = vec2(0.5, 0.5)
    const angleNode = float(Math.PI / 4)
    const result = uvRotate(inputUV, angleNode)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom pivot point', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvRotate(inputUV, Math.PI / 2, [0, 0])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
