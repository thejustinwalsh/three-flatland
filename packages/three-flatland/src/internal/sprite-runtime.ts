import type { Entity, World } from '../ecs/runtime'

const worlds = new WeakMap<object, World>()
const entities = new WeakMap<object, Entity>()

export function stageSpriteWorld(sprite: object, world: World): void {
  const current = worlds.get(sprite)
  if (current && current !== world) {
    throw new Error('three-flatland: Cannot switch worlds after creation. Destroy and recreate the object.')
  }
  worlds.set(sprite, world)
}

export function publishSpriteRuntime(sprite: object, world: World | null, entity: Entity | null): void {
  if (world) worlds.set(sprite, world)
  else worlds.delete(sprite)
  if (entity) entities.set(sprite, entity)
  else entities.delete(sprite)
}

export function spriteWorld(sprite: object): World | null {
  return worlds.get(sprite) ?? null
}

export function spriteEntity(sprite: object): Entity | null {
  return entities.get(sprite) ?? null
}
