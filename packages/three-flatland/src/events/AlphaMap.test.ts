import { describe, it, expect } from 'vitest'
import { AlphaMap } from './AlphaMap'
import type { SpriteFrame } from '../sprites/types'

// 4×4 alpha data, row-major from the TOP (like canvas getImageData):
// top half opaque (255), bottom half transparent (0)
const data = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0])

describe('AlphaMap', () => {
  const map = new AlphaMap(data, 4, 4)

  it('samples atlas UV with bottom-left origin (Y flip)', () => {
    expect(map.sampleAtlasUV(0.25, 0.875)).toBe(255) // near top
    expect(map.sampleAtlasUV(0.25, 0.125)).toBe(0) // near bottom
  })

  it('clamps out-of-range UVs', () => {
    expect(map.sampleAtlasUV(-1, 2)).toBe(255) // clamps to top-left
    expect(map.sampleAtlasUV(2, -1)).toBe(0) // clamps to bottom-right
  })

  it('maps frame-local UV through the frame rect', () => {
    // Frame covering the top half of the atlas (UV y 0.5..1.0)
    const frame: SpriteFrame = {
      name: 'top',
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
      sourceWidth: 4,
      sourceHeight: 2,
    }
    expect(map.sampleFrame(0.5, 0.5, frame)).toBe(255)
    // Frame covering the bottom half
    const bottom: SpriteFrame = { ...frame, name: 'bottom', y: 0 }
    expect(map.sampleFrame(0.5, 0.5, bottom)).toBe(0)
  })
})
