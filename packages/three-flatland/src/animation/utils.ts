import type { SpriteSheet } from '../sprites/types'
import type { Animation, AnimationFrame } from './types'

/**
 * Create an animation from a frame name pattern.
 *
 * @example
 * ```typescript
 * // Creates animation from 'player_walk_0', 'player_walk_1', etc.
 * const walkAnim = createAnimationFromPattern(sheet, 'walk', 'player_walk_', 4);
 * ```
 */
export function createAnimationFromPattern(
  spriteSheet: SpriteSheet,
  name: string,
  prefix: string,
  count: number,
  options: {
    fps?: number
    loop?: boolean
    pingPong?: boolean
    startIndex?: number
    suffix?: string
  } = {}
): Animation {
  const frames: AnimationFrame[] = []
  const startIndex = options.startIndex ?? 0
  const suffix = options.suffix ?? ''

  for (let i = 0; i < count; i++) {
    const frameName = `${prefix}${startIndex + i}${suffix}`
    const frame = spriteSheet.frames.get(frameName)

    if (!frame) {
      console.warn(`Frame not found: ${frameName}`)
      continue
    }

    frames.push({ frame })
  }

  return {
    name,
    frames,
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
    pingPong: options.pingPong ?? false,
  }
}

/**
 * Create animations from a naming convention.
 * Assumes frames are named: `{prefix}_{animationName}_{frameIndex}`
 *
 * @example
 * ```typescript
 * // Auto-detect animations from frames like 'player_idle_0', 'player_walk_0', etc.
 * const animations = createAnimationsFromNaming(sheet, 'player');
 * ```
 */
export function createAnimationsFromNaming(
  spriteSheet: SpriteSheet,
  prefix: string,
  options: { fps?: number; loop?: boolean } = {}
): Animation[] {
  const animationFrames = new Map<string, AnimationFrame[]>()

  for (const [frameName, spriteFrame] of spriteSheet.frames) {
    // Match pattern: prefix_animName_frameIndex
    const pattern = new RegExp(`^${prefix}_([a-zA-Z]+)_(\\d+)$`)
    const match = frameName.match(pattern)

    if (match) {
      const [, animName, frameIndex] = match
      if (!animationFrames.has(animName!)) {
        animationFrames.set(animName!, [])
      }
      // Store with index for sorting
      const frames = animationFrames.get(animName!)!
      frames[parseInt(frameIndex!, 10)] = { frame: spriteFrame }
    }
  }

  return Array.from(animationFrames.entries()).map(([name, frames]) => ({
    name,
    frames: frames.filter(Boolean), // Remove empty slots
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
  }))
}

/**
 * Create a simple animation from an array of frame names.
 */
export function createAnimation(
  spriteSheet: SpriteSheet,
  name: string,
  frameNames: string[],
  options: { fps?: number; loop?: boolean; pingPong?: boolean } = {}
): Animation {
  const frames: AnimationFrame[] = frameNames.map((frameName) => {
    const frame = spriteSheet.frames.get(frameName)
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`)
    }
    return { frame }
  })

  return {
    name,
    frames,
    fps: options.fps ?? 12,
    loop: options.loop ?? true,
    pingPong: options.pingPong ?? false,
  }
}

/**
 * Reverse an animation's frame order.
 */
export function reverseAnimation(animation: Animation, newName?: string): Animation {
  return {
    ...animation,
    name: newName ?? `${animation.name}_reverse`,
    frames: [...animation.frames].reverse(),
  }
}

/**
 * Concatenate multiple animations into one.
 */
export function concatAnimations(
  name: string,
  animations: Animation[],
  options: { fps?: number; loop?: boolean } = {}
): Animation {
  const frames = animations.flatMap((anim) => anim.frames)

  return {
    name,
    frames,
    fps: options.fps ?? animations[0]?.fps ?? 12,
    loop: options.loop ?? false,
  }
}
