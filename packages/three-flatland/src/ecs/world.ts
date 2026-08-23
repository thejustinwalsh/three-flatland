import { createWorld } from './runtime'
import type { WorldHandle } from '../internal/ecs-handles'

type RuntimeWorld = ReturnType<typeof createWorld>

/** Global fallback world for standalone sprites (no SpriteGroup parent) */
let _globalWorld: RuntimeWorld | null = null

/**
 * Get the global fallback world.
 * Created lazily on first access. Used by sprites that aren't
 * inside a SpriteGroup or Flatland context.
 */
export function getGlobalWorld(): WorldHandle {
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
 * Interface for Three.js objects that provide ECS world context to children.
 * Implemented by SpriteGroup and Flatland.
 */
export interface WorldProvider {
  readonly world: WorldHandle
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
export function assignWorld(child: { _flatlandWorld?: WorldHandle | null }, world: WorldHandle): void {
  if (child._flatlandWorld && child._flatlandWorld !== world) {
    throw new Error('three-flatland: Cannot switch worlds after creation. Destroy and recreate the object.')
  }
  child._flatlandWorld = world
}
