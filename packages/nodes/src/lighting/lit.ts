import { vec3, vec4, float, mix } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { Vec3Input, FloatInput } from '../types'
import type { Light2DResult } from './lights'

/**
 * Calculate diffuse (Lambertian) lighting.
 * Basic directional shading based on surface normal and light direction.
 *
 * @param normal - Surface normal (normalized vec3 in tangent space)
 * @param lightDir - Direction to light (normalized vec3)
 * @param surfaceColor - Base surface color (vec4)
 * @param lightColor - Light color (vec3)
 * @param attenuation - Light attenuation factor (0-1)
 * @returns Lit surface color (vec4)
 *
 * @example
 * const lit = litDiffuse(normal, light.direction, inputColor, light.color, light.attenuation)
 */
export function litDiffuse(
  normal: Node<'vec3'>,
  lightDir: Node<'vec3'>,
  surfaceColor: Node<'vec4'>,
  lightColor: Node<'vec3'> | Vec3Input,
  attenuation: Node<'float'> | FloatInput = 1
): Node<'vec4'> {
  const lightVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const attNode = typeof attenuation === 'number' ? float(attenuation) : attenuation

  // N·L for diffuse intensity
  const NdotL = normal.dot(lightDir).clamp(0, 1)

  // Apply lighting to surface color
  const litRGB = surfaceColor.rgb.mul(lightVec).mul(NdotL).mul(attNode)

  return vec4(litRGB, surfaceColor.a)
}

/**
 * Calculate specular highlights (Blinn-Phong model).
 *
 * @param normal - Surface normal
 * @param lightDir - Direction to light
 * @param viewDir - Direction to camera/viewer (default: straight up/forward)
 * @param lightColor - Light color
 * @param attenuation - Light attenuation
 * @param shininess - Specular power/tightness (higher = smaller, sharper highlight)
 * @param specularStrength - Specular intensity multiplier
 * @returns Specular highlight color (vec3, add to diffuse result)
 *
 * @example
 * const spec = litSpecular(normal, light.direction, viewDir, light.color, light.attenuation, 32, 0.5)
 */
export function litSpecular(
  normal: Node<'vec3'>,
  lightDir: Node<'vec3'>,
  viewDir: Node<'vec3'> | Vec3Input = [0, 0, 1],
  lightColor: Node<'vec3'> | Vec3Input = [1, 1, 1],
  attenuation: Node<'float'> | FloatInput = 1,
  shininess: FloatInput = 32,
  specularStrength: FloatInput = 0.5
): Node<'vec3'> {
  const viewVec = Array.isArray(viewDir) ? vec3(...viewDir) : viewDir
  const lightVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const attNode = typeof attenuation === 'number' ? float(attenuation) : attenuation
  const shineNode = typeof shininess === 'number' ? float(shininess) : shininess
  const strengthNode =
    typeof specularStrength === 'number' ? float(specularStrength) : specularStrength

  // Half-vector for Blinn-Phong
  const halfDir = lightDir.add(viewVec).normalize()

  // N·H for specular intensity
  const NdotH = normal.dot(halfDir).clamp(0, 1)
  const spec = NdotH.pow(shineNode).mul(strengthNode).mul(attNode)

  return lightVec.mul(spec)
}

/**
 * Calculate rim/fresnel lighting effect.
 * Creates a glow around edges when viewed from an angle.
 *
 * @param normal - Surface normal
 * @param viewDir - Direction to camera/viewer
 * @param rimColor - Rim light color
 * @param rimPower - Rim falloff exponent (higher = tighter rim)
 * @param rimStrength - Rim intensity multiplier
 * @returns Rim light color (vec3, add to other lighting)
 *
 * @example
 * const rim = litRim(normal, [0, 0, 1], [0.5, 0.8, 1], 3, 1)
 */
