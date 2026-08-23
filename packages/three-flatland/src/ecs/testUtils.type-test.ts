import type { Sprite2D } from '../sprites/Sprite2D'
import { select, type Entity, type Trait, type World } from './runtime'
import { BatchMesh, BatchRegistry, BatchSlot, IsBatched } from './traits'
import type { RegistryData } from './batchUtils'
import type { SpriteBatch } from '../pipeline/SpriteBatch'

export function requiredEntity(sprite: Sprite2D): Entity {
  const entity = sprite.entity
  if (entity === null) throw new Error('Expected sprite to be enrolled')
  return entity
}

export function readRequired<TValue>(world: World, entity: Entity, trait: Trait<TValue>): TValue {
  const value = world.read(entity, trait)
  if (value === undefined) throw new Error(`Expected entity ${entity} to have trait ${trait.id}`)
  return value
}

export function registryFor(world: World): RegistryData {
  const entity = world.view(select(BatchRegistry))[0]
  if (entity === undefined) throw new Error('Expected world to have a BatchRegistry')
  return readRequired(world, entity, BatchRegistry)
}

export function batchEntityFor(world: World, sprite: Sprite2D): Entity {
  const entity = requiredEntity(sprite)
  if (!world.has(entity, IsBatched)) throw new Error(`Expected entity ${entity} to be batched`)
  const batchEntity = readRequired(world, entity, BatchSlot).batchEntity as Entity
  if (!world.isAlive(batchEntity)) throw new Error(`Expected batch entity ${batchEntity} to be alive`)
  return batchEntity
}

export function batchFor(world: World, sprite: Sprite2D): SpriteBatch {
  const mesh = readRequired(world, batchEntityFor(world, sprite), BatchMesh).mesh
  if (mesh === null) throw new Error('Expected batch entity to own a SpriteBatch')
  return mesh
}
