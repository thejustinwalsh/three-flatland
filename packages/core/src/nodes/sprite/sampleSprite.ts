import { vec2, float, texture as sampleTexture, uv, If, Discard, Fn } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, Vec4Input, FloatInput } from '../types'

/**
 * Sample a sprite from a texture with frame-based UV mapping.
 * Works with both animated sprites (pass uniform) and static sprites (pass fixed frame).
 *
 * @param tex - The sprite texture to sample
 * @param frame - Frame bounds as [x, y, width, height] in UV space (0-1), or a vec4 uniform
 * @param options - Optional settings
 * @returns Sampled color (vec4)
 *
 * @example
 * // Static sprite (full texture)
 * const color = sampleSprite(texture, [0, 0, 1, 1])
 *
 * @example
 * // Static sprite (specific frame)
 * const frame = spriteSheet.getFrame('idle_0')
 * const color = sampleSprite(texture, [frame.x, frame.y, frame.width, frame.height])
 *
 * @example
 * // Animated sprite (frame uniform updates each tick)
 * const frameUniform = uniform(new Vector4(0, 0, 0.125, 0.125))
 * const color = sampleSprite(texture, frameUniform)
 *
 * @example
 * // With alpha discard
 * const color = sampleSprite(texture, frame, { alphaTest: 0.01 })
 */
export function sampleSprite(
  tex: Texture,
  frame: Vec4Input,
  options: { alphaTest?: FloatInput } = {}
): TSLNode {
  const { alphaTest } = options

  // Handle frame as array or uniform
  let frameX: TSLNode
  let frameY: TSLNode
  let frameW: TSLNode
  let frameH: TSLNode

  if (Array.isArray(frame)) {
    frameX = float(frame[0])
    frameY = float(frame[1])
    frameW = float(frame[2])
    frameH = float(frame[3])
  } else {
    // Assume it's a vec4 uniform with x, y, z, w components
    frameX = frame.x
    frameY = frame.y
    frameW = frame.z
    frameH = frame.w
  }

  const frameOffset = vec2(frameX, frameY)
  const frameSize = vec2(frameW, frameH)
  const frameUV = uv().mul(frameSize).add(frameOffset)
  const color = sampleTexture(tex, frameUV)

  // Apply alpha test if specified
  if (alphaTest !== undefined) {
    const threshold = typeof alphaTest === 'number' ? float(alphaTest) : alphaTest
    return Fn(() => {
      If(color.a.lessThan(threshold), () => {
        Discard()
      })
      return color
    })()
  }

  return color
}

/**
 * Get the UV coordinates for a sprite frame.
 * Useful when you need the UV separately (e.g., for outline effects that sample neighbors).
 *
 * @param frame - Frame bounds as [x, y, width, height] in UV space (0-1), or a vec4 uniform
 * @returns Transformed UV coordinates for the frame
 *
 * @example
 * const frameUV = spriteUV(frameUniform)
 * const color = texture(tex, frameUV)
 * return outline8(color, frameUV, tex, { color: [0, 1, 0, 1] })
 */
export function spriteUV(frame: Vec4Input): TSLNode {
  let frameX: TSLNode
  let frameY: TSLNode
  let frameW: TSLNode
  let frameH: TSLNode

  if (Array.isArray(frame)) {
    frameX = float(frame[0])
    frameY = float(frame[1])
    frameW = float(frame[2])
    frameH = float(frame[3])
  } else {
    frameX = frame.x
    frameY = frame.y
    frameW = frame.z
    frameH = frame.w
  }

  const frameOffset = vec2(frameX, frameY)
  const frameSize = vec2(frameW, frameH)
  return uv().mul(frameSize).add(frameOffset)
}
