import { vec2, vec3, float } from 'three/tsl'
import type { TSLNode, Vec2Input, Vec3Input, FloatInput } from '../types'

/**
 * Light data structure returned by light calculation nodes.
 * Contains direction, intensity, and attenuation for use in lighting calculations.
 */
export interface Light2DResult {
  /** Direction from surface to light (normalized vec3) */
  direction: TSLNode
  /** Light color multiplied by intensity */
  color: TSLNode
  /** Distance attenuation factor (0-1) */
  attenuation: TSLNode
}

/**
 * Calculate 2D point light contribution at a surface position.
 * Provides direction, color, and distance-based attenuation.
 *
 * @param surfacePos - Position of the surface being lit (vec2 in world/screen space)
 * @param lightPos - Position of the light source (vec2)
 * @param lightColor - Light color as [r, g, b] (0-1 range)
 * @param intensity - Light intensity multiplier (default: 1)
 * @param radius - Maximum light radius (default: 100)
 * @param falloff - Attenuation falloff exponent (default: 2 for inverse-square)
 * @returns Light2DResult with direction, color, and attenuation
 *
 * @example
 * const light = pointLight2D(fragPos, [100, 100], [1, 0.9, 0.8], 2.0, 200)
 * const diffuse = litDiffuse(normal, light.direction, inputColor, light.color, light.attenuation)
 */
export function pointLight2D(
  surfacePos: TSLNode | Vec2Input,
  lightPos: Vec2Input,
  lightColor: Vec3Input = [1, 1, 1],
  intensity: FloatInput = 1,
  radius: FloatInput = 100,
  falloff: FloatInput = 2
): Light2DResult {
  const surfaceVec = Array.isArray(surfacePos) ? vec2(...surfacePos) : surfacePos
  const lightVec = Array.isArray(lightPos) ? vec2(...lightPos) : lightPos
  const colorVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const radiusNode = typeof radius === 'number' ? float(radius) : radius
  const falloffNode = typeof falloff === 'number' ? float(falloff) : falloff

  // Calculate direction from surface to light
  const toLight = lightVec.sub(surfaceVec)
  const distance = toLight.length()
  const direction = vec3(toLight.normalize(), float(0))

  // Calculate attenuation with smooth falloff at radius edge
  const normalizedDist = distance.div(radiusNode).clamp(0, 1)
  const attenuation = float(1)
    .sub(normalizedDist.pow(falloffNode))
    .clamp(0, 1)

  return {
    direction,
    color: colorVec.mul(intensityNode),
    attenuation,
  }
}

/**
 * Calculate 2D spot light contribution with cone falloff.
 *
 * @param surfacePos - Position of the surface being lit
 * @param lightPos - Position of the light source
 * @param lightDir - Direction the spotlight is pointing (normalized vec2)
 * @param lightColor - Light color
 * @param intensity - Light intensity
 * @param radius - Maximum light distance
 * @param innerAngle - Inner cone angle in radians (full intensity)
 * @param outerAngle - Outer cone angle in radians (falloff to zero)
 * @returns Light2DResult with cone attenuation applied
 *
 * @example
 * const spot = spotLight2D(fragPos, [100, 100], [0, -1], [1, 1, 0.9], 1.5, 150, 0.3, 0.6)
 */
export function spotLight2D(
  surfacePos: TSLNode | Vec2Input,
  lightPos: Vec2Input,
  lightDir: Vec2Input,
  lightColor: Vec3Input = [1, 1, 1],
  intensity: FloatInput = 1,
  radius: FloatInput = 100,
  innerAngle: FloatInput = 0.3,
  outerAngle: FloatInput = 0.6
): Light2DResult {
  const surfaceVec = Array.isArray(surfacePos) ? vec2(...surfacePos) : surfacePos
  const lightVec = Array.isArray(lightPos) ? vec2(...lightPos) : lightPos
  const dirVec = Array.isArray(lightDir) ? vec2(...lightDir) : lightDir
  const colorVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const radiusNode = typeof radius === 'number' ? float(radius) : radius
  const innerNode = typeof innerAngle === 'number' ? float(innerAngle) : innerAngle
  const outerNode = typeof outerAngle === 'number' ? float(outerAngle) : outerAngle

  // Direction from light to surface
  const toSurface = surfaceVec.sub(lightVec)
  const distance = toSurface.length()
  const toSurfaceNorm = toSurface.normalize()

  // Angle between light direction and direction to surface
  const spotCos = toSurfaceNorm.dot(dirVec.normalize())
  const innerCos = innerNode.cos()
  const outerCos = outerNode.cos()

  // Cone attenuation (smooth falloff between inner and outer)
  const coneAttenuation = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)

  // Distance attenuation
  const distAttenuation = float(1).sub(distance.div(radiusNode).clamp(0, 1))

  // Direction from surface to light (for lighting calculations)
  const direction = vec3(toSurfaceNorm.negate(), float(0))

  return {
    direction,
    color: colorVec.mul(intensityNode),
    attenuation: coneAttenuation.mul(distAttenuation),
  }
}

/**
 * Calculate directional light (like sunlight) - infinite distance, uniform direction.
 *
 * @param lightDir - Direction the light is coming FROM (will be negated)
 * @param lightColor - Light color
 * @param intensity - Light intensity
 * @returns Light2DResult with no distance attenuation
 *
 * @example
 * // Sun coming from top-right
 * const sun = directionalLight2D([1, 1], [1, 0.95, 0.9], 1.0)
 */
export function directionalLight2D(
  lightDir: Vec2Input,
  lightColor: Vec3Input = [1, 1, 1],
  intensity: FloatInput = 1
): Light2DResult {
  const dirVec = Array.isArray(lightDir) ? vec2(...lightDir) : lightDir
  const colorVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Negate and normalize direction (convert from "from" to "to" direction)
  const direction = vec3(dirVec.negate().normalize(), float(0))

  return {
    direction,
    color: colorVec.mul(intensityNode),
    attenuation: float(1), // No distance falloff for directional light
  }
}

/**
 * Ambient light provides uniform illumination from all directions.
 *
 * @param lightColor - Light color
 * @param intensity - Light intensity
 * @returns Light2DResult with upward direction (for ambient occlusion compatibility)
 *
 * @example
 * const ambient = ambientLight2D([0.2, 0.2, 0.3], 1.0)
 */
export function ambientLight2D(
  lightColor: Vec3Input = [1, 1, 1],
  intensity: FloatInput = 0.2
): Light2DResult {
  const colorVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  return {
    direction: vec3(0, 0, 1), // Pointing up (forward in tangent space)
    color: colorVec.mul(intensityNode),
    attenuation: float(1),
  }
}
