import { describe, it, expect, beforeAll } from 'vitest'
import { vec4, vec2, float } from 'three/tsl'
import { DataTexture, RGBAFormat, UnsignedByteType, NearestFilter } from 'three'
import { palettize, palettizeDithered, palettizeNearest } from './palettize'

// Create a simple test palette texture
function createTestPalette(colors: number[][]): DataTexture {
  const width = colors.length
  const data = new Uint8Array(width * 4)

  for (let i = 0; i < width; i++) {
    data[i * 4] = Math.floor(colors[i][0] * 255)
    data[i * 4 + 1] = Math.floor(colors[i][1] * 255)
    data[i * 4 + 2] = Math.floor(colors[i][2] * 255)
    data[i * 4 + 3] = 255
  }

  const texture = new DataTexture(data, width, 1, RGBAFormat, UnsignedByteType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true

  return texture
}

describe('palettize', () => {
  let testPalette: DataTexture

  beforeAll(() => {
    // 4-color grayscale palette (GameBoy-like)
    testPalette = createTestPalette([
      [0.06, 0.22, 0.06], // Darkest
      [0.19, 0.38, 0.19],
      [0.55, 0.67, 0.06],
      [0.61, 0.74, 0.06], // Lightest
    ])
  })

  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = palettize(inputColor, testPalette)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom strength', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = palettize(inputColor, testPalette, 0.5)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as strength', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const strength = float(0.7)
    const result = palettize(inputColor, testPalette, strength)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.8)
    const result = palettize(inputColor, testPalette)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('palettizeDithered', () => {
  let testPalette: DataTexture

  beforeAll(() => {
    testPalette = createTestPalette([
      [0, 0, 0],
      [0.33, 0.33, 0.33],
      [0.67, 0.67, 0.67],
      [1, 1, 1],
    ])
  })

  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const result = palettizeDithered(inputColor, testPalette, 4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with screen coordinates', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const coord = vec2(100, 100)
    const result = palettizeDithered(inputColor, testPalette, 4, 0.5, coord)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL nodes as parameters', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)
    const paletteSize = float(4)
    const dither = float(0.5)
    const coord = vec2(50, 50)
    const result = palettizeDithered(inputColor, testPalette, paletteSize, dither, coord)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.6)
    const result = palettizeDithered(inputColor, testPalette, 4)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('palettizeNearest', () => {
  let testPalette: DataTexture

  beforeAll(() => {
    // RGB primary palette
    testPalette = createTestPalette([
      [1, 0, 0], // Red
      [0, 1, 0], // Green
      [0, 0, 1], // Blue
      [1, 1, 0], // Yellow
      [1, 0, 1], // Magenta
      [0, 1, 1], // Cyan
      [1, 1, 1], // White
      [0, 0, 0], // Black
    ])
  })

  it('creates a valid TSL node', () => {
    const inputColor = vec4(0.9, 0.1, 0.1, 1)
    const result = palettizeNearest(inputColor, testPalette, 8)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('works with different palette sizes', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 1)

    const result4 = palettizeNearest(inputColor, testPalette, 4)
    const result8 = palettizeNearest(inputColor, testPalette, 8)
    const result16 = palettizeNearest(inputColor, testPalette, 16)

    expect(result4).toBeDefined()
    expect(result8).toBeDefined()
    expect(result16).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(0.5, 0.5, 0.5, 0.4)
    const result = palettizeNearest(inputColor, testPalette, 8)

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})
