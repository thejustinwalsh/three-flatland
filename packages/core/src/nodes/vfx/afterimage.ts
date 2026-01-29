import { vec2, vec3, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec3Input, Vec2Input } from '../types'

/**
 * Create afterimage/ghost effect by blending with a previous frame.
 * Requires a texture containing the previous frame.
 *
 * @param currentColor - Current frame color
 * @param previousTex - Previous frame texture
 * @param uv - UV coordinates
 * @param persistence - How much previous frame persists (0-1, default: 0.8)
 * @returns Blended color with afterimage
 *
 * @example
 * // Render to texture, then use previous frame
 * const ghosted = afterimage(currentColor, previousFrameTexture, uv, 0.85)
 */
export function afterimage(
  currentColor: TSLNode,
  previousTex: Texture,
  uv: TSLNode,
  persistence: FloatInput = 0.8
): TSLNode {
  const persistenceNode = typeof persistence === 'number' ? float(persistence) : persistence

  const previousColor = sampleTexture(previousTex, uv)

  // Blend previous with current
  const blended = previousColor.rgb.mul(persistenceNode).add(currentColor.rgb.mul(float(1).sub(persistenceNode)))

  return vec4(blended, currentColor.a)
}

/**
 * Afterimage with color tinting for ghost trails.
 *
 * @param currentColor - Current frame color
 * @param previousTex - Previous frame texture
 * @param uv - UV coordinates
 * @param persistence - Persistence amount
 * @param ghostTint - Color tint for the ghost (default: slight blue)
 * @returns Color with tinted afterimage
 */
export function afterimageTinted(
  currentColor: TSLNode,
  previousTex: Texture,
  uv: TSLNode,
  persistence: FloatInput = 0.8,
  ghostTint: Vec3Input = [0.8, 0.9, 1]
): TSLNode {
  const persistenceNode = typeof persistence === 'number' ? float(persistence) : persistence
  const tintVec = Array.isArray(ghostTint) ? vec3(...ghostTint) : ghostTint

  const previousColor = sampleTexture(previousTex, uv)

  // Tint the previous frame
  const tintedPrevious = previousColor.rgb.mul(tintVec)

  const blended = tintedPrevious.mul(persistenceNode).add(currentColor.rgb.mul(float(1).sub(persistenceNode)))

  return vec4(blended, currentColor.a)
}

/**
 * Additive afterimage for glowing ghost effects.
 *
 * @param currentColor - Current frame color
 * @param previousTex - Previous frame texture
 * @param uv - UV coordinates
 * @param persistence - Persistence amount
 * @param intensity - Glow intensity
 * @returns Color with additive afterimage
 */
export function afterimageGlow(
  currentColor: TSLNode,
  previousTex: Texture,
  uv: TSLNode,
  persistence: FloatInput = 0.7,
  intensity: FloatInput = 0.5
): TSLNode {
  const persistenceNode = typeof persistence === 'number' ? float(persistence) : persistence
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const previousColor = sampleTexture(previousTex, uv)

  // Add fading previous frame
  const blended = currentColor.rgb.add(previousColor.rgb.mul(persistenceNode).mul(intensityNode))

  return vec4(blended, currentColor.a)
}

/**
 * Multiple ghost/clone effect at offset positions.
 * Creates several semi-transparent copies at fixed offsets.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param offsets - Array of offset positions for ghosts
 * @param baseOpacity - Opacity of each ghost (default: 0.3)
 * @param fadeWithDistance - Fade ghosts based on offset distance
 * @returns Color with ghost clones
 *
 * @example
 * const ghosts = ghost(texture, uv, [[0.02, 0], [0.04, 0], [0.06, 0]], 0.3)
 */
