import { vec3, vec4, float, smoothstep } from 'three/tsl'
import type { TSLNode, FloatInput, Vec3Input } from '../types'

/**
 * Apply a flash effect - temporary color overlay that fades out.
 * Useful for damage feedback, power-ups, or emphasis.
 *
 * @param inputColor - Base color (vec4)
 * @param progress - Flash progress (0 = start, 1 = end/invisible)
 * @param flashColor - Color of the flash (default: white)
 * @param intensity - Flash intensity at peak (default: 1)
 * @returns Color with flash overlay
 *
 * @example
 * // Trigger flash on hit, animate progress from 0 to 1
 * const flashed = flash(inputColor, flashProgress, [1, 1, 1])
 */
export function flash(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  flashColor: Vec3Input = [1, 1, 1],
  intensity: FloatInput = 1
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const colorVec = Array.isArray(flashColor) ? vec3(...flashColor) : flashColor
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Flash fades out as progress increases
  const flashIntensity = float(1).sub(progressNode).clamp(0, 1).mul(intensityNode)

  const finalRGB = inputColor.rgb.mix(colorVec, flashIntensity)

  return vec4(finalRGB, inputColor.a)
}

/**
 * Flash with smooth in and out transition.
 *
 * @param inputColor - Base color
 * @param progress - Flash progress (0-1)
 * @param flashColor - Color of flash
 * @param peakTime - When flash is brightest (0-1, default: 0.2)
 * @param intensity - Peak intensity
 * @returns Color with smooth flash
 */
export function flashSmooth(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  flashColor: Vec3Input = [1, 1, 1],
  peakTime: FloatInput = 0.2,
  intensity: FloatInput = 1
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const colorVec = Array.isArray(flashColor) ? vec3(...flashColor) : flashColor
  const peakNode = typeof peakTime === 'number' ? float(peakTime) : peakTime
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Ramp up to peak, then fade out
  const fadeIn = smoothstep(float(0), peakNode, progressNode)
  const fadeOut = smoothstep(float(1), peakNode, progressNode)
  const flashIntensity = fadeIn.mul(fadeOut).mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(flashIntensity))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Additive flash that brightens without fully replacing color.
 *
 * @param inputColor - Base color
 * @param progress - Flash progress
 * @param flashColor - Color to add
 * @param intensity - Flash intensity
 * @returns Color with additive flash
 */
export function flashAdditive(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  flashColor: Vec3Input = [1, 1, 1],
  intensity: FloatInput = 0.8
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const colorVec = Array.isArray(flashColor) ? vec3(...flashColor) : flashColor
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const flashAmount = float(1).sub(progressNode).clamp(0, 1).mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(flashAmount))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Flash that affects alpha as well (sprite becomes visible/invisible).
 *
 * @param inputColor - Base color
 * @param progress - Flash progress
 * @param flashColor - Color of flash
 * @param alphaFlash - How much to affect alpha (0 = none, 1 = fully visible at flash)
 * @returns Color with alpha flash
 */
export function flashAlpha(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  flashColor: Vec3Input = [1, 1, 1],
  alphaFlash: FloatInput = 0.5
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const colorVec = Array.isArray(flashColor) ? vec3(...flashColor) : flashColor
  const alphaNode = typeof alphaFlash === 'number' ? float(alphaFlash) : alphaFlash

  const flashIntensity = float(1).sub(progressNode).clamp(0, 1)

  const finalRGB = inputColor.rgb.mix(colorVec, flashIntensity)
  const finalAlpha = inputColor.a.add(flashIntensity.mul(alphaNode))

  return vec4(finalRGB, finalAlpha.clamp(0, 1))
}

/**
 * Damage flash effect - quick red flash common in games.
 *
 * @param inputColor - Base color
 * @param progress - Flash progress (0 = hit, 1 = recovered)
 * @param intensity - Flash intensity
 * @returns Color with damage flash
 */
export function flashDamage(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  intensity: FloatInput = 0.7
): TSLNode {
  return flash(inputColor, progress, [1, 0.2, 0.2], intensity)
}

/**
 * Healing flash effect - green glow.
 *
 * @param inputColor - Base color
 * @param progress - Flash progress
 * @param intensity - Flash intensity
 * @returns Color with healing flash
 */
export function flashHeal(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  intensity: FloatInput = 0.6
): TSLNode {
  return flashSmooth(inputColor, progress, [0.3, 1, 0.4], 0.3, intensity)
}

/**
 * Power-up flash with golden glow.
 *
 * @param inputColor - Base color
 * @param progress - Flash progress
 * @param intensity - Flash intensity
 * @returns Color with power-up flash
 */
export function flashPowerUp(
  inputColor: TSLNode,
  progress: TSLNode | FloatInput,
  intensity: FloatInput = 0.8
): TSLNode {
  return flashSmooth(inputColor, progress, [1, 0.85, 0.3], 0.25, intensity)
}
