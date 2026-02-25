import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpriteSheetLoader } from './SpriteSheetLoader'

// Mock fetch
const mockJSONHash = {
  frames: {
    player_idle_0: {
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    },
    player_idle_1: {
      frame: { x: 32, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    },
  },
  meta: {
    image: 'player.png',
    size: { w: 128, h: 128 },
    scale: '1',
  },
}

const mockJSONArray = {
  frames: [
    {
      filename: 'enemy_walk_0',
      frame: { x: 0, y: 0, w: 64, h: 64 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
    },
    {
      filename: 'enemy_walk_1',
      frame: { x: 64, y: 0, w: 64, h: 64 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
    },
  ],
  meta: {
    image: 'enemy.png',
    size: { w: 256, h: 256 },
    scale: '1',
  },
}

describe('SpriteSheetLoader', () => {
  beforeEach(() => {
    SpriteSheetLoader.clearCache()
    vi.clearAllMocks()
  })

  describe('parseJSONHash', () => {
    it('should parse JSON Hash format correctly', () => {
      // Access private method via type assertion for testing
      const loader = SpriteSheetLoader as unknown as {
        parseJSONHash: typeof SpriteSheetLoader['parseJSONHash']
      }

      // @ts-expect-error - accessing private method for testing
      const result = SpriteSheetLoader.parseJSONHash(mockJSONHash)

      expect(result.frames.size).toBe(2)
      expect(result.imagePath).toBe('player.png')
      expect(result.width).toBe(128)
      expect(result.height).toBe(128)

      const frame = result.frames.get('player_idle_0')
      expect(frame).toBeDefined()
      expect(frame?.x).toBe(0)
      // Y is flipped for UV coordinates: 1 - (imageY/height) - (frameHeight/height)
      // Frame at y=0, h=32 in 128px image: 1 - 0 - 0.25 = 0.75
      expect(frame?.y).toBe(0.75)
      expect(frame?.width).toBe(32 / 128)
      expect(frame?.height).toBe(32 / 128)
      expect(frame?.sourceWidth).toBe(32)
      expect(frame?.sourceHeight).toBe(32)
    })
  })

  describe('parseJSONArray', () => {
    it('should parse JSON Array format correctly', () => {
      // @ts-expect-error - accessing private method for testing
      const result = SpriteSheetLoader.parseJSONArray(mockJSONArray)

      expect(result.frames.size).toBe(2)
      expect(result.imagePath).toBe('enemy.png')
      expect(result.width).toBe(256)
      expect(result.height).toBe(256)

      const frame = result.frames.get('enemy_walk_0')
      expect(frame).toBeDefined()
      expect(frame?.x).toBe(0)
      // Y is flipped for UV coordinates: 1 - (imageY/height) - (frameHeight/height)
      // Frame at y=0, h=64 in 256px image: 1 - 0 - 0.25 = 0.75
      expect(frame?.y).toBe(0.75)
      expect(frame?.width).toBe(64 / 256)
      expect(frame?.height).toBe(64 / 256)
      expect(frame?.sourceWidth).toBe(64)
      expect(frame?.sourceHeight).toBe(64)
    })
  })

  describe('createSpriteSheet', () => {
    it('should create a SpriteSheet with working methods', () => {
      const frames = new Map([
        [
          'test_frame',
          {
            name: 'test_frame',
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
            sourceWidth: 32,
            sourceHeight: 32,
          },
        ],
      ])

      // @ts-expect-error - accessing private method for testing
      const sheet = SpriteSheetLoader.createSpriteSheet(null, frames, 64, 64)

      expect(sheet.width).toBe(64)
      expect(sheet.height).toBe(64)
      expect(sheet.getFrameNames()).toEqual(['test_frame'])
      expect(sheet.getFrame('test_frame').name).toBe('test_frame')
    })

    it('should throw for missing frames', () => {
      const frames = new Map()

      // @ts-expect-error - accessing private method for testing
      const sheet = SpriteSheetLoader.createSpriteSheet(null, frames, 64, 64)

      expect(() => sheet.getFrame('nonexistent')).toThrow('Frame not found: nonexistent')
    })
  })
})
