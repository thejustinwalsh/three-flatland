import type { World } from '../ecs/runtime'
import type { Sprite2D } from '../sprites/Sprite2D'

type RuntimeInitializer = (() => World) & {
  world?: World
  beforeDispose?: () => void
  adopt?: (sprite: Sprite2D) => boolean
  rollbackAdoption?: (sprite: Sprite2D) => void
}

const runtimes = new WeakMap<object, RuntimeInitializer>()

export function registerSpriteGroupRuntime(group: object, initialize: () => World): void {
  runtimes.set(group, initialize)
}

/** Register Flatland's package-private direct-adoption transaction entry points. */
export function registerSpriteGroupAdoption(
  group: object,
  adopt: (sprite: Sprite2D) => boolean,
  rollback: (sprite: Sprite2D) => void
): void {
  const runtime = runtimes.get(group)
  if (!runtime) throw new Error('three-flatland: cannot register adoption on a disposed SpriteGroup runtime')
  runtime.adopt = adopt
  runtime.rollbackAdoption = rollback
}

export function adoptSpriteIntoGroup(group: object, sprite: Sprite2D): boolean {
  const adopt = runtimes.get(group)?.adopt
  if (!adopt) throw new Error('three-flatland: SpriteGroup adoption cannot run after dispose()')
  return adopt(sprite)
}

export function rollbackSpriteGroupAdoption(group: object, sprite: Sprite2D): void {
  runtimes.get(group)?.rollbackAdoption?.(sprite)
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
  if (initialize) {
    initialize.beforeDispose = undefined
    initialize.adopt = undefined
    initialize.rollbackAdoption = undefined
  }
  runtimes.delete(group)
}
