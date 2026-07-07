import { describe, it, expect, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { SpriteSheetLoader } from './SpriteSheetLoader'
import { Sprite2D } from '../sprites/Sprite2D'
import { ROTATED_FRAME_MASK } from '../materials/effectFlagBits'
import type { SpriteSheet } from '../sprites/types'

function mockLoad(json: unknown): Promise<SpriteSheet> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) })
  )
  const texture = new Texture()
  texture.image = { width: 256, height: 256 }
  vi.spyOn(
    SpriteSheetLoader as unknown as { loadTexture(url: string, o?: unknown): Promise<Texture> },
    'loadTexture'
  ).mockResolvedValue(texture)
  return (
    SpriteSheetLoader as unknown as {
      loadUncached(url: string, o?: unknown): Promise<SpriteSheet>
    }
  ).loadUncached('/atlas/tp.json')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  universe.reset()
})

describe('TexturePacker compatibility (#95)', () => {
  it('rotated frames occupy the swapped-dims atlas region (pixi convention)', async () => {
    const sheet = await mockLoad({
      frames: {
        // 64×32 sprite packed rotated: atlas rect is 32×64 at (16, 32)
        rotated: {
          frame: { x: 16, y: 32, w: 64, h: 32 },
          rotated: true,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 64, h: 32 },
          sourceSize: { w: 64, h: 32 },
        },
      },
      meta: { image: 'tp.png', size: { w: 256, h: 256 }, scale: '1' },
    })

    const frame = sheet.getFrame('rotated')
    expect(frame.rotated).toBe(true)
    // Atlas rect: swapped dims (32 wide, 64 tall), normalized /256
    expect(frame.width).toBeCloseTo(32 / 256)
    expect(frame.height).toBeCloseTo(64 / 256)
    // y flipped to v-up: image y=32, rect height 64 → v = 1 - (32+64)/256
    expect(frame.y).toBeCloseTo(1 - 96 / 256)
    // Source dims stay unrotated (drives sprite scale)
    expect(frame.sourceWidth).toBe(64)
    expect(frame.sourceHeight).toBe(32)
  })

  it('setFrame sets/clears the rotated system flag', async () => {
    const sheet = await mockLoad({
      frames: {
        rot: {
          frame: { x: 0, y: 0, w: 64, h: 32 },
          rotated: true,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 64, h: 32 },
          sourceSize: { w: 64, h: 32 },
        },
        flat: {
          frame: { x: 64, y: 0, w: 64, h: 32 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 64, h: 32 },
          sourceSize: { w: 64, h: 32 },
        },
      },
      meta: { image: 'tp.png', size: { w: 256, h: 256 }, scale: '1' },
    })

    const sprite = new Sprite2D({ texture: sheet.texture })
    sprite.setFrame(sheet.getFrame('rot'))
    expect(sprite._systemFlags & ROTATED_FRAME_MASK).toBe(ROTATED_FRAME_MASK)

    sprite.setFrame(sheet.getFrame('flat'))
    expect(sprite._systemFlags & ROTATED_FRAME_MASK).toBe(0)
  })

  it('trimmed frames bake trim scale + offset into the matrix (no stretch)', async () => {
    const sheet = await mockLoad({
      frames: {
        trimmed: {
          frame: { x: 0, y: 0, w: 40, h: 20 },
          rotated: false,
          trimmed: true,
          // 40×20 opaque rect at (10, 4) inside a 64×32 source
          spriteSourceSize: { x: 10, y: 4, w: 40, h: 20 },
          sourceSize: { w: 64, h: 32 },
        },
      },
      meta: { image: 'tp.png', size: { w: 256, h: 256 }, scale: '1' },
    })

    const sprite = new Sprite2D({ texture: sheet.texture })
    sprite.setFrame(sheet.getFrame('trimmed'))
    expect(sprite._trimSX).toBeCloseTo(40 / 64)
    expect(sprite._trimSY).toBeCloseTo(20 / 32)
    // Trimmed-rect center (30, 14)px inside 64×32 → offsets from center
    expect(sprite._trimOX).toBeCloseTo(30 / 64 - 0.5)
    expect(sprite._trimOY).toBeCloseTo(0.5 - 14 / 32)

    // The matrix scales the quad down to the trimmed rect
    sprite.scale.set(64, 32, 1) // source-size scale (as updateSize would set)
    sprite.updateMatrix()
    expect(sprite.matrix.elements[0]).toBeCloseTo(40)
    expect(sprite.matrix.elements[5]).toBeCloseTo(20)
    // Translation carries the trim offset (position 0 + offset*scale)
    expect(sprite.matrix.elements[12]).toBeCloseTo((30 / 64 - 0.5) * 64)
    expect(sprite.matrix.elements[13]).toBeCloseTo((0.5 - 14 / 32) * 32)

    // Switching to an untrimmed frame resets the bake
    sprite.setFrame({
      name: 'plain',
      x: 0,
      y: 0,
      width: 0.25,
      height: 0.125,
      sourceWidth: 64,
      sourceHeight: 32,
    })
    expect(sprite._trimSX).toBe(1)
    expect(sprite._trimOX).toBe(0)
  })
})
