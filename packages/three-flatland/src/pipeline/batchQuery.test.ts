import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteGroup } from './SpriteGroup'
import {
  IsAlphaBlendedBatch,
  IsAlphaTestedBatch,
  IsLitBatch,
  IsUnlitBatch,
} from './batchQuery'
import { BatchGeometryStrategy } from '../ecs/traits'
import type { RegistryData } from '../ecs/batchUtils'
import { vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 8, height: 8 }
  return texture
}

describe('batch classification traits + query facade', () => {
  let texture: Texture
  let group: SpriteGroup

  beforeEach(() => {
    texture = makeTexture()
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
    universe.reset()
  })

  it('alpha-blend vs alpha-test classification follows the material', () => {
    const blend = new Sprite2DMaterial({ map: texture, transparent: true })
    const tested = new Sprite2DMaterial({ map: texture, alphaTest: 0.5 })

    group.add(new Sprite2D({ texture, material: blend }))
    group.add(new Sprite2D({ texture, material: tested }))
    group.update()

    const blended = group.batches.where(IsAlphaBlendedBatch)
    const alphaTested = group.batches.where(IsAlphaTestedBatch)

    expect(blended.length).toBe(1)
    expect(alphaTested.length).toBe(1)
    expect(blended[0]!.spriteMaterial).toBe(blend)
    expect(alphaTested[0]!.spriteMaterial).toBe(tested)
  })

  it('lit vs unlit classification follows the colorTransform', () => {
    const unlit = new Sprite2DMaterial({ map: texture })
    const lit = new Sprite2DMaterial({
      map: texture,
      colorTransform: ({ color }) => vec4(color.rgb, color.a) as Node<'vec4'>,
    })

    group.add(new Sprite2D({ texture, material: unlit }))
    group.add(new Sprite2D({ texture, material: lit }))
    group.update()

    const litBatches = group.batches.where(IsLitBatch)
    const unlitBatches = group.batches.where(IsUnlitBatch)

    expect(litBatches.length).toBe(1)
    expect(unlitBatches.length).toBe(1)
    expect(litBatches[0]!.spriteMaterial).toBe(lit)
  })

  it('every batch carries BatchGeometryStrategy { kind: synth-quad }', () => {
    group.add(new Sprite2D({ texture }))
    group.update()

    const data = (
      group as unknown as { _getRegistry(): RegistryData | null }
    )._getRegistry()!
    for (const batchEntity of data.activeBatches) {
      expect(batchEntity.get(BatchGeometryStrategy)!.kind).toBe('synth-quad')
    }
    expect(data.activeBatches.length).toBeGreaterThan(0)
  })

  it('batches view is keyed by run key and lists batch meshes', () => {
    group.add(new Sprite2D({ texture }))
    group.add(new Sprite2D({ texture }))
    group.update()

    const view = group.batches
    expect(view.size).toBe(1)
    const meshes = [...view.values()][0]!
    expect(meshes.length).toBe(1)
    expect(meshes[0]!.activeCount).toBe(2)
  })

  it('existing system behavior is unchanged (no behavior shift from tagging)', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    group.add(a)
    group.add(b)
    group.update()

    expect(a._batchMesh).not.toBeNull()
    expect(a._batchMesh).toBe(b._batchMesh)
  })
})
