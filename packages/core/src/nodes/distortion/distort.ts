import { vec2, float, atan2, cos, sin, floor } from 'three/tsl'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Pinch distortion - pulls pixels toward center.
 *
 * @param uv - Input UV coordinates
 * @param center - Pinch center point (default: [0.5, 0.5])
 * @param strength - Pinch strength (positive = pinch in, negative = expand)
 * @param radius - Effect radius in UV space
 * @returns Distorted UV coordinates
 *
 * @example
 * const pinched = distortPinch(uv, [0.5, 0.5], 0.5, 0.5)
 */
export function distortPinch(
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  strength: FloatInput = 0.5,
  radius: FloatInput = 0.5
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()
  const normalizedDist = dist.div(radiusNode).clamp(0, 1)

  // Pinch factor decreases with distance from center
  const pinchFactor = float(1).sub(normalizedDist).pow(2).mul(strengthNode)
  const scale = float(1).sub(pinchFactor)

  return centerVec.add(toCenter.mul(scale))
}

/**
 * Bulge distortion - pushes pixels away from center.
 *
 * @param uv - Input UV coordinates
 * @param center - Bulge center point
 * @param strength - Bulge strength (positive = bulge out)
 * @param radius - Effect radius in UV space
 * @returns Distorted UV coordinates
 *
 * @example
 * const bulged = distortBulge(uv, [0.5, 0.5], 0.3, 0.4)
 */
export function distortBulge(
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  strength: FloatInput = 0.3,
  radius: FloatInput = 0.5
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()
  const normalizedDist = dist.div(radiusNode).clamp(0, 1)

  // Bulge pushes outward, strongest at center
  const bulgeFactor = float(1).sub(normalizedDist).pow(2).mul(strengthNode)
  const scale = float(1).add(bulgeFactor)

  return centerVec.add(toCenter.mul(scale))
}

/**
 * Twirl/swirl distortion - rotates pixels around center.
 *
 * @param uv - Input UV coordinates
 * @param center - Twirl center point
 * @param angle - Maximum rotation angle in radians at center
 * @param radius - Effect radius (distortion fades to zero at edge)
 * @returns Distorted UV coordinates
 *
 * @example
 * const twirled = distortTwirl(uv, [0.5, 0.5], Math.PI, 0.4)
 */
export function distortTwirl(
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  angle: FloatInput = Math.PI * 0.5,
  radius: FloatInput = 0.5
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const angleNode = typeof angle === 'number' ? float(angle) : angle
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()
  const normalizedDist = dist.div(radiusNode).clamp(0, 1)

  // Rotation decreases with distance from center
  const rotation = float(1).sub(normalizedDist).pow(2).mul(angleNode)

  // Apply rotation
  const cosR = cos(rotation)
  const sinR = sin(rotation)
  const rotated = vec2(
    toCenter.x.mul(cosR).sub(toCenter.y.mul(sinR)),
    toCenter.x.mul(sinR).add(toCenter.y.mul(cosR))
  )

  return centerVec.add(rotated)
}

/**
 * Barrel distortion - simulates lens distortion.
 * Commonly used for CRT screen curvature simulation.
 *
 * @param uv - Input UV coordinates (should be 0-1)
 * @param strength - Distortion strength (positive = barrel, negative = pincushion)
 * @param zoom - Zoom adjustment to compensate for distortion (default: 1)
 * @returns Distorted UV coordinates
 *
 * @example
 * // CRT-like barrel distortion
 * const curved = distortBarrel(uv, 0.2)
 */
export function distortBarrel(
  uv: TSLNode,
  strength: FloatInput = 0.1,
  zoom: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const zoomNode = typeof zoom === 'number' ? float(zoom) : zoom

  // Center UV at origin
  const centered = uv.sub(0.5).mul(2)

  // Distance from center squared
  const r2 = centered.dot(centered)

  // Barrel distortion formula: r' = r * (1 + k * r^2)
  const distortion = float(1).add(r2.mul(strengthNode))

  const distorted = centered.mul(distortion).mul(zoomNode)

  return distorted.div(2).add(0.5)
}

