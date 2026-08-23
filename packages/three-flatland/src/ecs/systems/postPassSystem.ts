import { select, type World } from '../runtime'
import type Node from 'three/src/nodes/core/Node.js'
import { PostPassTrait, PostPassRegistry } from '../traits'

type PassFn = (input: Node<'vec4'>, uv: Node<'vec2'>) => Node<'vec4'>

const PostPassRegistries = select(PostPassRegistry)
const PostPasses = select(PostPassTrait)

/**
 * Query sorted post-processing pass functions from the ECS world.
 * Returns the sorted pass function array if the registry is dirty, or null if clean.
 * Clears the dirty flag after collecting.
 */
export function postPassSystem(world: World): PassFn[] | null {
  // Find registry entity — early return if none exists or not dirty
  const registryEntities = world.view(PostPassRegistries)
  if (registryEntities.length === 0) return null

  const registryData = world.read(registryEntities[0]!, PostPassRegistry)
  if (!registryData || !registryData.dirty) return null

  // Clear dirty flag
  world.patch(registryEntities[0]!, PostPassRegistry, { dirty: false })

  // Collect all enabled pass entities, sorted by order
  const passEntities = world.view(PostPasses)
  const passes: { fn: PassFn; order: number }[] = []

  for (const entity of passEntities) {
    const data = world.read(entity, PostPassTrait)
    if (data && data.enabled && data.fn) {
      passes.push({ fn: data.fn, order: data.order })
    }
  }

  passes.sort((a, b) => a.order - b.order)
  return passes.map((p) => p.fn)
}
