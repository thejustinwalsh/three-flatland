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

  // ── rotated frames ────────────────────────────────────────────────────────
  //
  // The renderer (Sprite2DMaterial._buildBaseColor) computes:
  //   atlasUV = localUV * (frame.width, frame.height) + (frame.x, frame.y)
  // with NO rotation correction, even when frame.rotated === true.
  // sampleFrame must reproduce the same plain linear remap so that the
  // alpha mask agrees with the pixels the GPU actually draws.
  //
  // Atlas layout for the rotated-frame tests (4×4, row-major from top):
  //   row 0 (UV v=1.0..0.75): pixels [0..3]  = 255
  //   row 1 (UV v=0.75..0.5): pixels [4..7]  = 255
  //   row 2 (UV v=0.5..0.25): pixels [8..11] =   0
  //   row 3 (UV v=0.25..0.0): pixels [12..15]=   0
  //
  // Frame rect: top-right quadrant — x=0.5, y=0.5, width=0.5, height=0.5
  // That quadrant in atlas coords spans columns 2-3 (U 0.5..1.0) and
  // rows 0-1 (V 0.75..1.0, i.e. top half) — all opaque.
  //
  // With rotated=true the SpriteFrame carries swapped pixel dimensions
  // (TexturePacker stores the atlas bounding box, not the logical size),
  // but the renderer's atlas-UV formula is unchanged.  sampleFrame must
  // therefore return the same value for the same (localU, localV) pair
  // regardless of the rotated flag — the linear remap decides the texel.

  describe('rotated frame', () => {
    // 4×4 atlas: left half opaque (255), right half transparent (0)
    // row-major from top: [255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0]
    const asymmetricData = new Uint8Array([
      255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0,
    ])
    const asymmetricMap = new AlphaMap(asymmetricData, 4, 4)

    // Frame occupies the full atlas, with rotated=true.
    // TexturePacker CW rotation stores w=originalHeight, h=originalWidth,
    // but the renderer uses the stored frame.width/height as-is for the
    // linear remap — no UV rotation is applied.
    const rotatedFrame: SpriteFrame = {
      name: 'rotated',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sourceWidth: 32,
      sourceHeight: 64,
      rotated: true,
    }

    it('applies the same plain linear remap regardless of rotated flag', () => {
      // localU=0.25 → atlasU=0.25 → column 1 → opaque (255)
      expect(asymmetricMap.sampleFrame(0.25, 0.5, rotatedFrame)).toBe(255)
      // localU=0.75 → atlasU=0.75 → column 3 → transparent (0)
      expect(asymmetricMap.sampleFrame(0.75, 0.5, rotatedFrame)).toBe(0)
    })

    it('matches sampleFrame without the rotated flag for the same UV', () => {
      // The non-rotated version of the same frame rect must give identical results —
      // no special branch fires on rotated.
      const plainFrame: SpriteFrame = { ...rotatedFrame, name: 'plain', rotated: false }
      for (const [u, v] of [
        [0.1, 0.1],
        [0.5, 0.5],
        [0.9, 0.9],
        [0.25, 0.75],
      ] as [number, number][]) {
        expect(asymmetricMap.sampleFrame(u, v, rotatedFrame)).toBe(
          asymmetricMap.sampleFrame(u, v, plainFrame)
        )
      }
    })
  })

  // ── trimmed frames ────────────────────────────────────────────────────────
  //
  // When a frame is trimmed, the atlas rect (frame.x/y/width/height) holds
  // only the cropped content; the transparent border pixels of the original
  // source are not stored in the atlas.  The renderer's atlas-UV formula is
  // the same plain linear remap regardless — it does NOT offset into the
  // trimmed sub-rect or return transparent for the border region.
  // sampleFrame matches that behavior: it samples from the atlas rect
  // directly, and the trimmed or un-trimmed flag makes no difference to the
  // returned value.
  //
  // Consequence: for trimmed frames the alpha mask is as accurate as the
  // renderer is — both operate on the same texels.  If the renderer is later
  // updated to handle trimming, sampleFrame must be updated in lockstep.

  describe('trimmed frame', () => {
    // 4×4 atlas whose top-left 2×2 block is opaque, rest transparent:
    // row 0: [255, 255, 0, 0]  (UV v 0.75..1.0)
    // row 1: [255, 255, 0, 0]  (UV v 0.5..0.75)
    // row 2: [  0,   0, 0, 0]  (UV v 0.25..0.5)
    // row 3: [  0,   0, 0, 0]  (UV v 0.0..0.25)
    const trimmedData = new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const trimmedMap = new AlphaMap(trimmedData, 4, 4)

    // Frame rect is the top-left 2×2 block (normalized):
    //   x=0, y=0.5, width=0.5, height=0.5  (UV bottom-left origin, so y=0.5 = row 1 bottom)
    // trimOffset gives the pixel-space location within a 4×4 source rect.
    const trimmedFrame: SpriteFrame = {
      name: 'trimmed',
      x: 0,
      y: 0.5,
      width: 0.5,
      height: 0.5,
      sourceWidth: 4,
      sourceHeight: 4,
      trimmed: true,
      trimOffset: { x: 0, y: 0, width: 2, height: 2 },
    }

    it('applies the same plain linear remap regardless of trimmed flag', () => {
      // localU=0.25, localV=0.75 → atlasU=0.125, atlasV=0.875 → row 0 col 0 → opaque
      expect(trimmedMap.sampleFrame(0.25, 0.75, trimmedFrame)).toBe(255)
      // localU=0.75, localV=0.75 → atlasU=0.375, atlasV=0.875 → row 0 col 1 → opaque
      expect(trimmedMap.sampleFrame(0.75, 0.75, trimmedFrame)).toBe(255)
    })

    it('matches sampleFrame without the trimmed flag for the same UV', () => {
      const plainFrame: SpriteFrame = {
        ...trimmedFrame,
        name: 'plain',
        trimmed: false,
        trimOffset: undefined,
      }
      for (const [u, v] of [
        [0.1, 0.1],
        [0.5, 0.5],
        [0.9, 0.9],
      ] as [number, number][]) {
        expect(trimmedMap.sampleFrame(u, v, trimmedFrame)).toBe(
          trimmedMap.sampleFrame(u, v, plainFrame)
        )
      }
    })
  })
})
