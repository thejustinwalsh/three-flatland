import { describe, it, expect } from 'vitest'
import { vec4, vec3 } from 'three/tsl'
import { tint, tintAdditive } from './tint'

describe('tint', () => {
  it('creates a valid TSL node with literal color', () => {
    const inputColor = vec4(1, 1, 1, 1)
    const result = tint(inputColor, [1, 0, 0])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as tint color', () => {
    const inputColor = vec4(1, 1, 1, 1)
    const tintColor = vec3(1, 0, 0)
    const result = tint(inputColor, tintColor)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts strength parameter', () => {
    const inputColor = vec4(1, 1, 1, 1)
    const result = tint(inputColor, [1, 0, 0], 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('tintAdditive', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = tintAdditive(inputColor, [1, 1, 1], 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
