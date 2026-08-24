import type { World } from '../ecs/runtime'

type RuntimeInitializer = (() => World) & { world?: World }

const runtimes = new WeakMap<object, RuntimeInitializer>()

export function registerSpriteGroupRuntime(group: object, initialize: () => World): void {
  runtimes.set(group, initialize)
}

export function getSpriteGroupWorld(group: object): World {
  const initialize = runtimes.get(group)
  if (!initialize) throw new Error('three-flatland: SpriteGroup runtime cannot be used after dispose()')
  const world = initialize.world ?? initialize()
  initialize.world = world
  return world
}

export function clearSpriteGroupWorld(group: object): void {
  runtimes.delete(group)
}
