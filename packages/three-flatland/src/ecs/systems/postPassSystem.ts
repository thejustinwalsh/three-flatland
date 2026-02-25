import type { World } from 'koota'
import type Node from 'three/src/nodes/core/Node.js'
import { PostPassTrait, PostPassRegistry } from '../traits'

type PassFn = (input: Node<'vec4'>, uv: Node<'vec2'>) => Node<'vec4'>

/**
 * Query sorted post-processing pass functions from the ECS world.
 * Returns the sorted pass function array if the registry is dirty, or null if clean.
 * Clears the dirty flag after collecting.
 */
export function postPassSystem(world: World): PassFn[] | null {
  // Find registry entity — early return if none exists or not dirty
  const registryEntities = world.query(PostPassRegistry)
  if (registryEntities.length === 0) return null

  const registryData = registryEntities[0]!.get(PostPassRegistry) as
    | { dirty: boolean }
    | undefined
  if (!registryData || !registryData.dirty) return null

  // Clear dirty flag
  registryEntities[0]!.set(PostPassRegistry, { dirty: false })

  // Collect all enabled pass entities, sorted by order
  const passEntities = world.query(PostPassTrait)
  const passes: { fn: PassFn; order: number }[] = []

  for (const entity of passEntities) {
    const data = entity.get(PostPassTrait) as
      | { fn: PassFn | null; order: number; enabled: boolean }
      | undefined
    if (data && data.enabled && data.fn) {
      passes.push({ fn: data.fn, order: data.order })
    }
  }

  passes.sort((a, b) => a.order - b.order)
  return passes.map((p) => p.fn)
}
