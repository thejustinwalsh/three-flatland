import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { hueShift, hueShiftNormalized } from './hueShift'

describe('hueShift', () => {
  it('creates a valid TSL node with literal angle', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = hueShift(inputColor, Math.PI / 2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as angle', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const angle = float(Math.PI)
    const result = hueShift(inputColor, angle)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('hueShiftNormalized', () => {
  it('creates a valid TSL node with normalized amount', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = hueShiftNormalized(inputColor, 0.25)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
