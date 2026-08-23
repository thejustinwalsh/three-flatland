import { ENTITY_INDEX_STRIDE } from '../ecs/runtime/entity'
import { fail } from '../ecs/runtime/error'
import type { World } from '../ecs/runtime/world'

/** Install constructor-time reservation and geometric overflow growth on a fresh private world. */
export function reserveWorld(world: World, expectedEntities: number): void {
  if (!Number.isSafeInteger(expectedEntities) || expectedEntities < 0 || expectedEntities > ENTITY_INDEX_STRIDE) {
    fail('Invalid expectedEntities', RangeError)
  }
  world.reserve(expectedEntities)
}
