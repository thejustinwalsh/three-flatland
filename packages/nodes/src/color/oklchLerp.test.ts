import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { oklchLerp, oklabLerp } from './oklchLerp'

describe('oklchLerp', () => {
  it('creates a valid TSL node with literal t', () => {
    const result = oklchLerp(vec4(1, 0, 0, 1), vec4(0, 0, 1, 1), 0.5)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as t', () => {
    const result = oklchLerp(vec4(1, 0, 0, 1), vec4(0, 1, 0, 1), float(0.3))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklabLerp', () => {
  it('creates a valid TSL node with literal t', () => {
    const result = oklabLerp(vec4(0.5, 0.5, 0.5, 1), vec4(0.8, 0.2, 0.3, 1), 0.5)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as t', () => {
    const result = oklabLerp(vec4(0, 0, 0, 1), vec4(1, 1, 1, 1), float(0.7))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
