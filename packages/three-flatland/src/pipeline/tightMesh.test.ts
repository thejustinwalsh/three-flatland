import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteGroup } from './SpriteGroup'
import { convexHull, fanTriangulate } from './convexHull'
import { buildEnvelopeGeometry } from './envelopeGeometry'
import { registerAtlasMesh, degradeAtlasMesh } from '../loaders/atlasMeshRegistry'
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

  it('a material already over 16 effect floats refuses the tight-mesh flip', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture, transparent: true, effectTier: 20 })
    ;(material as unknown as { _effectTotalFloats: number })._effectTotalFloats = 20

    registerDiamondAtlas(texture)
    material.setTexture(texture)

    expect(material._tightMesh).toBe(false) // stayed synth — no uncompilable pipeline
  })

  it('late atlas registration re-resolves through the version check and rebuilds', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(false)

    group.add(new Sprite2D({ texture, material }))
    group.add(new Sprite2D({ texture, material }))
    group.update()
    const data = registryData()
    expect(data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind).toBe('synth-quad')

    // Loader finishes AFTER the sprites batched
    registerDiamondAtlas(texture)
    group.update()

    expect(material._tightMesh).toBe(true)
    const mesh = data.batchSlots.find((m) => m !== null && !m.isEmpty)!
    expect(mesh.geometry.getAttribute('position')).toBeDefined()
    expect(
      data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind
    ).toBe('tight-mesh')
  })

  it('tight-mesh strategy shrinks the effect-float budget to 16', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const tight = new Sprite2DMaterial({ map: texture, transparent: true })
    const synth = new Sprite2DMaterial({ map: makeTexture(), transparent: true })

    expect(tight.maxEffectFloats).toBe(16)
    expect(synth.maxEffectFloats).toBe(24)
  })

  it('a content-only atlas merge on an already-tight material still rebuilds the envelope', () => {
    const texture = makeTexture()
    // Sheet A: a small triangle well inside the quad.
    registerAtlasMesh(texture, {
      frames: [
        makeMeshedFrame('a', [
          [-0.2, -0.2],
          [0.2, -0.2],
          [0, 0.2],
        ]),
      ],
      complete: true,
    })
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(true)

    group.add(new Sprite2D({ texture, material }))
    group.add(new Sprite2D({ texture, material }))
    group.update()
    const data = registryData()
    const before = data.batchSlots.find((m) => m !== null && !m.isEmpty)!
    const beforePos = before.geometry.getAttribute('position')
    let beforeMax = 0
    for (let i = 0; i < beforePos.count; i++) beforeMax = Math.max(beforeMax, Math.abs(beforePos.getX(i)))
    expect(beforeMax).toBeCloseTo(0.2)

    // A second sheet merges a diamond reaching the quad edges into the
    // SAME texture. `complete` stays true on both sides, so the boolean
    // `wantsTight` strategy never flips — only the CONTENT changed.
    registerAtlasMesh(texture, {
      frames: [
        makeMeshedFrame('b', [
          [0, -0.5],
          [0.5, 0],
          [0, 0.5],
          [-0.5, 0],
        ]),
      ],
      complete: true,
    })
    group.update()

    expect(material._tightMesh).toBe(true) // strategy never flipped...
    const after = data.batchSlots.find((m) => m !== null && !m.isEmpty)!
    const afterPos = after.geometry.getAttribute('position')
    let afterMax = 0
    for (let i = 0; i < afterPos.count; i++) afterMax = Math.max(afterMax, Math.abs(afterPos.getX(i)))
    expect(afterMax).toBeCloseTo(0.5) // ...but the batch's envelope grew to match
  })

  it('a complete-to-incomplete degrade on an already-tight material adds the quad corners', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture) // complete: true
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(true)

    group.add(new Sprite2D({ texture, material }))
    group.add(new Sprite2D({ texture, material }))
    group.update()
    const data = registryData()
    const before = data.batchSlots.find((m) => m !== null && !m.isEmpty)!
    expect(before.geometry.getAttribute('position').count).toBe(4) // diamond hull only

    // A meshless sheet loads over the same texture afterward — degrades
    // `complete` to false. `wantsTight` still evaluates true (the atlas
    // registration is still present), so the strategy boolean never
    // flips even though the envelope must now include the full quad.
    degradeAtlasMesh(texture)
    group.update()

    expect(material._tightMesh).toBe(true) // strategy stayed tight-mesh
    const after = data.batchSlots.find((m) => m !== null && !m.isEmpty)!
    const afterPos = after.geometry.getAttribute('position')
    // The diamond's own vertices already sit at |x| or |y| = 0.5 (but
    // never both at once) — a true (0.5, 0.5) quad corner only appears
    // once the degrade pushes the full quad into the hull.
    let hasCorner = false
    for (let i = 0; i < afterPos.count; i++) {
      if (Math.abs(afterPos.getX(i)) === 0.5 && Math.abs(afterPos.getY(i)) === 0.5) {
        hasCorner = true
      }
    }
    expect(hasCorner).toBe(true) // quad corners joined the hull
  })
})
