import type { AnimatedSprite2D } from '../sprites/AnimatedSprite2D'
import type { Sprite2D } from '../sprites/Sprite2D'

const animatedSprites = new WeakSet<object>()

export function registerAnimatedSprite(sprite: AnimatedSprite2D): void {
  animatedSprites.add(sprite)
}

export function isAnimatedSprite(sprite: Sprite2D): sprite is AnimatedSprite2D {
  return animatedSprites.has(sprite)
}
