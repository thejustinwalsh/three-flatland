import { describe, expect, it } from 'vitest'
import {
  isNumberArrayLiteralText,
  parseNumberArrayLiteral,
  tokenizeNumberArrayLiteral,
} from './numberArrayLiteral'

describe('tokenizeNumberArrayLiteral', () => {
  it('strips exactly one trailing comma as formatting, not a phantom element', () => {
    expect(tokenizeNumberArrayLiteral('[0.6, 0, 1500,]')).toEqual(['0.6', '0', '1500'])
  })

  it('parses a plain array with no trailing comma unchanged', () => {
    expect(tokenizeNumberArrayLiteral('[0.6, 0, 1500]')).toEqual(['0.6', '0', '1500'])
  })

  it('treats an empty array as zero elements, trailing comma or not', () => {
    expect(tokenizeNumberArrayLiteral('[]')).toEqual([])
    expect(tokenizeNumberArrayLiteral('[ ]')).toEqual([])
  })

  it('refuses a sparse array (an internal empty segment)', () => {
    expect(tokenizeNumberArrayLiteral('[1,,220]')).toBeNull()
  })

  it('refuses a leading comma', () => {
    expect(tokenizeNumberArrayLiteral('[,1,2]')).toBeNull()
  })

  it('refuses a second trailing comma', () => {
    expect(tokenizeNumberArrayLiteral('[1,2,,]')).toBeNull()
  })

  it('refuses a lone comma with nothing else', () => {
    expect(tokenizeNumberArrayLiteral('[,]')).toBeNull()
  })

  it('refuses text that is not bracket-wrapped at all', () => {
    expect(tokenizeNumberArrayLiteral('getPreset()')).toBeNull()
    expect(tokenizeNumberArrayLiteral('0.6, 0, 1500')).toBeNull()
  })
})

describe('isNumberArrayLiteralText', () => {
  it("accepts a trailing-comma literal (this repo's own Prettier style)", () => {
    expect(isNumberArrayLiteralText('[0.6, 0, 1500,]')).toBe(true)
  })

  it('rejects sparse and leading-comma arrays', () => {
    expect(isNumberArrayLiteralText('[1,,220]')).toBe(false)
    expect(isNumberArrayLiteralText('[,1,2]')).toBe(false)
    expect(isNumberArrayLiteralText('[,]')).toBe(false)
  })

  it('rejects a non-numeric element', () => {
    expect(isNumberArrayLiteralText('[0.6, "x", 1500]')).toBe(false)
  })

  it('rejects a call expression', () => {
    expect(isNumberArrayLiteralText('getPreset()')).toBe(false)
  })
})

describe('parseNumberArrayLiteral — the phantom-zero regression', () => {
  it('a trailing-comma literal round-trips to exactly its written element count, no phantom value', () => {
    // The exact shape flagged: const LASER: ZzFXParams = [0.6, 0, 1500,]
    // (Prettier's own trailing-comma style) must resolve to 3 params, not
    // 4 — Number('') === 0 and is finite, so a naive split-and-Number
    // parse synthesizes a phantom trailing 0 that Save then writes back
    // into the user's file, silently changing the sound.
    const result = parseNumberArrayLiteral('[0.6, 0, 1500,]')
    expect(result).toEqual([0.6, 0, 1500])
    expect(result).toHaveLength(3)
  })

  it('a full 12-param trailing-comma literal keeps all 12 params, not 13', () => {
    const twelve = '[0.6, 0, 1500, 0, 0.03, 0.05, 4, 2, 0, 0, 900, 0.03,]'
    expect(parseNumberArrayLiteral(twelve)).toHaveLength(12)
  })

  it('returns empty for anything tokenizeNumberArrayLiteral refuses — sparse, leading comma, non-array', () => {
    expect(parseNumberArrayLiteral('[1,,220]')).toEqual([])
    expect(parseNumberArrayLiteral('[,1,2]')).toEqual([])
    expect(parseNumberArrayLiteral('[,]')).toEqual([])
    expect(parseNumberArrayLiteral('getPreset()')).toEqual([])
  })
})
