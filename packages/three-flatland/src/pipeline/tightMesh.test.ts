import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteGroup } from './SpriteGroup'
import { convexHull, fanTriangulate } from './convexHull'
import { buildEnvelopeGeometry } from './envelopeGeometry'
import { registerAtlasMesh } from '../loaders/atlasMeshRegistry'
import { BatchGeometryStrategy } from '../ecs/traits'
import type { RegistryData } from '../ecs/batchUtils'
import type { SpriteFrame, SpriteFrameMesh } from '../sprites/types'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 64, height: 64 }
  return texture
}

function makeMeshedFrame(name: string, points: [number, number][]): SpriteFrame {
  const verts = new Float32Array(points.length * 4)
  points.forEach(([x, y], i) => {
    verts[i * 4 + 0] = x
    verts[i * 4 + 1] = y
    verts[i * 4 + 2] = x + 0.5
    verts[i * 4 + 3] = y + 0.5
  })
  const mesh: SpriteFrameMesh = {
    verts,
    indices: Uint16Array.from(fanTriangulate(points.length)),
    vertexCount: points.length,
    vertexOffset: 0,
    indexOffset: 0,
  }
  return {
    name,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    sourceWidth: 64,
    sourceHeight: 64,
    mesh,
  }
}

function registerDiamondAtlas(texture: Texture, complete = true): void {
  // A diamond silhouette — the hull should be notably smaller than the quad
  const frame = makeMeshedFrame('diamond', [
    [0, -0.5],
    [0.5, 0],
    [0, 0.5],
    [-0.5, 0],
  ])
  registerAtlasMesh(texture, {
    frames: [frame],
    complete,
    meshVerts: frame.mesh!.verts,
    meshIndices: frame.mesh!.indices,
  })
}

describe('convex hull + fan triangulation', () => {
  it('computes a CCW hull and drops interior points', () => {
    const hull = convexHull([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5], // interior
      [0, 0], // duplicate
    ])
    expect(hull.length).toBe(4)
    // CCW: signed area positive
    let area = 0
    for (let i = 0; i < hull.length; i++) {
      const [x1, y1] = hull[i]!
      const [x2, y2] = hull[(i + 1) % hull.length]!
      area += x1 * y2 - x2 * y1
    }
    expect(area).toBeGreaterThan(0)
  })

  it('fan triangulation covers n-2 triangles', () => {
    expect(fanTriangulate(4)).toEqual([0, 1, 2, 0, 2, 3])
    expect(fanTriangulate(6).length).toBe(12)
  })
})

describe('per-batch envelope geometry (tight-mesh Option A)', () => {
  afterEach(() => {
    universe.reset()
  })

  it('returns null without registered atlas polygons', () => {
    expect(buildEnvelopeGeometry(makeTexture())).toBeNull()
    expect(buildEnvelopeGeometry(null)).toBeNull()
  })

  it('builds the hull of the atlas polygons with position-derived UVs', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)

    const geometry = buildEnvelopeGeometry(texture)!
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    expect(position.count).toBe(4) // the diamond
    expect(uv.count).toBe(4)
    // Envelope area (0.5) is half the quad's — that's the overdraw win
    // UV = local + 0.5 for every vertex
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(position.getX(i) + 0.5)
      expect(uv.getY(i)).toBeCloseTo(position.getY(i) + 0.5)
    }
    expect(geometry.getIndex()!.count).toBe((4 - 2) * 3)
  })

  it('incomplete atlases degrade the hull toward the full quad (no clipping)', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture, false)

    const geometry = buildEnvelopeGeometry(texture)!
    const position = geometry.getAttribute('position')
    // Quad corners joined the hull — diamond points are interior now
    expect(position.count).toBe(4)
    const xs = new Set<number>()
    for (let i = 0; i < position.count; i++) xs.add(Math.abs(position.getX(i)))
    expect(xs.has(0.5)).toBe(true)
  })
})

describe('tight-mesh batch routing', () => {
  let group: SpriteGroup

  beforeEach(() => {
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
    universe.reset()
  })

  function registryData(): RegistryData {
    return (group as unknown as { _getRegistry(): RegistryData | null })._getRegistry()!
  }

  it('alpha-blend material with registered atlas polygons routes to tight-mesh batches', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(true)

    group.add(new Sprite2D({ texture, material }))
    group.add(new Sprite2D({ texture, material }))
    group.update()

    const data = registryData()
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.geometry.getAttribute('position')).toBeDefined()
    expect(mesh.geometry.getAttribute('position').count).toBe(4) // diamond hull
    expect(data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind).toBe('tight-mesh')
  })

  it('alphaTest materials stay on the synth quad even with atlas polygons', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const material = new Sprite2DMaterial({ map: texture, alphaTest: 0.5 })
    expect(material._tightMesh).toBe(false)

    group.add(new Sprite2D({ texture, material }))
    group.update()

    const data = registryData()
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.geometry.getAttribute('position')).toBeUndefined()
    expect(data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind).toBe('synth-quad')
  })

  it('transparent material without atlas polygons falls back to synth quad', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(false)

    group.add(new Sprite2D({ texture, material }))
    group.update()

    const data = registryData()
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.geometry.getAttribute('position')).toBeUndefined()
    expect(data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind).toBe('synth-quad')
  })

  it('a strategy flip bumps the schema version so existing batches rebuild', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(false)
    const before = material._effectSchemaVersion

    // Atlas polygons arrive after the material was created
    registerDiamondAtlas(texture)
    material.setTexture(texture)

    expect(material._tightMesh).toBe(true)
    expect(material._effectSchemaVersion).toBeGreaterThan(before)
  })

  it('tight-mesh strategy shrinks the effect-float budget to 16', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const tight = new Sprite2DMaterial({ map: texture, transparent: true })
    const synth = new Sprite2DMaterial({ map: makeTexture(), transparent: true })

    expect(tight.maxEffectFloats).toBe(16)
    expect(synth.maxEffectFloats).toBe(24)
  })
})
