import { describe, it, expect } from 'vitest'
import { Vector2 } from 'three'
import { ForwardPlusLighting, TILE_SIZE, MAX_LIGHTS_PER_TILE } from './ForwardPlusLighting'
import { Light2D } from './Light2D'

describe('ForwardPlusLighting constants', () => {
  it('should export TILE_SIZE', () => {
    expect(TILE_SIZE).toBe(16)
  })

  it('should export MAX_LIGHTS_PER_TILE', () => {
    expect(MAX_LIGHTS_PER_TILE).toBe(16)
  })
})

describe('ForwardPlusLighting', () => {
  it('should construct with placeholder texture', () => {
    const fp = new ForwardPlusLighting()
    expect(fp.tileTexture).not.toBeNull()
    expect(fp.tileTexture.image.width).toBe(MAX_LIGHTS_PER_TILE / 4)
    expect(fp.tileTexture.image.height).toBe(1)
    expect(fp.tileCountX).toBe(0)
  })

  it('should init with screen dimensions', () => {
    const fp = new ForwardPlusLighting()
    fp.init(160, 160)

    expect(fp.tileCountX).toBe(Math.ceil(160 / TILE_SIZE))
    expect(fp.tileTexture).not.toBeNull()
    expect(fp.tileCountXNode.value).toBe(Math.ceil(160 / TILE_SIZE))
  })

  it('should create tile texture with correct dimensions', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)

    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)
    const tileCount = tileCountX * tileCountY

    const tex = fp.tileTexture!
    expect(tex.image.width).toBe(MAX_LIGHTS_PER_TILE / 4) // blocksPerTile
    expect(tex.image.height).toBe(tileCount)
  })

  it('should update with lights', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))

    const lights = [
      new Light2D({ type: 'point', position: [10, 10], intensity: 1, distance: 50 }),
      new Light2D({ type: 'point', position: [50, 50], intensity: 1, distance: 50 }),
    ]

    // Should not throw
    fp.update(lights)
    // tileTexture should exist after update
    expect(fp.tileTexture).not.toBeNull()
  })

  it('should skip ambient lights in tiling', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))

    const lights = [
      new Light2D({ type: 'ambient', intensity: 0.3 }),
    ]

    fp.update(lights)

    // Ambient lights should not be in any tile
    const data = fp.tileTexture!.image.data as Float32Array
    // All values should be 0 (no lights assigned to tiles)
    let hasNonZero = false
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(false)
  })

  it('should skip disabled lights', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))

    const light = new Light2D({ type: 'point', position: [10, 10], intensity: 1 })
    light.enabled = false

    fp.update([light])

    const data = fp.tileTexture!.image.data as Float32Array
    let hasNonZero = false
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(false)
  })

  it('should resize without errors', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.resize(128, 128)

    expect(fp.tileCountX).toBe(Math.ceil(128 / TILE_SIZE))
  })

  it('should preserve stable texture reference across resize', () => {
    const fp = new ForwardPlusLighting()
    const tex = fp.tileTexture

    fp.init(64, 64)
    // Texture reference stays the same (resized in-place)
    expect(fp.tileTexture).toBe(tex)

    // Same tile count — no reinit
    fp.resize(64, 64)
    expect(fp.tileTexture).toBe(tex)

    // Different tile count — still same reference
    fp.resize(128, 128)
    expect(fp.tileTexture).toBe(tex)
  })

  it('should create a tile lookup function', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))
    fp.update([new Light2D({ type: 'point', intensity: 1 })])

    const lookup = fp.createTileLookup()
    expect(typeof lookup).toBe('function')
  })

  it('should dispose without errors', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    // Should not throw
    fp.dispose()
  })

  it('should update world-space uniform nodes via setWorldBounds', () => {
    const fp = new ForwardPlusLighting()
    fp.setWorldBounds(new Vector2(800, 600), new Vector2(-400, -300))

    expect(fp.worldSizeNode.value.x).toBe(800)
    expect(fp.worldSizeNode.value.y).toBe(600)
    expect(fp.worldOffsetNode.value.x).toBe(-400)
    expect(fp.worldOffsetNode.value.y).toBe(-300)
  })
})
