import type { World } from '../ecs/runtime'

type RuntimeInitializer = (() => World) & {
  world?: World
  beforeDispose?: () => void
}

const runtimes = new WeakMap<object, RuntimeInitializer>()

export function registerSpriteGroupRuntime(group: object, initialize: () => World): void {
  runtimes.set(group, initialize)
}

/** Register the owning Flatland's pre-mutation disposal invariant. */
export function registerSpriteGroupDisposeGuard(group: object, beforeDispose: () => void): void {
  const initialize = runtimes.get(group)
  if (!initialize) throw new Error('three-flatland: cannot guard a disposed SpriteGroup runtime')
  initialize.beforeDispose = beforeDispose
}

/** Validate ownership before SpriteGroup publishes terminal state. */
export function assertSpriteGroupCanDispose(group: object): void {
  runtimes.get(group)?.beforeDispose?.()
}

export function getSpriteGroupWorld(group: object): World {
  const initialize = runtimes.get(group)
  if (!initialize) throw new Error('three-flatland: SpriteGroup runtime cannot be used after dispose()')
  const world = initialize.world ?? initialize()
  initialize.world = world
  return world
}

export function clearSpriteGroupWorld(group: object): void {
  const initialize = runtimes.get(group)
  if (initialize) initialize.beforeDispose = undefined
  runtimes.delete(group)
}
