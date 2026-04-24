import { describe, it, expect } from 'vitest'
import { Vector2 } from 'three'
import {
  ForwardPlusLighting,
  TILE_SIZE,
  MAX_LIGHTS_PER_TILE,
  TILE_TEXTURE_DIM,
} from './ForwardPlusLighting'
import { Light2D } from './Light2D'

describe('ForwardPlusLighting constants', () => {
  it('should export TILE_SIZE', () => {
    expect(TILE_SIZE).toBe(32)
  })

  it('should export MAX_LIGHTS_PER_TILE', () => {
    expect(MAX_LIGHTS_PER_TILE).toBe(16)
  })
})

describe('ForwardPlusLighting', () => {
  it('should construct with the fixed-size tile texture', () => {
    // Texture is pre-allocated at TILE_TEXTURE_DIM × TILE_TEXTURE_DIM and
    // never resized — keeps us below WebGPU's 8192 2D-texture dim limit
    // that the previous tall-narrow layout hit at fullscreen.
    const fp = new ForwardPlusLighting()
    expect(fp.tileTexture).not.toBeNull()
    expect(fp.tileTexture.image.width).toBe(TILE_TEXTURE_DIM)
    expect(fp.tileTexture.image.height).toBe(TILE_TEXTURE_DIM)
    expect(fp.tileCountX).toBe(0)
  })

  it('should init with screen dimensions', () => {
    const fp = new ForwardPlusLighting()
    fp.init(160, 160)

    expect(fp.tileCountX).toBe(Math.ceil(160 / TILE_SIZE))
    expect(fp.tileTexture).not.toBeNull()
    expect(fp.tileCountXNode.value).toBe(Math.ceil(160 / TILE_SIZE))
  })

  it('keeps the tile texture at TILE_TEXTURE_DIM² regardless of viewport', () => {
    // init() only updates uniforms + CPU bookkeeping — it never changes
    // the DataTexture's dimensions. Tile-in-texture indexing stays linear
    // (blocksPerTile texels per tile) in the beginning of the buffer.
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)

    const tex = fp.tileTexture!
    expect(tex.image.width).toBe(TILE_TEXTURE_DIM)
    expect(tex.image.height).toBe(TILE_TEXTURE_DIM)
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

  it('should skip lights that do not reach a tile (distance cutoff)', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))

    // Small-distance light in the far corner — should only affect nearby tiles.
    const light = new Light2D({
      type: 'point',
      position: [2, 2],
      intensity: 1,
      distance: 4,
    })
    fp.update([light])

    const data = fp.tileTexture!.image.data as Float32Array
    const blocksPerTile = MAX_LIGHTS_PER_TILE / 4
    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)

    // The light is at (2,2) with radius 4 → must reach tile (0,0) but not the
    // far-corner tile.
    const tileHasLight = (tx: number, ty: number): boolean => {
      const tileIdx = ty * tileCountX + tx
      const base = tileIdx * blocksPerTile * 4
      for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) {
        if (data[base + i] !== 0) return true
      }
      return false
    }
    expect(tileHasLight(0, 0)).toBe(true)
    expect(tileHasLight(tileCountX - 1, tileCountY - 1)).toBe(false)
  })

  it('should evict the weakest light when a tile overflows', () => {
    const fp = new ForwardPlusLighting()
    fp.init(16, 16) // single tile
    fp.setWorldBounds(new Vector2(16, 16), new Vector2(0, 0))

    // MAX_LIGHTS_PER_TILE dim lights (intensity 0.01) followed by one bright.
    const lights: Light2D[] = []
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) {
      lights.push(
        new Light2D({ type: 'point', position: [8, 8], intensity: 0.01 })
      )
    }
    lights.push(
      new Light2D({ type: 'point', position: [8, 8], intensity: 100 })
    )

    fp.update(lights)

    const data = fp.tileTexture!.image.data as Float32Array
    // Light IDs are lightIdx+1, so the bright light (last) is ID 17.
    let brightFound = false
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) {
      if (data[i] === MAX_LIGHTS_PER_TILE + 1) brightFound = true
    }
    expect(brightFound).toBe(true)
  })

  it('should NOT evict when incoming score ties with the weakest slot', () => {
    const fp = new ForwardPlusLighting()
    fp.init(16, 16)
    fp.setWorldBounds(new Vector2(16, 16), new Vector2(0, 0))

    // All lights identical — the first MAX should win, the overflow should be
    // dropped (no thrash on ties).
    const lights: Light2D[] = []
    for (let i = 0; i < MAX_LIGHTS_PER_TILE + 1; i++) {
      lights.push(
        new Light2D({ type: 'point', position: [8, 8], intensity: 1 })
      )
    }

    fp.update(lights)

    const data = fp.tileTexture!.image.data as Float32Array
    const ids = new Set<number>()
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) ids.add(data[i] as number)
    // Must NOT contain the last light's ID (MAX+1); must contain ID 1..MAX.
    expect(ids.has(MAX_LIGHTS_PER_TILE + 1)).toBe(false)
    for (let id = 1; id <= MAX_LIGHTS_PER_TILE; id++) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('should always place directional lights in every tile', () => {
    const fp = new ForwardPlusLighting()
    fp.init(64, 64)
    fp.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))

    const sun = new Light2D({
      type: 'directional',
      direction: [1, -1],
      intensity: 1,
    })
    fp.update([sun])

    const data = fp.tileTexture!.image.data as Float32Array
    const blocksPerTile = MAX_LIGHTS_PER_TILE / 4
    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)
    for (let ty = 0; ty < tileCountY; ty++) {
      for (let tx = 0; tx < tileCountX; tx++) {
        const tileIdx = ty * tileCountX + tx
        const base = tileIdx * blocksPerTile * 4
        expect(data[base]).toBe(1)
      }
    }
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