export function litRim(
  normal: Node<'vec3'>,
  viewDir: Node<'vec3'> | Vec3Input = [0, 0, 1],
  rimColor: Vec3Input = [1, 1, 1],
  rimPower: FloatInput = 2,
  rimStrength: FloatInput = 1
): Node<'vec3'> {
  const viewVec = Array.isArray(viewDir) ? vec3(...viewDir) : viewDir
  const rimVec = Array.isArray(rimColor) ? vec3(...rimColor) : rimColor
  const powerNode = typeof rimPower === 'number' ? float(rimPower) : rimPower
  const strengthNode = typeof rimStrength === 'number' ? float(rimStrength) : rimStrength

  // Fresnel-like effect: 1 - N·V gives edge intensity
  const NdotV = normal.dot(viewVec).clamp(0, 1)
  const rimFactor = float(1).sub(NdotV).pow(powerNode).mul(strengthNode)

  return rimVec.mul(rimFactor)
}

/**
 * Calculate cel-shaded (toon) lighting with hard bands.
 *
 * @param normal - Surface normal
 * @param lightDir - Direction to light
 * @param surfaceColor - Base surface color
 * @param lightColor - Light color
 * @param attenuation - Light attenuation
 * @param bands - Number of shading bands (default: 3)
 * @param shadowColor - Color of shadowed areas (default: darker version of surface)
 * @returns Cel-shaded color (vec4)
 *
 * @example
 * const toon = litCelShaded(normal, light.direction, inputColor, light.color, light.attenuation, 3)
 */
export function litCelShaded(
  normal: Node<'vec3'>,
  lightDir: Node<'vec3'>,
  surfaceColor: Node<'vec4'>,
  lightColor: Node<'vec3'> | Vec3Input = [1, 1, 1],
  attenuation: Node<'float'> | FloatInput = 1,
  bands: FloatInput = 3,
  shadowColor?: Vec3Input | Node<'vec3'>
): Node<'vec4'> {
  const lightVec = Array.isArray(lightColor) ? vec3(...lightColor) : lightColor
  const attNode = typeof attenuation === 'number' ? float(attenuation) : attenuation
  const bandsNode = typeof bands === 'number' ? float(bands) : bands

  // N·L for light intensity
  const NdotL = normal.dot(lightDir).clamp(0, 1).mul(attNode)

  // Quantize to bands
  const quantized = NdotL.mul(bandsNode).floor().div(bandsNode)

  // Apply banded lighting
  const shadowVec: Node<'vec3'> = shadowColor
    ? Array.isArray(shadowColor)
      ? vec3(...shadowColor)
      : shadowColor
    : vec3(surfaceColor.rgb.mul(0.3))

  const litRGB = mix(shadowVec, surfaceColor.rgb.mul(lightVec), quantized)

  return vec4(litRGB, surfaceColor.a)
}

/**
 * Combined sprite lighting with multiple lights.
 * Accumulates diffuse (and optionally specular) contributions from all lights,
 * adds ambient, and optionally applies rim lighting.
 *
 * @param normal - Surface normal (normalized vec3)
 * @param surfaceColor - Base surface color (vec4)
 * @param lights - Array of Light2DResult from point/spot/directional lights
 * @param ambient - Optional ambient Light2DResult
 * @param options - Additional lighting options
 * @returns Fully lit color (vec4)
 *
 * @example
 * const result = litSpriteMulti(normal, baseColor, [torch1, torch2], ambient, {
 *   specular: true,
 *   shininess: 32,
 * })
 */
