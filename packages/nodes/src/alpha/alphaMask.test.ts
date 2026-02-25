import { describe, it, expect } from 'vitest'
import { vec4, vec2, float } from 'three/tsl'
import { Texture } from 'three'
import { alphaMask, alphaMaskValue, alphaMaskInvert } from './alphaMask'

describe('alphaMask', () => {
  it('creates a valid TSL node with mask texture', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const maskTex = new Texture()
    const maskUV = vec2(0.5, 0.5)
    const result = alphaMask(inputColor, maskTex, maskUV)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts strength parameter', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const maskTex = new Texture()
    const maskUV = vec2(0.5, 0.5)
    const result = alphaMask(inputColor, maskTex, maskUV, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('alphaMaskValue', () => {
  it('creates a valid TSL node with literal mask value', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = alphaMaskValue(inputColor, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as mask', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const mask = float(0.5)
    const result = alphaMaskValue(inputColor, mask)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('alphaMaskInvert', () => {
  it('creates a valid TSL node with inverted mask', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const maskTex = new Texture()
    const maskUV = vec2(0.5, 0.5)
    const result = alphaMaskInvert(inputColor, maskTex, maskUV)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
