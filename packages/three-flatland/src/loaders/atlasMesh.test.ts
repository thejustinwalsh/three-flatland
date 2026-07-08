import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Texture } from 'three'
import { SpriteSheetLoader } from './SpriteSheetLoader'
import { getAtlasMesh } from './atlasMeshRegistry'
import { buildEnvelopeGeometry } from '../pipeline/envelopeGeometry'
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

  it('a rotated TexturePacker frame parses the same unrotated-space mesh as an unrotated one', async () => {
    const sheet = await mockLoad({
      frames: [
        {
          filename: 'rot',
          ...baseFrame,
          rotated: true,
          vertices: [
            [0, 0],
            [64, 0],
            [32, 64],
          ],
          triangles: [[0, 1, 2]],
        },
      ],
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    // Mesh positions/UVs are derived from sourceWidth/sourceHeight and the
    // trim rect, neither of which vary with `rotated` — so this matches the
    // unrotated 'poly' case above verbatim. Atlas rotation is a sampling-time
    // concern (ROTATED_FRAME_MASK unrotation in the shader), not a mesh one.
    const mesh = sheet.getFrame('rot').mesh!
    expect(mesh.vertexCount).toBe(3)
    expect(mesh.verts[0]).toBeCloseTo(-0.5)
    expect(mesh.verts[1]).toBeCloseTo(0.5)
    expect(mesh.verts[2]).toBeCloseTo(0)
    expect(mesh.verts[3]).toBeCloseTo(1)
    expect(mesh.verts[8]).toBeCloseTo(0)
    expect(mesh.verts[9]).toBeCloseTo(-0.5)
    expect(mesh.verts[10]).toBeCloseTo(0.5)
    expect(mesh.verts[11]).toBeCloseTo(0)
    expect([...mesh.indices]).toEqual([0, 2, 1])
  })

  it('a rotated ASYMMETRIC trimmed frame keeps unrotated-space positions and trim-relative UVs', async () => {
    // 64×32 source, trimmed to a 40×20 rect at (8, 6), packed rotated.
    // Asymmetric dims would expose any accidental w/h swap in the mesh
    // math (a square frame cannot); trim exposes the UV denominators.
    const sheet = await mockLoad({
      frames: [
        {
          filename: 'asym',
          frame: { x: 0, y: 0, w: 40, h: 20 },
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 8, y: 6, w: 40, h: 20 },
          sourceSize: { w: 64, h: 32 },
          vertices: [
            [8, 6], // trim-rect top-left in source pixels
            [48, 6], // trim-rect top-right
            [28, 26], // trim-rect bottom-center
          ],
          triangles: [[0, 1, 2]],
        },
      ],
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    const mesh = sheet.getFrame('asym').mesh!
    expect(mesh.vertexCount).toBe(3)
    // (8,6) source px → local ((8/64)-0.5, 0.5-(6/32)) = (-0.375, 0.3125),
    // trim-relative uv ((8-8)/40, 1-(6-6)/20) = (0, 1)
    expect(mesh.verts[0]).toBeCloseTo(-0.375)
    expect(mesh.verts[1]).toBeCloseTo(0.3125)
    expect(mesh.verts[2]).toBeCloseTo(0)
    expect(mesh.verts[3]).toBeCloseTo(1)
    // (28,26) → local ((28/64)-0.5, 0.5-(26/32)) = (-0.0625, -0.3125),
    // uv ((28-8)/40, 1-(26-6)/20) = (0.5, 0)
    expect(mesh.verts[8]).toBeCloseTo(-0.0625)
    expect(mesh.verts[9]).toBeCloseTo(-0.3125)
    expect(mesh.verts[10]).toBeCloseTo(0.5)
    expect(mesh.verts[11]).toBeCloseTo(0)
    expect([...mesh.indices]).toEqual([0, 2, 1])
  })

  it('a rotated polygon frame contributes its hull to buildEnvelopeGeometry (previously excluded)', async () => {
    const sheet = await mockLoad({
      frames: [
        {
          filename: 'rot',
          ...baseFrame,
          rotated: true,
          vertices: [
            [0, 0],
            [64, 0],
            [32, 64],
          ],
          triangles: [[0, 1, 2]],
        },
      ],
      meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
    })

    // Single rotated frame, mesh present → registry sees it as `complete`,
    // and the envelope hull is the triangle itself, not the 4-corner quad
    // fallback a null mesh would have degraded to.
    expect(getAtlasMesh(sheet.texture)!.complete).toBe(true)
    const geometry = buildEnvelopeGeometry(sheet.texture)!
    const position = geometry.getAttribute('position')
    expect(position.count).toBe(3)
    const points = new Set<string>()
    for (let i = 0; i < position.count; i++) {
      points.add(`${position.getX(i).toFixed(1)},${position.getY(i).toFixed(1)}`)
    }
    expect(points).toEqual(new Set(['-0.5,0.5', '0.5,0.5', '0.0,-0.5']))
  })

  it('a meshless sheet over a meshed texture degrades the envelope (no clipping)', async () => {
    const meshed = await mockLoad({
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
    expect(getAtlasMesh(meshed.texture)!.complete).toBe(true)

    // Second, meshless sheet resolving to the SAME texture instance
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            frames: { plain: { ...baseFrame } },
            meta: { image: 'test.png', size: { w: 128, h: 128 }, scale: '1' },
          }),
      })
    )
    vi.spyOn(
      SpriteSheetLoader as unknown as { loadTexture(url: string, o?: unknown): Promise<Texture> },
      'loadTexture'
    ).mockResolvedValue(meshed.texture)
    await (
      SpriteSheetLoader as unknown as {
        loadUncached(url: string, o?: unknown): Promise<SpriteSheet>
      }
    ).loadUncached('/atlas/other.json')

    expect(getAtlasMesh(meshed.texture)!.complete).toBe(false)
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
  })
})
