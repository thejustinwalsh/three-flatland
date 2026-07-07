import { describe, it, expect } from 'vitest'
import { resolveBeat, type SceneBeat } from './beats'

const beats: SceneBeat[] = [
  { camera: { position: [0, 0, 10], lookAt: [0, 0, 0], zoom: 1 } },
  { camera: { position: [0, 0, 6], lookAt: [0, 0, 0], zoom: 1 } },
]

describe('resolveBeat', () => {
  it('returns the beat at the index', () => {
    expect(resolveBeat(beats, 1)).toBe(beats[1])
  })
  it('clamps a too-large index to the last beat', () => {
    expect(resolveBeat(beats, 99)).toBe(beats[1])
  })
  it('clamps a negative index to the first beat', () => {
    expect(resolveBeat(beats, -5)).toBe(beats[0])
  })
  it('throws on empty beats', () => {
    expect(() => resolveBeat([], 0)).toThrow()
  })
})
