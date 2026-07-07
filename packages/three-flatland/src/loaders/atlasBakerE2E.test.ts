import { describe, it, expect, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { bakeAtlas, type AtlasSource } from '@three-flatland/atlas'
import { SpriteSheetLoader } from './SpriteSheetLoader'
import { buildEnvelopeGeometry } from '../pipeline/envelopeGeometry'
import type { SpriteSheet } from '../sprites/types'

/**
 * End-to-end: bake an atlas with @three-flatland/atlas → load the JSON
 * through SpriteSheetLoader → build the tight-mesh envelope the render
 * path consumes. Closes the loop across #81 (format), #82 (runtime),
 * and #83 (baker).
 */

function circleSource(name: string, size: number, radius: number): AtlasSource {
  const rgba = new Uint8Array(size * size * 4)
  const c = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      if (dx * dx + dy * dy <= radius * radius) {
        const o = (y * size + x) * 4
        rgba[o + 3] = 255
      }
    }
  }
  return { name, width: size, height: size, rgba }
}

function loadBakedJson(json: unknown): Promise<SpriteSheet> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) })
  )
  const texture = new Texture()
  texture.image = { width: 128, height: 128 }
  vi.spyOn(
    SpriteSheetLoader as unknown as { loadTexture(url: string, o?: unknown): Promise<Texture> },
    'loadTexture'
  ).mockResolvedValue(texture)
  return (
    SpriteSheetLoader as unknown as {
      loadUncached(url: string, o?: unknown): Promise<SpriteSheet>
    }
  ).loadUncached('/atlas/baked.json')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('baker → loader → envelope end-to-end', () => {
  it('a baked circle atlas produces a tight envelope smaller than the quad', async () => {
    const baked = bakeAtlas([circleSource('ball', 64, 24), circleSource('pebble', 32, 12)], {
      vertexBudget: 10,
    })

    const sheet = await loadBakedJson(baked.json)
    const ball = sheet.getFrame('ball')
    expect(ball.mesh).not.toBeNull()
    expect(sheet.meshVerts).toBeDefined()

    const geometry = buildEnvelopeGeometry(sheet.texture)!
    expect(geometry).not.toBeNull()
    const position = geometry.getAttribute('position')
    expect(position.count).toBeGreaterThanOrEqual(4)

    // Envelope area < unit quad area — the overdraw win exists
    let area = 0
    for (let i = 0; i < position.count; i++) {
      const j = (i + 1) % position.count
      area += position.getX(i) * position.getY(j) - position.getX(j) * position.getY(i)
    }
    area = Math.abs(area / 2)
    expect(area).toBeLessThan(1.0)
    expect(area).toBeGreaterThan(0.4) // still contains the r=24/64 circle
  })
})
