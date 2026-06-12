import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import {
  linearRgbToOklch,
  oklchToLinearRgb,
  rgbToOklch,
  oklchToRgb,
  oklchHueShift,
  oklchSaturate,
  oklchLightness,
  oklabToOklchNode,
  oklchToOklabNode,
} from './oklch'

describe('linearRgbToOklch', () => {
  it('creates a valid TSL node', () => {
    const result = linearRgbToOklch(vec4(1, 0, 0, 1))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklchToLinearRgb', () => {
  it('creates a valid TSL node', () => {
    const result = oklchToLinearRgb(vec4(0.63, 0.26, 0.5, 1))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('rgbToOklch', () => {
  it('creates a valid TSL node', () => {
    const result = rgbToOklch(vec4(0.8, 0.3, 0.5, 1))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklchToRgb', () => {
  it('creates a valid TSL node', () => {
    const result = oklchToRgb(vec4(0.7, 0.15, 3.14, 1))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklchHueShift', () => {
  it('creates a valid TSL node with literal angle', () => {
    const result = oklchHueShift(vec4(1, 0, 0, 1), Math.PI / 2)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as angle', () => {
    const result = oklchHueShift(vec4(1, 0, 0, 1), float(1.5))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklchSaturate', () => {
  it('creates a valid TSL node with literal amount', () => {
    const result = oklchSaturate(vec4(0.5, 0.5, 0.5, 1), 1.5)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as amount', () => {
    const result = oklchSaturate(vec4(0.5, 0.5, 0.5, 1), float(0))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('oklchLightness', () => {
  it('creates a valid TSL node with literal amount', () => {
    const result = oklchLightness(vec4(0.5, 0.5, 0.5, 1), 0.2)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as amount', () => {
    const result = oklchLightness(vec4(0.5, 0.5, 0.5, 1), float(-0.1))
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('rgbToOklch negative-input guard', () => {
  it('constructs without throwing for out-of-range input (clamp guard via rgbToOklab)', () => {
    const outOfRange = vec4(-0.2, 1.4, 3.1, 1)
    expect(() => rgbToOklch(outOfRange)).not.toThrow()
    const result = rgbToOklch(outOfRange)
    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('shared polar helpers', () => {
  it('oklabToOklchNode and oklchToOklabNode build valid vec4 nodes', () => {
    const lch = oklabToOklchNode(vec4(0.63, 0.22, 0.13, 1))
    expect(lch).toBeDefined()
    expect(lch.nodeType).toBeDefined()
    const lab = oklchToOklabNode(vec4(0.63, 0.26, 1.5, 1))
    expect(lab).toBeDefined()
    expect(lab.nodeType).toBeDefined()
  })
})
