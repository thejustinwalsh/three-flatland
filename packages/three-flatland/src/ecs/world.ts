import { createWorld } from './runtime'
import type { World } from './runtime'
import type { Sprite2D } from '../sprites/Sprite2D'
import { stageSpriteWorld } from '../internal/sprite-runtime'

type RuntimeWorld = ReturnType<typeof createWorld>

/** Global fallback world for standalone sprites (no SpriteGroup parent) */
let _globalWorld: RuntimeWorld | null = null

/**
 * Get the global fallback world.
 * Created lazily on first access. Used by sprites that aren't
 * inside a SpriteGroup or Flatland context.
 */
export function getGlobalWorld(): World {
  if (!_globalWorld) _globalWorld = createWorld()
  return _globalWorld
}

/**
 * Reset the global world (for testing).
 * @internal
 */
export function resetGlobalWorld(): void {
  if (_globalWorld) {
    _globalWorld.dispose()
    _globalWorld = null
  }
}

/**
 * Assign an ECS world to a child object.
 * Propagates world context down the Three.js scene graph.
 *
 * Throws if the child already has a different world assigned —
 * switching worlds after creation is not allowed. Destroy and
 * recreate the object instead.
 *
 * @param child - Three.js object to assign world to
 * @param world - ECS world to assign
 */
export function assignWorld(child: Sprite2D, world: World): void {
  stageSpriteWorld(child, world)
}
