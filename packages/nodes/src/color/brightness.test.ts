import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { brightness, brightnessMultiply, brightnessClamped } from './brightness'

describe('brightness', () => {
  it('creates a valid TSL node with positive adjustment', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = brightness(inputColor, 0.2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with negative adjustment', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = brightness(inputColor, -0.3)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as amount', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const amount = float(0.2)
    const result = brightness(inputColor, amount)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('brightnessMultiply', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = brightnessMultiply(inputColor, 2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('brightnessClamped', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = brightnessClamped(inputColor, 0.8)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
