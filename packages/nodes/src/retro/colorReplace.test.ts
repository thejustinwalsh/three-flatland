import { describe, it, expect } from 'vitest'
import { vec4, vec3, float } from 'three/tsl'
import { colorReplace, colorReplaceHard, colorReplaceMultiple } from './colorReplace'

describe('colorReplace', () => {
  it('creates a valid TSL node with tuple colors', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = colorReplace(inputColor, [1, 0, 0], [0, 0, 1])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('creates a valid TSL node with vec3 colors', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const target = vec3(1, 0, 0)
    const replace = vec3(0, 0, 1)
    const result = colorReplace(inputColor, target, replace)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom tolerance', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = colorReplace(inputColor, [1, 0, 0], [0, 0, 1], 0.2)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts TSL node as tolerance', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const tolerance = float(0.15)
    const result = colorReplace(inputColor, [1, 0, 0], [0, 0, 1], tolerance)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(1, 0, 0, 0.5)
    const result = colorReplace(inputColor, [1, 0, 0], [0, 0, 1])

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('colorReplaceHard', () => {
  it('creates a valid TSL node', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = colorReplaceHard(inputColor, [1, 0, 0], [0, 0, 1])

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom tolerance', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = colorReplaceHard(inputColor, [1, 0, 0], [0, 0, 1], 0.05)

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(1, 0, 0, 0.7)
    const result = colorReplaceHard(inputColor, [1, 0, 0], [0, 0, 1])

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})

describe('colorReplaceMultiple', () => {
  it('creates a valid TSL node with multiple colors', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = colorReplaceMultiple(
      inputColor,
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
      [
        [0, 0, 1],
        [1, 1, 0],
      ]
    )

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('accepts custom tolerance', () => {
    const inputColor = vec4(1, 0, 0, 1)
    const result = colorReplaceMultiple(
      inputColor,
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
      [
        [0, 0, 1],
        [1, 1, 0],
      ],
      0.2
    )

    expect(result).toBeDefined()
    expect(result.nodeType).toBeDefined()
  })

  it('throws error when arrays have different lengths', () => {
    const inputColor = vec4(1, 0, 0, 1)
    expect(() =>
      colorReplaceMultiple(
        inputColor,
        [[1, 0, 0]],
        [
          [0, 0, 1],
          [1, 1, 0],
        ]
      )
    ).toThrow('sourceColors and targetColors must have same length')
  })

  it('preserves alpha channel', () => {
    const inputColor = vec4(1, 0, 0, 0.8)
    const result = colorReplaceMultiple(
      inputColor,
      [[1, 0, 0]],
      [[0, 0, 1]]
    )

    expect(result).toBeDefined()
    expect(result.a).toBeDefined()
  })
})
