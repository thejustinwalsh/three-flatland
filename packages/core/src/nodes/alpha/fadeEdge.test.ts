import { describe, it, expect } from 'vitest'
import { vec4, vec2, float } from 'three/tsl'
import { fadeEdge, fadeEdgeRadial, fadeEdgeHorizontal, fadeEdgeVertical } from './fadeEdge'

describe('fadeEdge', () => {
  it('creates a valid TSL node with default edge width', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const result = fadeEdge(inputColor, inputUV)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom edge width', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const result = fadeEdge(inputColor, inputUV, 0.3)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as edge width', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const edgeWidth = float(0.2)
    const result = fadeEdge(inputColor, inputUV, edgeWidth)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('fadeEdgeRadial', () => {
  it('creates a valid TSL node with default radii', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const result = fadeEdgeRadial(inputColor, inputUV)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom radii', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const result = fadeEdgeRadial(inputColor, inputUV, 0.2, 0.4)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('fadeEdgeHorizontal', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const result = fadeEdgeHorizontal(inputColor, inputUV, 0.15)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})

describe('fadeEdgeVertical', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const inputUV = vec2(0.5, 0.5)
    const result = fadeEdgeVertical(inputColor, inputUV, 0.15)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })
})
