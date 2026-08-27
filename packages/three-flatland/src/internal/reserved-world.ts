import type { World } from '../ecs/runtime/world'

/** Install constructor-time reservation and geometric overflow growth on a fresh private world. */
export function reserveWorld(world: World, expectedEntities: number): void {
  world.reserve(expectedEntities)
}
