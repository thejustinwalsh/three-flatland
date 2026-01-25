import { describe, it, expect } from 'vitest'
import { vec2, vec4 } from 'three/tsl'
import { Texture } from 'three'
import { outline, outline8 } from './outline'

describe('outline', () => {
  it('creates a valid TSL node with default options', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const tex = new Texture()

    const result = outline(inputColor, inputUV, tex)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom color', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const tex = new Texture()

    const result = outline(inputColor, inputUV, tex, {
      color: [0, 1, 0, 1],
    })

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom thickness and texture size', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const tex = new Texture()

    const result = outline(inputColor, inputUV, tex, {
      thickness: 0.02,
      textureSize: [64, 64],
    })

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('outline8', () => {
  it('creates a valid TSL node with 8-directional sampling', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const tex = new Texture()

    const result = outline8(inputColor, inputUV, tex, {
      color: [1, 1, 1, 1],
    })

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
