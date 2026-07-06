import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Texture } from 'three'
import { SpriteSheetLoader } from './SpriteSheetLoader'
import { getAtlasMesh } from './atlasMeshRegistry'
import type { SpriteSheet } from '../sprites/types'

// Drive the loader's private static parse + createSpriteSheet through the
// public load path with fetch/texture mocked.
function mockLoad(json: unknown): Promise<SpriteSheet> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(json),
    })
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
  ).loadUncached('/atlas/test.json')
}

const baseFrame = {
  frame: { x: 0, y: 0, w: 64, h: 64 },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
  sourceSize: { w: 64, h: 64 },
}

describe('atlas mesh format extension', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('legacy atlases without mesh data load with frame.mesh null', async () => {
    const sheet = await mockLoad({
      frames: { plain: { ...baseFrame } },
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    expect(sheet.getFrame('plain').mesh).toBeNull()
    expect(sheet.meshVerts).toBeUndefined()
    expect(sheet.meshIndices).toBeUndefined()
    expect(getAtlasMesh(sheet.texture)).toBeNull()
  })

  it('parses the native mesh field (locals + frame-local UVs, pre-triangulated)', async () => {
    const sheet = await mockLoad({
      frames: {
        tri: {
          ...baseFrame,
          mesh: {
            verts: [
              [-0.5, -0.5, 0, 0],
              [0.5, -0.5, 1, 0],
              [0, 0.5, 0.5, 1],
            ],
            indices: [0, 1, 2],
          },
        },
      },
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    const mesh = sheet.getFrame('tri').mesh!
    expect(mesh.vertexCount).toBe(3)
    expect([...mesh.indices]).toEqual([0, 1, 2])
    expect(mesh.verts[0]).toBeCloseTo(-0.5)
    expect(mesh.verts[3]).toBeCloseTo(0)

    // Sheet-level concatenation + registry
    expect(sheet.meshVerts!.length).toBe(12)
    expect(sheet.meshIndices!.length).toBe(3)
    expect(mesh.vertexOffset).toBe(0)
    expect(mesh.indexOffset).toBe(0)
    expect(getAtlasMesh(sheet.texture)).not.toBeNull()
  })

  it('normalizes TexturePacker polygon output (pixels, y-down) to locals + frame UVs', async () => {
    const sheet = await mockLoad({
      frames: [
        {
          filename: 'poly',
          ...baseFrame,
          vertices: [
            [0, 0], // top-left in source pixels
            [64, 0], // top-right
            [32, 64], // bottom-center
          ],
          verticesUV: [
            [0, 0],
            [64, 0],
            [32, 64],
          ],
          triangles: [[0, 1, 2]],
        },
      ],
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    const mesh = sheet.getFrame('poly').mesh!
    expect(mesh.vertexCount).toBe(3)
    // (0,0) source-pixel (top-left) → local (-0.5, +0.5), uv (0, 1)
    expect(mesh.verts[0]).toBeCloseTo(-0.5)
    expect(mesh.verts[1]).toBeCloseTo(0.5)
    expect(mesh.verts[2]).toBeCloseTo(0)
    expect(mesh.verts[3]).toBeCloseTo(1)
    // (32,64) bottom-center → local (0, -0.5), uv (0.5, 0)
    expect(mesh.verts[8]).toBeCloseTo(0)
    expect(mesh.verts[9]).toBeCloseTo(-0.5)
    expect(mesh.verts[10]).toBeCloseTo(0.5)
    expect(mesh.verts[11]).toBeCloseTo(0)
    // Winding swapped to stay CCW after the y flip
    expect([...mesh.indices]).toEqual([0, 2, 1])
  })

  it('concatenates multiple meshed frames with correct offsets', async () => {
    const triMesh = {
      verts: [
        [-0.5, -0.5, 0, 0],
        [0.5, -0.5, 1, 0],
        [0, 0.5, 0.5, 1],
      ] as [number, number, number, number][],
      indices: [0, 1, 2],
    }
    const quadMesh = {
      verts: [
        [-0.5, -0.5, 0, 0],
        [0.5, -0.5, 1, 0],
        [-0.5, 0.5, 0, 1],
        [0.5, 0.5, 1, 1],
      ] as [number, number, number, number][],
      indices: [0, 1, 2, 2, 1, 3],
    }
    const sheet = await mockLoad({
      frames: {
        a: { ...baseFrame, mesh: triMesh },
        b: { ...baseFrame, mesh: quadMesh },
        plain: { ...baseFrame },
      },
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    expect(sheet.meshVerts!.length).toBe((3 + 4) * 4)
    expect(sheet.meshIndices!.length).toBe(3 + 6)

    const a = sheet.getFrame('a').mesh!
    const b = sheet.getFrame('b').mesh!
    expect(a.vertexOffset).toBe(0)
    expect(a.indexOffset).toBe(0)
    expect(b.vertexOffset).toBe(3)
    expect(b.indexOffset).toBe(3)
    expect(sheet.getFrame('plain').mesh).toBeNull()

    const registered = getAtlasMesh(sheet.texture)!
    expect(registered.frames.length).toBe(2)
    expect(registered.meshVerts).toBe(sheet.meshVerts)
  })
})
