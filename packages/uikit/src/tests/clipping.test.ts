import { expect } from 'chai'
import { beforeAll } from 'vitest'
import { loadYoga } from 'yoga-layout/load'
import { Matrix4, Mesh, MeshBasicMaterial, Object3D, Plane, Vector3 } from 'three'
import { Container, Content, Custom, CustomContentMesh, Image } from '../index.js'
import { NoClippingPlane } from '../clipping.js'
import { packClippingPlanes } from '../panel/material/shader.js'

/**
 * GPU clipping on the common (WebGPU) renderer — the renderer reads clipping
 * state ONLY from clipping groups (`isGroup` + `isClippingGroup` + `enabled` +
 * `clippingPlanes` + `clipShadows`); `material.clippingPlanes` is inert. These
 * tests cover the two mechanisms that replace it:
 * - `Image`: uniform clip path fed by live world-space planes
 * - `Content`/`Custom`: the clipping-group contract on the component itself
 */

beforeAll(async () => {
  // resolves after flex/yoga.ts's own load callback (same underlying promise),
  // so `createYogaNode` is ready once this returns
  await loadYoga()
})

function createRoot() {
  const root = new Container({ width: 200, height: 200 })
  const scene = new Object3D()
  scene.add(root)
  return { root, scene }
}

function expectPlanesEqual(actual: ReadonlyArray<Plane>, expected: ReadonlyArray<Plane>) {
  expect(actual).to.have.length(expected.length)
  for (let i = 0; i < expected.length; i++) {
    // read each live plane's fields immediately (they compute into a shared helper)
    const constant = actual[i]!.constant
    const normal = { x: actual[i]!.normal.x, y: actual[i]!.normal.y, z: actual[i]!.normal.z }
    expect(constant, `plane ${i} constant`).to.be.closeTo(expected[i]!.constant, 1e-6)
    expect(normal.x, `plane ${i} normal.x`).to.be.closeTo(expected[i]!.normal.x, 1e-6)
    expect(normal.y, `plane ${i} normal.y`).to.be.closeTo(expected[i]!.normal.y, 1e-6)
    expect(normal.z, `plane ${i} normal.z`).to.be.closeTo(expected[i]!.normal.z, 1e-6)
  }
}

describe('Image clipping (uniform clip path)', () => {
  it('populates live clip planes from the parent clipping rect and tracks changes', () => {
    const { root } = createRoot()
    const parent = new Container({ width: 100, height: 50, overflow: 'hidden' })
    const image = new Image({ width: 400, height: 400 })
    parent.add(image)
    root.add(parent)
    root.update(16)

    const rect = parent.clippingRect.value
    expect(rect, 'parent clippingRect').to.not.equal(undefined)
    // root sits under an identity-transform Object3D, so world === root space
    expectPlanesEqual(image.clippingPlanes, rect!.planes)

    const constantsBefore = image.clippingPlanes.map((plane) => plane.constant)
    parent.setProperties({ width: 40, height: 20, overflow: 'hidden' })
    root.update(16)

    const newRect = parent.clippingRect.value
    expect(newRect).to.not.equal(undefined)
    // the SAME plane instances now evaluate to the new rect — no re-assignment
    expectPlanesEqual(image.clippingPlanes, newRect!.planes)
    const constantsAfter = image.clippingPlanes.map((plane) => plane.constant)
    expect(constantsAfter).to.not.deep.equal(constantsBefore)
  })

  it('falls back to NoClippingPlane (coverage 1) without a clipping ancestor', () => {
    const { root } = createRoot()
    const image = new Image({ width: 100, height: 100 })
    root.add(image)
    root.update(16)

    for (const plane of image.clippingPlanes) {
      expect(plane.constant).to.equal(NoClippingPlane.constant)
    }
    // any sane fragment position is "inside" all four planes → coverage 1
    const probe = new Vector3(123, -456, 789)
    for (const plane of image.clippingPlanes) {
      expect(plane.distanceToPoint(probe)).to.be.greaterThan(0)
    }
  })
})

