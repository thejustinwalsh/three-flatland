import { describe, expect, it } from 'vitest'
import {
  isNumberArrayLiteralText,
  parseNestedArrayLiteral,
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

describe('parseNestedArrayLiteral', () => {
  it('parses a flat number array the same way the flat parser does', () => {
    expect(parseNestedArrayLiteral('[1, 0.05, 220]')).toEqual([1, 0.05, 220])
  })

  it('parses arrays nested to arbitrary depth — the ZzFXM pattern shape (pattern[channel[note...]])', () => {
    expect(parseNestedArrayLiteral('[[[0, 0, 12, 12]]]')).toEqual([[[0, 0, 12, 12]]])
  })

  it("respects bracket depth when splitting top-level elements — inner commas don't fragment the split", () => {
    expect(parseNestedArrayLiteral('[[1, 2], [3, 4]]')).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('accepts null leaves', () => {
    expect(parseNestedArrayLiteral('[1, null, 2]')).toEqual([1, null, 2])
  })

  it('accepts string leaves, unwrapping single and double quotes', () => {
    expect(parseNestedArrayLiteral('["a", \'b\']')).toEqual(['a', 'b'])
  })

  it('strips exactly one trailing comma per bracket level, not a phantom element', () => {
    expect(parseNestedArrayLiteral('[[1, 2,], [3, 4],]')).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('treats an empty array as zero elements', () => {
    expect(parseNestedArrayLiteral('[]')).toEqual([])
    expect(parseNestedArrayLiteral('[[], []]')).toEqual([[], []])
  })

  it('refuses text that is not bracket-wrapped at all', () => {
    expect(parseNestedArrayLiteral('220')).toBeNull()
    expect(parseNestedArrayLiteral('songVar')).toBeNull()
  })

  it('refuses an identifier leaf (a variable reference mid-structure)', () => {
    expect(parseNestedArrayLiteral('[1, someVar, 2]')).toBeNull()
  })

  it('refuses a call expression leaf', () => {
    expect(parseNestedArrayLiteral('[1, getPreset(), 2]')).toBeNull()
  })

  it('refuses an object leaf', () => {
    expect(parseNestedArrayLiteral('[1, { a: 1 }, 2]')).toBeNull()
  })

  it('refuses a spread element', () => {
    expect(parseNestedArrayLiteral('[...songVar]')).toBeNull()
  })

  it('refuses a sparse (internal empty) element at any depth', () => {
    expect(parseNestedArrayLiteral('[1,,2]')).toBeNull()
    expect(parseNestedArrayLiteral('[[1,,2], [3]]')).toBeNull()
  })

  it('refuses a leading comma', () => {
    expect(parseNestedArrayLiteral('[,1,2]')).toBeNull()
  })

  it('refuses unbalanced brackets', () => {
    expect(parseNestedArrayLiteral('[[1, 2]')).toBeNull()
    expect(parseNestedArrayLiteral('[1, 2]]')).toBeNull()
  })

  it('refuses a comma inside a string literal being mistaken for a separator — round-trips correctly instead', () => {
    expect(parseNestedArrayLiteral('["a,b", 1]')).toEqual(['a,b', 1])
  })

  it('a string ending in an escaped backslash (an EVEN trailing-backslash run) still closes on the real quote — not a one-character-lookback false unterminated', () => {
    // Raw source text: ['a\\', 'b'] — the first element's string literal
    // ends in two backslashes (one escaped backslash pair), then its real
    // closing quote. A lookback that only checks `inner[i-1]` sees a bare
    // backslash immediately before that quote and wrongly treats it as
    // still-escaped/still-open. The parser doesn't unescape — it just
    // strips the surrounding quotes — so the parsed value keeps both
    // raw backslash characters.
    expect(parseNestedArrayLiteral("['a\\\\', 'b']")).toEqual(['a\\\\', 'b'])
  })

  it('a string ending in a genuinely escaped quote (an ODD trailing-backslash run) is correctly rejected as unterminated', () => {
    // Raw source text: ['a\'] — the lone backslash escapes the quote, so
    // there is no real closing quote left in the string at all.
    expect(parseNestedArrayLiteral("['a\\']")).toBeNull()
  })
})
