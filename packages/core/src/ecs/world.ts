import { createWorld, type World } from 'koota'

/** Global fallback world for standalone sprites (no Renderer2D parent) */
let _globalWorld: World | null = null

/**
 * Get the global fallback world.
 * Created lazily on first access. Used by sprites that aren't
 * inside a Renderer2D or Flatland context.
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
    _globalWorld.destroy()
    _globalWorld = null
  }
}

/**
 * Interface for Three.js objects that provide ECS world context to children.
 * Implemented by Renderer2D and Flatland.
 */
export interface WorldProvider {
  readonly world: World
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
export function assignWorld(child: { _flatlandWorld?: World | null }, world: World): void {
  if (child._flatlandWorld && child._flatlandWorld !== world) {
    throw new Error(
      'three-flatland: Cannot switch worlds after creation. Destroy and recreate the object.'
    )
  }
  child._flatlandWorld = world
}