describe('packClippingPlanes', () => {
  it('packs plane normals and constants into mat4 columns', () => {
    const planes = [
      new Plane(new Vector3(0, -1, 0), 1),
      new Plane(new Vector3(-1, 0, 0), 2),
      new Plane(new Vector3(0, 1, 0), 3),
      new Plane(new Vector3(1, 0, 0), 4),
    ]
    const target = packClippingPlanes(planes, new Matrix4())
    const e = target.elements
    expect(Array.from(e)).to.deep.equal([0, -1, 0, 1, -1, 0, 0, 2, 0, 1, 0, 3, 1, 0, 0, 4])
  })

  it('fills missing planes with NoClippingPlane', () => {
    const target = packClippingPlanes([], new Matrix4())
    for (let i = 0; i < 4; i++) {
      expect(target.elements[i * 4 + 3]).to.equal(NoClippingPlane.constant)
    }
  })
})

describe('Content clipping-group contract', () => {
  it('implements the fields the renderer reads, with the live Plane[] identity', () => {
    const { root } = createRoot()
    const parent = new Container({ width: 100, height: 50, overflow: 'hidden' })
    const content = new Content()
    const planesRef = content.clippingPlanes
    parent.add(content)
    root.add(parent)
    root.update(16)

    expect(content.isGroup).to.equal(true)
    expect(content.isClippingGroup).to.equal(true)
    expect(content.clipShadows).to.equal(true)
    expect(content.enabled, 'enabled while clipped').to.equal(true)
    // identity: the array (and its Plane instances) is never replaced
    expect(content.clippingPlanes).to.equal(planesRef)
    expectPlanesEqual(content.clippingPlanes, parent.clippingRect.value!.planes)
  })

  it('disables the group context when no ancestor clips', () => {
    const { root } = createRoot()
    const content = new Content()
    root.add(content)
    root.update(16)
    expect(content.enabled).to.equal(false)
  })

  it('composes nested clip containers (planes already min-ed through ancestors)', () => {
    const { root } = createRoot()
    const outer = new Container({ width: 100, height: 100, overflow: 'hidden' })
    const inner = new Container({ width: 50, height: 40, overflow: 'hidden' })
    const content = new Content()
    inner.add(content)
    outer.add(inner)
    root.add(outer)
    root.update(16)

    const innerRect = inner.clippingRect.value
    expect(innerRect, 'inner clippingRect').to.not.equal(undefined)
    expect(content.enabled).to.equal(true)
    // the inner rect is computed by intersecting with the outer rect
    // (ClippingRect.min), so the content's four planes encode both containers
    expectPlanesEqual(content.clippingPlanes, innerRect!.planes)
  })
})

describe('Custom clipping-group contract', () => {
  it('draws through a content mesh inside its own clipping context', () => {
    const { root, scene } = createRoot()
    const parent = new Container({ width: 100, height: 50, overflow: 'hidden' })
    const material = new MeshBasicMaterial()
    const custom = new Custom(undefined, undefined, { material })
    parent.add(custom)
    root.add(parent)
    root.update(16)

    expect(custom.isGroup).to.equal(true)
    expect(custom.isClippingGroup).to.equal(true)
    expect(custom.clipShadows).to.equal(true)
    expect(custom.enabled).to.equal(true)
    expectPlanesEqual(custom.clippingPlanes, parent.clippingRect.value!.planes)

    const contentMesh = custom.children.find((child) => child instanceof CustomContentMesh)
    expect(contentMesh).to.equal(custom.contentMesh)
    // the mesh draws the component's material — including later replacements
    expect(custom.contentMesh.material).to.equal(material)
    const replacement = new MeshBasicMaterial()
    custom.material = replacement
    expect(custom.contentMesh.material).to.equal(replacement)

    // the content mesh tracks the component's world transform exactly
    scene.updateMatrixWorld(true)
    expect(custom.contentMesh.matrixWorld.elements).to.deep.equal(custom.matrixWorld.elements)
  })

  it('disables the group context when no ancestor clips', () => {
    const { root } = createRoot()
    const custom = new Custom()
    root.add(custom)
    root.update(16)
    expect(custom.enabled).to.equal(false)
  })

  it('still rejects non-uikit children', () => {
    const custom = new Custom()
    expect(() => custom.add(new Mesh())).to.throw(/Only pmndrs\/uikit components/)
  })

  it('clones with a fresh content mesh', () => {
    const custom = new Custom()
    const cloned = custom.clone()
    expect(cloned.contentMesh).to.be.instanceOf(CustomContentMesh)
    expect(cloned.contentMesh).to.not.equal(custom.contentMesh)
    const copies = cloned.children.filter((child) => child instanceof CustomContentMesh)
    expect(copies).to.have.length(1)
  })
})
