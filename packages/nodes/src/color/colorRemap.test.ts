import { describe, it, expect } from 'vitest'
import { vec4, float } from 'three/tsl'
import { Texture } from 'three'
import { colorRemap, colorRemapCustom } from './colorRemap'

describe('colorRemap', () => {
  it('creates a valid TSL node with gradient texture', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const gradientTex = new Texture()
    const result = colorRemap(inputColor, gradientTex)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts strength parameter', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const gradientTex = new Texture()
    const result = colorRemap(inputColor, gradientTex, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as strength', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const gradientTex = new Texture()
    const strength = float(0.5)
    const result = colorRemap(inputColor, gradientTex, strength)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('colorRemapCustom', () => {
  it('creates a valid TSL node with custom lookup value', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const gradientTex = new Texture()
    const result = colorRemapCustom(inputColor, gradientTex, 0.7)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
