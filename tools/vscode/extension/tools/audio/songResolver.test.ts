import { describe, expect, it } from 'vitest'
import { parseSongLiteralText } from './songResolver'

describe('parseSongLiteralText', () => {
  it("parses a true positional call's arg text — [instruments], [patterns], [sequence], bpm — directly, no unwrap", () => {
    const result = parseSongLiteralText('[[0.6, 0, 220]], [[[0, 0, 12, 12]]], [0], 120', 'this zzfxm() call')
    expect(result).toEqual({
      song: {
        instruments: [[0.6, 0, 220]],
        patterns: [[[0, 0, 12, 12]]],
        sequence: [0],
        bpm: 120,
      },
    })
  })

  it('parses a positional call with no bpm — 3 elements, bpm omitted from the Song', () => {
    const result = parseSongLiteralText('[[0.5, 0, 300]], [[[0, 0, 12, 12]]], [0]', 'this zzfxm() call')
    expect(result).toEqual({
      song: {
        instruments: [[0.5, 0, 300]],
        patterns: [[[0, 0, 12, 12]]],
        sequence: [0],
      },
    })
  })

  it('unwraps a single combined-array text — the varRef.defRange shape (const song = [instruments, patterns, sequence, bpm])', () => {
    const result = parseSongLiteralText('[[[0.6, 0, 220]], [[[0, 0, 12, 12]]], [0], 120]', 'fanfareSong')
    expect(result).toEqual({
      song: {
        instruments: [[0.6, 0, 220]],
        patterns: [[[0, 0, 12, 12]]],
        sequence: [0],
        bpm: 120,
      },
    })
  })

  it('unwraps a single combined-array text with no bpm — 3-element inner tuple', () => {
    const result = parseSongLiteralText('[[[1, 0, 220]], [[[0, 0, 0, 1]]], [0]]', 'laserSong')
    expect(result).toEqual({
      song: {
        instruments: [[1, 0, 220]],
        patterns: [[[0, 0, 0, 1]]],
        sequence: [0],
      },
    })
  })

  it('refuses text that fails the nested-array-literal parse entirely (an identifier, a spread, a call)', () => {
    expect(parseSongLiteralText('...songVar', 'this zzfxm() call')).toEqual({
      loadError: expect.stringContaining('this zzfxm() call'),
    })
    expect(parseSongLiteralText('getSong()', 'this zzfxm() call')).toHaveProperty('loadError')
    expect(parseSongLiteralText('someVar', 'this zzfxm() call')).toHaveProperty('loadError')
  })

  it('refuses a top-level shape that is neither 3-4 positional elements nor a single combined tuple', () => {
    expect(parseSongLiteralText('[1, 2]', 'this zzfxm() call')).toHaveProperty('loadError')
    expect(parseSongLiteralText('[1], [2], [3], [4], [5]', 'this zzfxm() call')).toHaveProperty('loadError')
  })

  it('refuses when instruments is not an array of number arrays', () => {
    const result = parseSongLiteralText('[1, 2, 3], [[[0, 0, 12, 12]]], [0]', 'this zzfxm() call')
    expect(result).toHaveProperty('loadError')
  })

  it('refuses when patterns is not an array of arrays of number arrays', () => {
    const result = parseSongLiteralText('[[0.6, 0, 220]], [0, 0, 12, 12], [0]', 'this zzfxm() call')
    expect(result).toHaveProperty('loadError')
  })

  it('refuses when sequence contains a non-number', () => {
    const result = parseSongLiteralText('[[0.6, 0, 220]], [[[0, 0, 12, 12]]], [null]', 'this zzfxm() call')
    expect(result).toHaveProperty('loadError')
  })

  it('refuses when bpm is present but not a number', () => {
    const result = parseSongLiteralText('[[0.6, 0, 220]], [[[0, 0, 12, 12]]], [0], "fast"', 'this zzfxm() call')
    expect(result).toHaveProperty('loadError')
  })

  it('the loadError message names the label so the UI can point at what failed', () => {
    const result = parseSongLiteralText('someVar', 'laserSong')
    expect(result).toEqual({ loadError: expect.stringContaining('laserSong') })
  })
})