export function ghost(
  tex: Texture,
  uv: TSLNode,
  offsets: Array<[number, number]>,
  baseOpacity: FloatInput = 0.3,
  fadeWithDistance: boolean = true
): TSLNode {
  const opacityNode = typeof baseOpacity === 'number' ? float(baseOpacity) : baseOpacity

  // Main sample
  let result: TSLNode = sampleTexture(tex, uv)

  // Add ghost samples
  for (let i = 0; i < offsets.length; i++) {
    const [ox, oy] = offsets[i]!
    const offsetVec = vec2(float(ox), float(oy))
    const ghostSample = sampleTexture(tex, uv.add(offsetVec))

    // Fade based on position in sequence
    const opacity = fadeWithDistance
      ? opacityNode.mul(float(1 - i / offsets.length))
      : opacityNode

    // Blend ghost under main image
    const blendedRGB = result.rgb.add(ghostSample.rgb.mul(opacity).mul(float(1).sub(result.a)))
    result = vec4(blendedRGB, result.a.max(ghostSample.a.mul(opacity)))
  }

  return result
}

/**
 * Directional ghost trail - creates ghosts along a direction.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Direction of ghost trail
 * @param count - Number of ghosts
 * @param spacing - Space between ghosts
 * @param opacity - Ghost opacity
 * @returns Color with directional ghosts
 */
export function ghostTrail(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input,
  count: number = 3,
  spacing: FloatInput = 0.02,
  opacity: FloatInput = 0.4
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(float(direction[0]), float(direction[1])) : direction
  const spacingNode = typeof spacing === 'number' ? float(spacing) : spacing
  const opacityNode = typeof opacity === 'number' ? float(opacity) : opacity

  let result: TSLNode = sampleTexture(tex, uv)

  for (let i = 1; i <= count; i++) {
    const t = float(i)
    const offset = vec2(dirVec.x.mul(spacingNode).mul(t), dirVec.y.mul(spacingNode).mul(t))
    const ghostSample = sampleTexture(tex, uv.add(offset))

    const ghostOpacity = opacityNode.mul(float(1 - i / (count + 1)))

    const blendedRGB = result.rgb.add(ghostSample.rgb.mul(ghostOpacity).mul(float(1).sub(result.a)))
    result = vec4(blendedRGB, result.a.max(ghostSample.a.mul(ghostOpacity)))
  }

  return result
}

/**
 * Speed ghost effect - ghosts that appear based on movement speed.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param velocity - Movement velocity
 * @param maxGhosts - Maximum number of ghosts at full speed
 * @param spacing - Base spacing between ghosts
 * @param opacity - Ghost opacity
 * @returns Color with speed-based ghosts
 */
export function ghostSpeed(
  tex: Texture,
  uv: TSLNode,
  velocity: TSLNode | Vec2Input,
  maxGhosts: number = 5,
  spacing: FloatInput = 0.015,
  opacity: FloatInput = 0.5
): TSLNode {
  const velVec = Array.isArray(velocity) ? vec2(float(velocity[0]), float(velocity[1])) : velocity
  const spacingNode = typeof spacing === 'number' ? float(spacing) : spacing
  const opacityNode = typeof opacity === 'number' ? float(opacity) : opacity

  // Speed determines number of visible ghosts
  const speed = velVec.x.mul(velVec.x).add(velVec.y.mul(velVec.y)).sqrt()
  const direction = vec2(velVec.x.div(speed.max(0.001)), velVec.y.div(speed.max(0.001)))

  let result: TSLNode = sampleTexture(tex, uv)

  for (let i = 1; i <= maxGhosts; i++) {
    const t = float(i)
    const offset = vec2(direction.x.mul(spacingNode).mul(t), direction.y.mul(spacingNode).mul(t))
    const ghostSample = sampleTexture(tex, uv.add(offset))

    // Fade based on index and speed
    const speedFactor = speed.clamp(0, 1)
    const indexFactor = float(1 - i / (maxGhosts + 1))
    const ghostOpacity = opacityNode.mul(indexFactor).mul(speedFactor)

    const blendedRGB = result.rgb.add(ghostSample.rgb.mul(ghostOpacity).mul(float(1).sub(result.a)))
    result = vec4(blendedRGB, result.a.max(ghostSample.a.mul(ghostOpacity)))
  }

  return result
}
