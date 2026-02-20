import { createChanged, createAdded, createRemoved } from 'koota'
import type { World, Entity, Trait } from 'koota'
import type { Matrix4 } from 'three'
import {
  SpriteUV,
  SpriteColor,
  SpriteFlip,
  SpriteLayer,
  SpriteMaterialRef,
  IsRenderable,
  IsBatched,
  ThreeRef,
} from './traits'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Sprite2D } from '../sprites/Sprite2D'

// Create modifier instances (reused across frames)
const Changed = createChanged()
const Added = createAdded()
const Removed = createRemoved()

/**
 * Detect whether batches need rebuilding.
 *
 * Returns true if any renderable entity was added, removed,
 * or had its sort key (layer/zIndex/material) changed.
 *
 * This replaces the manual `_sortDirty` flag in BatchManager.
 */
export function batchPrepareSystem(world: World): boolean {
  const added = world.query(Added(IsRenderable))
  const removed = world.query(Removed(IsRenderable))
  const layerChanged = world.query(IsRenderable, Changed(SpriteLayer))
  const materialChanged = world.query(IsRenderable, Changed(SpriteMaterialRef))

  return added.length > 0 || removed.length > 0 || layerChanged.length > 0 || materialChanged.length > 0
}

/**
 * Sync changed sprite color data to batch GPU buffers.
 *
 * Only processes entities where SpriteColor has been marked as changed
 * AND are currently assigned to a batch.
 */
export function bufferSyncColorSystem(world: World): void {
  const entities = world.query(Changed(SpriteColor), IsBatched, ThreeRef)
  for (const entity of entities) {
    const color = entity.get(SpriteColor)
    const ref = entity.get(ThreeRef)
    if (!color || !ref?.object) continue
    const sprite = ref.object as Sprite2D
    if (!sprite._batchTarget || sprite._batchIndex < 0) continue
    sprite._batchTarget.writeColor(sprite._batchIndex, color.r, color.g, color.b, color.a)
    sprite._batchTarget.getColorAttribute().needsUpdate = true
  }
}

/**
 * Sync changed sprite UV data to batch GPU buffers.
 *
 * Only processes entities where SpriteUV has been marked as changed
 * AND are currently assigned to a batch.
 */
export function bufferSyncUVSystem(world: World): void {
  const entities = world.query(Changed(SpriteUV), IsBatched, ThreeRef)
  for (const entity of entities) {
    const uv = entity.get(SpriteUV)
    const ref = entity.get(ThreeRef)
    if (!uv || !ref?.object) continue
    const sprite = ref.object as Sprite2D
    if (!sprite._batchTarget || sprite._batchIndex < 0) continue
    sprite._batchTarget.writeUV(sprite._batchIndex, uv.x, uv.y, uv.w, uv.h)
    sprite._batchTarget.getUVAttribute().needsUpdate = true
  }
}

/**
 * Sync changed sprite flip data to batch GPU buffers.
 *
 * Only processes entities where SpriteFlip has been marked as changed
 * AND are currently assigned to a batch.
 */
export function bufferSyncFlipSystem(world: World): void {
  const entities = world.query(Changed(SpriteFlip), IsBatched, ThreeRef)
  for (const entity of entities) {
    const flip = entity.get(SpriteFlip)
    const ref = entity.get(ThreeRef)
    if (!flip || !ref?.object) continue
    const sprite = ref.object as Sprite2D
    if (!sprite._batchTarget || sprite._batchIndex < 0) continue
    sprite._batchTarget.writeFlip(sprite._batchIndex, flip.x, flip.y)
    sprite._batchTarget.getFlipAttribute().needsUpdate = true
  }
}

/**
 * Sync transforms from Three.js objects to GPU instance matrices.
 *
 * Reads the Three.js matrix from each renderable + batched entity's
 * ThreeRef and writes it to the instance matrix buffer.
 *
 * @param world - The ECS world to query
 * @param writeMatrix - Callback to write matrix data (entity id -> buffer write)
 */
export function transformSyncSystem(
  world: World,
  writeMatrix: (entity: number, matrix: Matrix4) => void
): void {
  const entities = world.query(IsRenderable, IsBatched, ThreeRef)
  for (const entity of entities) {
    const ref = entity.get(ThreeRef)
    if (ref?.object) {
      ref.object.updateMatrix()
      writeMatrix(entity, ref.object.matrix)
    }
  }
}

/**
 * Sync changed effect data to batch GPU buffers.
 *
 * Queries for entities where any registered effect trait has been changed.
 * When a change is detected, triggers a full packed effect data write
 * to the sprite's batch buffer via _writeEffectDataToBatch().
 *
 * Each entity is processed at most once per frame, even if multiple
 * effect traits changed.
 */
export function bufferSyncEffectSystem(
  world: World,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  const processed = new Set<Entity>()
  for (const [effectTrait] of effectTraits) {
    const entities = world.query(Changed(effectTrait), IsBatched, ThreeRef)
    for (const entity of entities) {
      if (processed.has(entity)) continue
      processed.add(entity)
      const ref = entity.get(ThreeRef)
      if (!ref?.object) continue
      const sprite = ref.object as Sprite2D
      if (!sprite._batchTarget || sprite._batchIndex < 0) continue
      sprite._writeEffectDataToBatch()
    }
  }
}
