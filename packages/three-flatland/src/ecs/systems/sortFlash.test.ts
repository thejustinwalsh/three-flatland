import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { BatchSlot, BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'

/**
 * Reproducer for the batch-demo sort flash:
 *   "If I put a sprite in the lower right corner, then click a sprite out at a
 *    higher position the last sprite in that row flashes."
 *
 * The user-visible bug is a one-frame stale rendering somewhere in the batch
 * after a new sprite is added that sorts EARLIER than the existing sprites
 * (higher world Y → lower zIndex via `-Math.floor(y)`).
 *
 * These tests assert the buffer state is internally consistent — every slot's
 * matrix translation, color, UV, and flip data match the sprite that the sort
 * said should live at that slot. A discrepancy after one frame is the flash.
 */

function makeTexture(): Texture {
  const t = new Texture()
  t.image = { width: 100, height: 100 }
  return t
}

function getRegistry(group: SpriteGroup): RegistryData | null {
  const world = group.world
  const entities = world.query(BatchRegistry)
  return entities.length === 0 ? null : (entities[0]!.get(BatchRegistry) as RegistryData)
}

function getBatchForSprite(group: SpriteGroup, sprite: Sprite2D): SpriteBatch | null {
  const registry = getRegistry(group)
  if (!registry) return null
  const bs = sprite.entity!.get(BatchSlot)!
  return registry.batchSlots[bs.batchIdx] as SpriteBatch | null
}

/**
 * Read the per-slot translation (px, py, pz) the GPU will see this frame.
 * Mirrors the transformSyncSystem write layout — col 3 of the 4x4 matrix.
 */
function readMatrixTranslation(batch: SpriteBatch, slot: number): { x: number; y: number; z: number } {
  const m = batch.instanceMatrix.array as Float32Array
  return { x: m[slot * 16 + 12]!, y: m[slot * 16 + 13]!, z: m[slot * 16 + 14]! }
}

/**
 * Place a sprite at a world position with Y-sort zIndex.
 * Mirrors how the batch-demo's placeBuilding wires up a new building.
 */
function placeSprite(
  group: SpriteGroup,
  material: Sprite2DMaterial,
  worldX: number,
  worldY: number,
  tint: number
): Sprite2D {
  const sprite = new Sprite2D({ material })
  sprite.scale.set(32, 32, 1)
  sprite.position.set(worldX, worldY, 0)
  sprite.zIndex = -Math.floor(worldY)
  sprite.tint = tint
  group.add(sprite)
  return sprite
}

describe('sort flash — batch-demo repro', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let group: SpriteGroup

  beforeEach(() => {
    texture = makeTexture()
    material = new Sprite2DMaterial({ map: texture })
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
    universe.reset()
  })

  it('after adding a higher-Y sprite, every slot matches its owning sprite', () => {
    // Place three sprites along the bottom row (lower Y → higher positive zIndex).
    const bottomA = placeSprite(group, material, -64, -100, 0xff0000)
    const bottomB = placeSprite(group, material, 0, -100, 0x00ff00)
    const bottomC = placeSprite(group, material, 64, -100, 0x0000ff)
    group.update()

    // Now add a new sprite a row UP (higher Y → lower / more-negative zIndex).
    // In demo terms: "click out at a higher position."
    const top = placeSprite(group, material, 0, -50, 0xffff00)
    group.update()

    // After sort: top has the lowest zIndex → should sit at the lowest slot.
    // The three bottom-row sprites all share zIndex 100; their relative order
    // is allocator-defined, but each one's slot must hold ITS data.
    const all = [top, bottomA, bottomB, bottomC]
    const batch = getBatchForSprite(group, top)!

    for (const sprite of all) {
      const slot = sprite.entity!.get(BatchSlot)!.slot
      const m = readMatrixTranslation(batch, slot)
      expect(m.x, `slot ${slot} matrix.x mismatch for sprite at world ${sprite.position.x}`).toBe(sprite.position.x)
      expect(m.y, `slot ${slot} matrix.y mismatch for sprite at world ${sprite.position.y}`).toBe(sprite.position.y)
    }
  })

  it('color/UV/system rows at each slot follow their sprite through the sort', () => {
    // Same scenario, but verify the interleaved buffer rows are consistent.
    const tints = [0x112233, 0x445566, 0x778899, 0xaabbcc]
    const bottomA = placeSprite(group, material, -64, -100, tints[0]!)
    const bottomB = placeSprite(group, material, 0, -100, tints[1]!)
    const bottomC = placeSprite(group, material, 64, -100, tints[2]!)
    group.update()

    const top = placeSprite(group, material, 0, -50, tints[3]!)
    group.update()

    const batch = getBatchForSprite(group, top)!
    const colorAttr = batch.getColorAttribute().array as Float32Array

    const all = [top, bottomA, bottomB, bottomC]
    for (const sprite of all) {
      const slot = sprite.entity!.get(BatchSlot)!.slot
      const o = slot * 16 + 4 // OFFSET_COLOR = 4 (in floats relative to slot row start)
      expect(colorAttr[o + 0], `slot ${slot} red mismatch`).toBeCloseTo(sprite.tint.r, 4)
      expect(colorAttr[o + 1], `slot ${slot} green mismatch`).toBeCloseTo(sprite.tint.g, 4)
      expect(colorAttr[o + 2], `slot ${slot} blue mismatch`).toBeCloseTo(sprite.tint.b, 4)
    }
  })

  it('placing sprites one-by-one keeps each slot consistent on every frame', () => {
    // Walks the demo flow: place one, render; place another, render; ...
    // After every placement, every slot in the batch must match its sprite.
    const sprites: Sprite2D[] = []

    const placements: Array<{ x: number; y: number; tint: number }> = [
      { x: 96, y: -100, tint: 0x112233 }, // bottom-right
      { x: 64, y: -100, tint: 0x223344 }, // bottom row
      { x: 32, y: -100, tint: 0x334455 }, // bottom row
      { x: 0, y: -50, tint: 0x445566 }, // one row up
      { x: -32, y: -50, tint: 0x556677 }, // one row up
      { x: 0, y: 0, tint: 0x667788 }, // middle row
    ]

    for (const { x, y, tint } of placements) {
      sprites.push(placeSprite(group, material, x, y, tint))
      group.update()

      const batch = getBatchForSprite(group, sprites[0]!)!
      for (const sprite of sprites) {
        const slot = sprite.entity!.get(BatchSlot)!.slot
        const m = readMatrixTranslation(batch, slot)
        expect(
          m.x,
          `after placing ${sprites.length}, slot ${slot} x mismatch — got ${m.x}, expected ${sprite.position.x}`
        ).toBe(sprite.position.x)
        expect(
          m.y,
          `after placing ${sprites.length}, slot ${slot} y mismatch — got ${m.y}, expected ${sprite.position.y}`
        ).toBe(sprite.position.y)
      }
    }
  })
})
