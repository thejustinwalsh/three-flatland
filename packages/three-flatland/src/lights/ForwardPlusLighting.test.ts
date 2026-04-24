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

    // Ambient lights should not be in any tile — scan only the
    // light-index blocks (stride 8 per tile; first 4 texels / 16
    // floats carry light indices, remaining 4 texels are meta/reserved).
    const data = fp.tileTexture!.image.data as Float32Array
    const TILE_STRIDE = 8
    const BLOCKS_PER_TILE = 4
    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)
    let hasNonZero = false
    for (let tileIdx = 0; tileIdx < tileCountX * tileCountY; tileIdx++) {
      const base = tileIdx * TILE_STRIDE * 4
      for (let i = 0; i < BLOCKS_PER_TILE * 4; i++) {
        if (data[base + i] !== 0) {
          hasNonZero = true
          break
        }
      }
      if (hasNonZero) break
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

    // Same scan pattern as the ambient-light test — inspect only
    // light-index blocks; meta texels carry fillScale=1.0 fallbacks.
    const data = fp.tileTexture!.image.data as Float32Array
    const TILE_STRIDE = 8
    const BLOCKS_PER_TILE = 4
    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)
    let hasNonZero = false
    for (let tileIdx = 0; tileIdx < tileCountX * tileCountY; tileIdx++) {
      const base = tileIdx * TILE_STRIDE * 4
      for (let i = 0; i < BLOCKS_PER_TILE * 4; i++) {
        if (data[base + i] !== 0) {
          hasNonZero = true
          break
        }
      }
      if (hasNonZero) break
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
    const TILE_STRIDE = 8
    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)

    // The light is at (2,2) with radius 4 → must reach tile (0,0) but not the
    // far-corner tile.
    const tileHasLight = (tx: number, ty: number): boolean => {
      const tileIdx = ty * tileCountX + tx
      const base = tileIdx * TILE_STRIDE * 4
      // Scan the first MAX_LIGHTS_PER_TILE slots (light-index blocks only;
      // meta texels after those are not part of the light list).
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
    const TILE_STRIDE = 8
    const tileCountX = Math.ceil(64 / TILE_SIZE)
    const tileCountY = Math.ceil(64 / TILE_SIZE)
    for (let ty = 0; ty < tileCountY; ty++) {
      for (let tx = 0; tx < tileCountX; tx++) {
        const tileIdx = ty * tileCountX + tx
        const base = tileIdx * TILE_STRIDE * 4
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

  it('should bias score via Light2D.importance', () => {
    // Two overlapping equal-intensity lights competing for slots in a
    // 1-tile viewport full of filler lights. The one with higher
    // `importance` should win the slot.
    const fp = new ForwardPlusLighting()
    fp.init(16, 16)
    fp.setWorldBounds(new Vector2(16, 16), new Vector2(0, 0))

    // Fill the tile with MAX shadow-casting fillers at baseline intensity.
    const lights: Light2D[] = []
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) {
      lights.push(new Light2D({ type: 'point', position: [8, 8], intensity: 1, castsShadow: true }))
    }
    // Incoming light at same position + intensity but importance 100 —
    // should evict one of the fillers.
    lights.push(
      new Light2D({ type: 'point', position: [8, 8], intensity: 1, castsShadow: true, importance: 100 })
    )
    fp.update(lights)

    const data = fp.tileTexture!.image.data as Float32Array
    const ids = new Set<number>()
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) ids.add(data[i] as number)
    expect(ids.has(MAX_LIGHTS_PER_TILE + 1)).toBe(true) // importance-boosted light won a slot
  })

  it('should cap fill lights (castsShadow=false) per tile and write fillScale for compensation', () => {
    // Scene: one tile, 10 non-shadow-casting "fill" lights. Quota =
    // MAX_FILL_LIGHTS_PER_TILE (currently 2). Expect 2 fill slots
    // claimed + a fillScale of 10/2 = 5 in the meta texel.
    const fp = new ForwardPlusLighting()
    fp.init(16, 16)
    fp.setWorldBounds(new Vector2(16, 16), new Vector2(0, 0))

    const FILL_COUNT = 10
    const lights: Light2D[] = []
    for (let i = 0; i < FILL_COUNT; i++) {
      lights.push(
        new Light2D({ type: 'point', position: [8, 8], intensity: 1, castsShadow: false })
      )
    }
    fp.update(lights)

    const data = fp.tileTexture!.image.data as Float32Array
    const TILE_STRIDE = 8
    const BLOCKS_PER_TILE = 4
    const META_BLOCK_INDEX = BLOCKS_PER_TILE
    const metaBase = (0 * TILE_STRIDE + META_BLOCK_INDEX) * 4

    // Only 2 slots should be filled (the others stay zero).
    let fillSlotsUsed = 0
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) {
      if (data[i] !== 0) fillSlotsUsed++
    }
    expect(fillSlotsUsed).toBe(2)

    // fillScale = inRange / kept = 10 / 2 = 5
    expect(data[metaBase]).toBeCloseTo(5)
    // Reserved meta channels should remain zero.
    expect(data[metaBase + 1]).toBe(0)
    expect(data[metaBase + 2]).toBe(0)
    expect(data[metaBase + 3]).toBe(0)
  })

  it('should not let fill lights evict hero lights', () => {
    // Scene: one tile. First, fill with MAX hero lights. Then add a
    // super-bright fill light. Hero lights should stay (fills never
    // displace heroes); the fill bumps fillInRange but gets no slot.
    const fp = new ForwardPlusLighting()
    fp.init(16, 16)
    fp.setWorldBounds(new Vector2(16, 16), new Vector2(0, 0))

    const lights: Light2D[] = []
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) {
      lights.push(
        new Light2D({ type: 'point', position: [8, 8], intensity: 1, castsShadow: true })
      )
    }
    // Try to crash a fill into the full tile.
    lights.push(
      new Light2D({ type: 'point', position: [8, 8], intensity: 1000, castsShadow: false })
    )

    fp.update(lights)

    const data = fp.tileTexture!.image.data as Float32Array
    const ids = new Set<number>()
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) ids.add(data[i] as number)
    // Super-bright fill (id 17) must NOT have won a slot.
    expect(ids.has(MAX_LIGHTS_PER_TILE + 1)).toBe(false)
    // All hero lights (ids 1..MAX) should still be present.
    for (let id = 1; id <= MAX_LIGHTS_PER_TILE; id++) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('should leave fillScale at 1.0 when no fills reach a tile', () => {
    const fp = new ForwardPlusLighting()
    fp.init(16, 16)
    fp.setWorldBounds(new Vector2(16, 16), new Vector2(0, 0))

    // Only hero lights — no fills in range.
    const lights: Light2D[] = [
      new Light2D({ type: 'point', position: [8, 8], intensity: 1, castsShadow: true }),
    ]
    fp.update(lights)

    const data = fp.tileTexture!.image.data as Float32Array
    const TILE_STRIDE = 8
    const metaBase = 4 * 4 // META_BLOCK_INDEX=4, 4 floats per texel
    // With no fills, kept = 0 so fillScale falls back to 1.0.
    expect(data[metaBase]).toBeCloseTo(1)
  })
})