/**
 * Pixelate distortion - snaps UV to grid for chunky pixel effect.
 * Use for transitions or stylized rendering.
 *
 * @param uv - Input UV coordinates
 * @param pixelSize - Size of each "pixel" in UV space (default: 0.05)
 * @returns Pixelated UV coordinates
 *
 * @example
 * const pixelated = distortPixelate(uv, 0.02)
 * const color = texture(tex, pixelated)
 */
export function distortPixelate(uv: TSLNode, pixelSize: FloatInput = 0.05): TSLNode {
  const sizeNode = typeof pixelSize === 'number' ? float(pixelSize) : pixelSize

  // Snap to grid
  const snapped = floor(uv.div(sizeNode)).mul(sizeNode).add(sizeNode.mul(0.5))

  return snapped
}

/**
 * Pixelate with pixel count (more intuitive API).
 *
 * @param uv - Input UV coordinates
 * @param pixelCount - Number of pixels across (default: 64)
 * @returns Pixelated UV coordinates
 */
export function distortPixelateCount(uv: TSLNode, pixelCount: FloatInput = 64): TSLNode {
  const countNode = typeof pixelCount === 'number' ? float(pixelCount) : pixelCount
  const pixelSize = float(1).div(countNode)

  return floor(uv.mul(countNode)).div(countNode).add(pixelSize.mul(0.5))
}

/**
 * Shatter/fragment distortion - breaks image into polygonal pieces.
 * Creates a crystalline/broken glass effect.
 *
 * @param uv - Input UV coordinates
 * @param fragments - Number of fragment divisions (default: 10)
 * @param offset - Maximum offset for each fragment (default: 0.02)
 * @param seed - Random seed for fragment pattern
 * @returns Shattered UV coordinates
 */
export function distortShatter(
  uv: TSLNode,
  fragments: FloatInput = 10,
  offset: FloatInput = 0.02,
  seed: FloatInput = 0
): TSLNode {
  const fragNode = typeof fragments === 'number' ? float(fragments) : fragments
  const offsetNode = typeof offset === 'number' ? float(offset) : offset
  const seedNode = typeof seed === 'number' ? float(seed) : seed

  // Create cell coordinates
  const cell = floor(uv.mul(fragNode))

  // Simple hash for pseudo-random offset per cell
  const hash = cell.x.mul(127.1).add(cell.y.mul(311.7)).add(seedNode)
  const rand = hash.sin().mul(43758.5453).fract()
  const rand2 = hash.add(1).sin().mul(43758.5453).fract()

  // Apply offset based on cell's random value
  const cellOffset = vec2(rand.sub(0.5), rand2.sub(0.5)).mul(offsetNode)

  return uv.add(cellOffset)
}

/**
 * Displacement map distortion - use a texture to distort UVs.
 *
 * @param uv - Input UV coordinates
 * @param displacement - Displacement values (vec2 or from texture.rg)
 * @param strength - Displacement strength
 * @returns Displaced UV coordinates
 */
export function distortDisplace(
  uv: TSLNode,
  displacement: TSLNode,
  strength: FloatInput = 0.1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Displacement should be in -1 to 1 range (or 0-1 converted)
  const offset = displacement.xy.sub(0.5).mul(2).mul(strengthNode)

  return uv.add(offset)
}

/**
 * Spherize distortion - wraps UV onto a sphere surface.
 *
 * @param uv - Input UV coordinates
 * @param center - Effect center
 * @param strength - Spherize strength (0-1)
 * @param radius - Effect radius
 * @returns Spherized UV coordinates
 */
export function distortSpherize(
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  strength: FloatInput = 1,
  radius: FloatInput = 0.5
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()
  const normalizedDist = dist.div(radiusNode).clamp(0, 1)

  // Spherical projection
  const z = float(1).sub(normalizedDist.mul(normalizedDist)).sqrt()
  const sphereFactor = z.mul(strengthNode).add(float(1).sub(strengthNode))

  return centerVec.add(toCenter.div(sphereFactor))
}
