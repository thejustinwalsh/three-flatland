import { describe, it, expect } from 'vitest'
import { Texture } from 'three'
import { registerAtlasMesh, getAtlasMesh } from './atlasMeshRegistry'
import { buildEnvelopeGeometry } from '../pipeline/envelopeGeometry'
import type { SpriteFrame, SpriteFrameMesh } from '../sprites/types'

function makeFrame(name: string, points: [number, number][]): SpriteFrame {
  const verts = new Float32Array(points.length * 4)
  points.forEach(([x, y], i) => {
    verts[i * 4 + 0] = x
    verts[i * 4 + 1] = y
    verts[i * 4 + 2] = x + 0.5
    verts[i * 4 + 3] = y + 0.5
  })
  const mesh: SpriteFrameMesh = {
    verts,
    indices: Uint16Array.from(points.map((_, i) => i)),
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

describe('registerAtlasMesh merge semantics', () => {
  it('merges frames from two sheets sharing one texture into their union', () => {
    const texture = new Texture()
    const frameA = makeFrame('a', [
      [-0.5, -0.5],
      [-0.5, 0.1],
      [-0.1, -0.5],
    ])
    const frameB = makeFrame('b', [
      [0.5, 0.5],
      [0.5, -0.1],
      [0.1, 0.5],
    ])

    registerAtlasMesh(texture, { frames: [frameA], complete: true })
    registerAtlasMesh(texture, { frames: [frameB], complete: true })

    expect(getAtlasMesh(texture)!.frames).toEqual([frameA, frameB])
  })

  it('stays complete only when both registrations are complete', () => {
    const bothComplete = new Texture()
    registerAtlasMesh(bothComplete, { frames: [makeFrame('a', [[0, 0], [1, 0], [0, 1]])], complete: true })
    registerAtlasMesh(bothComplete, { frames: [makeFrame('b', [[0, 0], [1, 0], [0, 1]])], complete: true })
    expect(getAtlasMesh(bothComplete)!.complete).toBe(true)

    const oneIncomplete = new Texture()
    registerAtlasMesh(oneIncomplete, { frames: [makeFrame('a', [[0, 0], [1, 0], [0, 1]])], complete: true })
    registerAtlasMesh(oneIncomplete, { frames: [makeFrame('b', [[0, 0], [1, 0], [0, 1]])], complete: false })
    expect(getAtlasMesh(oneIncomplete)!.complete).toBe(false)

    const bothIncomplete = new Texture()
    registerAtlasMesh(bothIncomplete, { frames: [makeFrame('a', [[0, 0], [1, 0], [0, 1]])], complete: false })
    registerAtlasMesh(bothIncomplete, { frames: [makeFrame('b', [[0, 0], [1, 0], [0, 1]])], complete: false })
    expect(getAtlasMesh(bothIncomplete)!.complete).toBe(false)
  })
})

describe('buildEnvelopeGeometry over a merged multi-sheet registration', () => {
  it('includes hull points contributed by both sheets frames', () => {
    const texture = new Texture()
    // Frame A hugs the bottom-left corner, frame B hugs the top-right —
    // neither frame alone reaches both extremes, so a correct hull
    // needs points from both. This is the regression the registry's old
    // dangling meshVerts/meshIndices arrays could have caused: only the
    // last-registered sheet's arrays survived a merge. It already
    // passes today because buildEnvelopeGeometry reads per-frame
    // frame.mesh.verts and never touches the registry-level arrays —
    // the interface removal makes that the only path, structurally.
    const frameA = makeFrame('a', [
      [-0.5, -0.5],
      [-0.5, 0.1],
      [-0.1, -0.5],
    ])
    const frameB = makeFrame('b', [
      [0.5, 0.5],
      [0.5, -0.1],
      [0.1, 0.5],
    ])

    registerAtlasMesh(texture, { frames: [frameA], complete: true })
    registerAtlasMesh(texture, { frames: [frameB], complete: true })

    const geometry = buildEnvelopeGeometry(texture)!
    const position = geometry.getAttribute('position')
    const xs: number[] = []
    for (let i = 0; i < position.count; i++) xs.push(position.getX(i))

    expect(xs.some((x) => x < -0.4)).toBe(true) // frame A's extreme survives
    expect(xs.some((x) => x > 0.4)).toBe(true) // frame B's extreme survives
  })
})
