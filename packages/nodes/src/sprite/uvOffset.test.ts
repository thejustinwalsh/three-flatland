import { describe, it, expect } from 'vitest'
import { vec2 } from 'three/tsl'
import { uvOffset } from './uvOffset'

describe('uvOffset', () => {
  it('creates a valid TSL node with literal values', () => {
    const inputUV = vec2(0.5, 0.5)
    const result = uvOffset(inputUV, [0.1, 0.1])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as offset parameter', () => {
    const inputUV = vec2(0.5, 0.5)
    const offsetNode = vec2(0.1, 0.1)
    const result = uvOffset(inputUV, offsetNode)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
