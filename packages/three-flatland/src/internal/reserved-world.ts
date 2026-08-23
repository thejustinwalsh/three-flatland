import { ENTITY_INDEX_STRIDE } from '../ecs/runtime/entity'
import { reserveWorldState, WORLD_CAPACITY_ACCESS, type World } from '../ecs/runtime/world'
import { nextCapacity } from './capacity'

/** Install constructor-time reservation and geometric overflow growth on a fresh private world. */
export function reserveWorld(world: World, expectedEntities: number): void {
  if (!Number.isSafeInteger(expectedEntities) || expectedEntities < 0 || expectedEntities > ENTITY_INDEX_STRIDE) {
    throw new RangeError('three-flatland: expectedEntities is outside the 20-bit world capacity')
  }
  if (expectedEntities === 0) return

  let capacity = expectedEntities
  const access = world[WORLD_CAPACITY_ACCESS]
  reserveWorldState(access, capacity)
  const spawn = world.spawn.bind(undefined)
  world.spawn = (...inputs) => {
    const entity = spawn(...inputs)
    const required = world.capacity
    if (required > capacity) {
      capacity = nextCapacity(capacity, required, ENTITY_INDEX_STRIDE)
      reserveWorldState(access, capacity)
    }
    return entity
  }
}
