import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { contrast, contrastSCurve } from './contrast'

describe('contrast', () => {
  it('creates a valid TSL node with increased contrast', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = contrast(inputColor, 1.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with decreased contrast', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = contrast(inputColor, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom midpoint', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = contrast(inputColor, 1.5, 0.3)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const amount = float(1.5)
    const midpoint = float(0.5)
    const result = contrast(inputColor, amount, midpoint)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('contrastSCurve', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = contrastSCurve(inputColor, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
