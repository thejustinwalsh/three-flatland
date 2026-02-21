import { createChanged } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  SpriteColor,
  SpriteUV,
  SpriteFlip,
  IsBatched,
  ThreeRef,
  BatchSlot,
  BatchRegistry,
} from '../traits'
import type { MaterialEffect } from '../../materials/MaterialEffect'
import type { Sprite2D } from '../../sprites/Sprite2D'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import type { RegistryData } from '../batchUtils'

const Changed = createChanged()

/**
 * Resolve the batch mesh and slot for a batched entity using BatchSlot SoA cache.
 * O(1) per entity — no relation resolution needed.
 */
function resolveBatchSlot(
  entity: Entity,
  batchSlots: (SpriteBatch | null)[]
): { mesh: SpriteBatch; slot: number } | null {
  const bs = entity.get(BatchSlot)
  if (!bs || bs.batchIdx < 0) return null
  const mesh = batchSlots[bs.batchIdx]
  if (!mesh) return null
  return { mesh, slot: bs.slot }
}

/**
 * Get the registry's batchSlots array. Returns null if not available.
 */
function getBatchSlots(world: World): (SpriteBatch | null)[] | null {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return null
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return null
  return registry.batchSlots
}

/**
 * Sync changed sprite color data to batch GPU buffers.
 */
export function bufferSyncColorSystem(world: World): void {
  const entities = world.query(Changed(SpriteColor), IsBatched, BatchSlot)
  if (entities.length === 0) return

  const batchSlots = getBatchSlots(world)
  if (!batchSlots) return

  const dirtyMeshes = new Set<SpriteBatch>()

  for (const entity of entities) {
    const color = entity.get(SpriteColor)
    if (!color) continue
    const resolved = resolveBatchSlot(entity, batchSlots)
    if (!resolved) continue

    resolved.mesh.writeColor(resolved.slot, color.r, color.g, color.b, color.a)
    dirtyMeshes.add(resolved.mesh)
  }

  for (const mesh of dirtyMeshes) {
    mesh.getColorAttribute().needsUpdate = true
  }
}

/**
 * Sync changed sprite UV data to batch GPU buffers.
 */
export function bufferSyncUVSystem(world: World): void {
  const entities = world.query(Changed(SpriteUV), IsBatched, BatchSlot)
  if (entities.length === 0) return

  const batchSlots = getBatchSlots(world)
  if (!batchSlots) return

  const dirtyMeshes = new Set<SpriteBatch>()

  for (const entity of entities) {
    const uv = entity.get(SpriteUV)
    if (!uv) continue
    const resolved = resolveBatchSlot(entity, batchSlots)
    if (!resolved) continue

    resolved.mesh.writeUV(resolved.slot, uv.x, uv.y, uv.w, uv.h)
    dirtyMeshes.add(resolved.mesh)
  }

  for (const mesh of dirtyMeshes) {
    mesh.getUVAttribute().needsUpdate = true
  }
}

/**
 * Sync changed sprite flip data to batch GPU buffers.
 */
export function bufferSyncFlipSystem(world: World): void {
  const entities = world.query(Changed(SpriteFlip), IsBatched, BatchSlot)
  if (entities.length === 0) return

  const batchSlots = getBatchSlots(world)
  if (!batchSlots) return

  const dirtyMeshes = new Set<SpriteBatch>()

  for (const entity of entities) {
    const flip = entity.get(SpriteFlip)
    if (!flip) continue
    const resolved = resolveBatchSlot(entity, batchSlots)
    if (!resolved) continue

    resolved.mesh.writeFlip(resolved.slot, flip.x, flip.y)
    dirtyMeshes.add(resolved.mesh)
  }

  for (const mesh of dirtyMeshes) {
    mesh.getFlipAttribute().needsUpdate = true
  }
}

/**
 * Sync changed effect data to batch GPU buffers.
 *
 * Each entity is processed at most once per frame, even if multiple
 * effect traits changed.
 */
export function bufferSyncEffectSystem(
  world: World,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  const batchSlots = getBatchSlots(world)
  if (!batchSlots) return

  const processed = new Set<Entity>()

  for (const [effectTrait] of effectTraits) {
    const entities = world.query(Changed(effectTrait), IsBatched, ThreeRef, BatchSlot)
    for (const entity of entities) {
      if (processed.has(entity)) continue
      processed.add(entity)

      const ref = entity.get(ThreeRef)
      if (!ref?.object) continue
      const sprite = ref.object as Sprite2D

      const resolved = resolveBatchSlot(entity, batchSlots)
      if (!resolved) continue

      writePackedEffects(resolved.slot, resolved.mesh, sprite)
    }
  }
}

function writePackedEffects(slot: number, mesh: SpriteBatch, sprite: Sprite2D): void {
  const material = sprite.material
  const tier = material._effectTier
  if (tier === 0) return

  // Write flags
  mesh.writeEffectSlot(slot, 0, 0, sprite._effectFlags)

  // Write active effect fields
  for (const effect of sprite._effects) {
    const EffectClass = effect.constructor as typeof MaterialEffect
    for (const field of EffectClass._fields) {
      const slotKey = `${EffectClass.effectName}_${field.name}`
      const slotInfo = material._effectSlots.get(slotKey)
      if (!slotInfo) continue

      const value = effect._getField(field.name)
      if (typeof value === 'number') {
        const bufIdx = Math.floor(slotInfo.offset / 4)
        const comp = slotInfo.offset % 4
        mesh.writeEffectSlot(slot, bufIdx, comp, value)
      } else {
        for (let i = 0; i < value.length; i++) {
          const off = slotInfo.offset + i
          mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, value[i]!)
        }
      }
    }
  }

  // Zero out inactive effects
  for (const effectClass of material._effects) {
    const isActive = sprite._effects.some(
      (e) => (e.constructor as typeof MaterialEffect).effectName === effectClass.effectName
    )
    if (!isActive) {
      for (const field of effectClass._fields) {
        const slotKey = `${effectClass.effectName}_${field.name}`
        const slotInfo = material._effectSlots.get(slotKey)
        if (!slotInfo) continue
        for (let i = 0; i < field.size; i++) {
          const off = slotInfo.offset + i
          mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, field.default[i]!)
        }
      }
    }
  }

  // Mark dirty
  const numVec4s = tier / 4
  for (let i = 0; i < numVec4s; i++) {
    const attr = mesh.getCustomAttribute(`effectBuf${i}`)
    if (attr) attr.needsUpdate = true
  }
}
