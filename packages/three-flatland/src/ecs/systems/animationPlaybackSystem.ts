import type { Sprite2D } from '../../sprites/Sprite2D'
import { AnimationPlayback } from '../traits'
import { select, type Entity, type World } from '../runtime'
import type { RegistryData } from '../batchUtils'

const AnimatedSprites = select(AnimationPlayback)

interface AnimatedSprite extends Sprite2D {
  update(deltaMs: number): void
}

/**
 * Advance every enrolled animated sprite through one persistent selector.
 * The caller owns time; this system does not read a wall clock.
 */
export function animationPlaybackSystem(
  world: World,
  registry: RegistryData,
  deltaMs: number,
  scratch: Entity[]
): void {
  const selected = world.view(AnimatedSprites)
  scratch.length = selected.length
  for (let index = 0; index < selected.length; index++) scratch[index] = selected[index]!

  try {
    for (const entity of scratch) {
      if (world.disposed || !world.isAlive(entity) || !world.has(entity, AnimationPlayback)) continue
      const sprite = registry.spriteArr[world.index(entity)] as AnimatedSprite | null
      sprite?.update(deltaMs)
    }
  } finally {
    scratch.length = 0
  }
}