export function litSpriteMulti(
  normal: Node<'vec3'>,
  surfaceColor: Node<'vec4'>,
  lights: Light2DResult[],
  ambient?: Light2DResult,
  options: LitSpriteOptions = {}
): Node<'vec4'> {
  const {
    specular = false,
    shininess = 32,
    specularStrength = 0.5,
    rim = false,
    rimColor = [1, 1, 1],
    rimPower = 2,
    rimStrength = 1,
    viewDir = [0, 0, 1],
  } = options

  const viewVec = Array.isArray(viewDir) ? vec3(...viewDir) : viewDir

  // Start accumulating light contributions
  let totalDiffuse: Node<'vec3'> = vec3(0, 0, 0)
  let totalSpecular: Node<'vec3'> | null = null

  for (const light of lights) {
    // N·L diffuse
    const NdotL = normal.dot(light.direction).clamp(0, 1)
    const diffuseContrib = light.color.mul(NdotL).mul(light.attenuation)
    totalDiffuse = totalDiffuse.add(diffuseContrib)

    // Per-light specular
    if (specular) {
      const spec = litSpecular(
        normal,
        light.direction,
        viewVec,
        light.color,
        light.attenuation,
        shininess,
        specularStrength
      )
      totalSpecular = totalSpecular ? totalSpecular.add(spec) : spec
    }
  }

  // Add ambient
  if (ambient) {
    totalDiffuse = totalDiffuse.add(ambient.color)
  }

  // Apply lighting to surface color
  let result: Node<'vec4'> = vec4(surfaceColor.rgb.mul(totalDiffuse), surfaceColor.a)

  // Add specular
  if (totalSpecular) {
    result = vec4(result.rgb.add(totalSpecular), surfaceColor.a)
  }

  // Add rim if enabled
  if (rim) {
    const rimLight = litRim(normal, viewVec, rimColor, rimPower, rimStrength)
    result = vec4(result.rgb.add(rimLight), surfaceColor.a)
  }

  return result
}

/**
 * Combined sprite lighting with diffuse, specular, and optional rim.
 * Convenience function that combines common lighting components.
 *
 * @param normal - Surface normal
 * @param surfaceColor - Base surface color
 * @param light - Light result from pointLight2D, directionalLight2D, etc.
 * @param ambient - Ambient light result
 * @param options - Additional lighting options
 * @returns Fully lit color (vec4)
 *
 * @example
 * const lit = litSprite(normal, inputColor, pointLight, ambient, {
 *   specular: true,
 *   shininess: 32,
 *   rim: true,
 *   rimColor: [0.5, 0.8, 1]
 * })
 */
export interface LitSpriteOptions {
  /** Enable specular highlights */
  specular?: boolean
  /** Specular shininess (default: 32) */
  shininess?: FloatInput
  /** Specular strength (default: 0.5) */
  specularStrength?: FloatInput
  /** Enable rim lighting */
  rim?: boolean
  /** Rim light color */
  rimColor?: Vec3Input
  /** Rim power (default: 2) */
  rimPower?: FloatInput
  /** Rim strength (default: 1) */
  rimStrength?: FloatInput
  /** View direction for specular/rim (default: [0, 0, 1]) */
  viewDir?: Vec3Input | Node<'vec3'>
}

export function litSprite(
  normal: Node<'vec3'>,
  surfaceColor: Node<'vec4'>,
  light: Light2DResult,
  ambient?: Light2DResult,
  options: LitSpriteOptions = {}
): Node<'vec4'> {
  const {
    specular = false,
    shininess = 32,
    specularStrength = 0.5,
    rim = false,
    rimColor = [1, 1, 1],
    rimPower = 2,
    rimStrength = 1,
    viewDir = [0, 0, 1],
  } = options

  const viewVec = Array.isArray(viewDir) ? vec3(...viewDir) : viewDir

  // Start with diffuse lighting
  let result: Node<'vec4'> = litDiffuse(normal, light.direction, surfaceColor, light.color, light.attenuation)

  // Add ambient if provided
  if (ambient) {
    const ambientContrib = surfaceColor.rgb.mul(ambient.color)
    result = vec4(result.rgb.add(ambientContrib), surfaceColor.a)
  }

  // Add specular if enabled
  if (specular) {
    const spec = litSpecular(
      normal,
      light.direction,
      viewVec,
      light.color,
      light.attenuation,
      shininess,
      specularStrength
    )
    result = vec4(result.rgb.add(spec), surfaceColor.a)
  }

  // Add rim if enabled
  if (rim) {
    const rimLight = litRim(normal, viewVec, rimColor, rimPower, rimStrength)
    result = vec4(result.rgb.add(rimLight), surfaceColor.a)
  }

  return result
}
