import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../materials/MaterialEffect'
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
    // Synth-quad geometry now carries real position/uv attributes for
    // user TSL (`uv()` contract) — attribute absence no longer
    // discriminates the strategy. The 6-index unit quad does: an
    // envelope hull is fan-triangulated from its own hull point count.
    expect(mesh.geometryKind).toBe('synth-quad')
    expect(mesh.geometry.getIndex()!.count).toBe(6)
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
    // See above — geometryKind + the 6-index quad discriminate the
    // strategy now that synth-quad geometry ships real attributes.
    expect(mesh.geometryKind).toBe('synth-quad')
    expect(mesh.geometry.getIndex()!.count).toBe(6)
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
    expect(data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind).toBe('tight-mesh')
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
    for (let i = 0; i < beforePos.count; i++)
      beforeMax = Math.max(beforeMax, Math.abs(beforePos.getX(i)))
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
    for (let i = 0; i < afterPos.count; i++)
      afterMax = Math.max(afterMax, Math.abs(afterPos.getX(i)))
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

  it('a degrade-only zero-frame atlas entry does not force the tight-mesh strategy', () => {
    const texture = makeTexture()
    // A meshless sheet loads first with no prior registration for this
    // texture — degradeAtlasMesh now records an incomplete marker
    // internally instead of staying a no-op, but getAtlasMesh's public
    // read filters a zero-frame entry back to null (nothing for
    // buildEnvelopeGeometry to hull yet). Sprite2DMaterial's own
    // `atlas.frames.length > 0` check is a second, defense-in-depth
    // guard against the same case: if it ever fired without the
    // registry-level filter, forcing tight-mesh here would make
    // findOrCreateBatch's wanted strategy and the batch's actual
    // synth-quad fallback geometry disagree — every update would
    // dispose and rebuild the batch.
    degradeAtlasMesh(texture)
    const material = new Sprite2DMaterial({ map: texture, transparent: true })

    expect(material._tightMesh).toBe(false)
    expect(material.maxEffectFloats).toBe(24)

    group.add(new Sprite2D({ texture, material }))
    group.update()
    const data = registryData()
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.geometryKind).toBe('synth-quad')
    expect(data.activeBatches[0]!.get(BatchGeometryStrategy)!.kind).toBe('synth-quad')
  })
})

describe('late effect registration past the tight-mesh effect-float cap', () => {
  afterEach(() => {
    universe.reset()
  })

  it('demotes an already-tight material to synth-quad instead of throwing when growth crosses 16', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(true)
    expect(material.maxEffectFloats).toBe(16)

    const Big1 = createMaterialEffect({
      name: 'lateBig1',
      schema: { a: [0, 0, 0, 0], b: [0, 0, 0, 0], c: [0, 0, 0, 0] }, // 12 floats
      node: ({ inputColor }) => inputColor,
    })
    const Big2 = createMaterialEffect({
      name: 'lateBig2',
      schema: { d: [0, 0, 0, 0], e: [0, 0, 0, 0] }, // 8 floats — total 20, crosses 16
      node: ({ inputColor }) => inputColor,
    })

    expect(() => material.registerEffect(Big1)).not.toThrow()
    expect(material._tightMesh).toBe(true) // 12 floats still fits under the 16 cap

    expect(() => material.registerEffect(Big2)).not.toThrow() // would have thrown pre-fix
    expect(material._tightMesh).toBe(false) // demoted to synth-quad
    expect(material.maxEffectFloats).toBe(24)
    expect(material._effectTotalFloats).toBe(20)
  })

  it('still throws when total effect floats exceed the hard 24-float cap after demotion', () => {
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(true)

    const Big1 = createMaterialEffect({
      name: 'hardCap1',
      schema: { a: [0, 0, 0, 0], b: [0, 0, 0, 0], c: [0, 0, 0, 0] }, // 12
      node: ({ inputColor }) => inputColor,
    })
    const Big2 = createMaterialEffect({
      name: 'hardCap2',
      schema: { d: [0, 0, 0, 0], e: [0, 0, 0, 0], f: [0, 0, 0, 0] }, // 12 — total 24
      node: ({ inputColor }) => inputColor,
    })
    const Big3 = createMaterialEffect({
      name: 'hardCap3',
      schema: { g: 0 }, // 1 more — total 25, over the hard cap
      node: ({ inputColor }) => inputColor,
    })

    material.registerEffect(Big1)
    material.registerEffect(Big2)
    expect(material._tightMesh).toBe(false) // already demoted at 24
    expect(material._effectTotalFloats).toBe(24)

    expect(() => material.registerEffect(Big3)).toThrow(/exceeding the cap/)
  })

  it('leaves material state untouched when an over-cap registration is rejected', () => {
    // The cap check runs BEFORE any mutation, so a rejected effect must
    // not pollute _effects / hasEffect / _effectTotalFloats, and must not
    // leave a half-applied geometry-strategy demotion behind.
    const texture = makeTexture()
    registerDiamondAtlas(texture)
    const material = new Sprite2DMaterial({ map: texture, transparent: true })
    expect(material._tightMesh).toBe(true)

    // A single effect whose floats overshoot the 24-float hard cap in one
    // shot — from a fresh tight-mesh material (16-float cap on paper).
    const Overflow = createMaterialEffect({
      name: 'overflow28',
      schema: {
        a: [0, 0, 0, 0],
        b: [0, 0, 0, 0],
        c: [0, 0, 0, 0],
        d: [0, 0, 0, 0],
        e: [0, 0, 0, 0],
        f: [0, 0, 0, 0],
        g: [0, 0, 0, 0], // 28 floats — over the hard 24 cap
      },
      node: ({ inputColor }) => inputColor,
    })

    expect(() => material.registerEffect(Overflow)).toThrow(/exceeding the cap/)
    // Transactional: nothing committed, no demotion leaked.
    expect(material.hasEffect(Overflow)).toBe(false)
    expect(material.getEffects()).toHaveLength(0)
    expect(material._effectTotalFloats).toBe(0)
    expect(material._tightMesh).toBe(true) // still tight — never demoted on the failed path
    expect(material.maxEffectFloats).toBe(16)
  })
})
