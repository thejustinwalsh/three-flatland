import { vec4, float, floor, sin, mod } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Apply CRT scanline effect.
 * Darkens alternating horizontal lines to simulate CRT display.
 *
 * @param inputColor - Input color (vec4)
 * @param uv - UV coordinates
 * @param resolution - Vertical resolution (number of scanlines, default: 240)
 * @param intensity - Scanline darkness (0-1, default: 0.3)
 * @param offset - Line offset for interlacing simulation (default: 0)
 * @returns Color with scanline effect
 *
 * @example
 * const crt = scanlines(inputColor, uv, 240, 0.3)
 */
export function scanlines(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 240,
  intensity: FloatInput = 0.3,
  offset: FloatInput = 0
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const offsetNode = typeof offset === 'number' ? float(offset) : offset

  // Calculate scanline position
  const line = floor(uv.y.mul(resNode).add(offsetNode))

  // Alternate lines
  const isOddLine = mod(line, float(2)).lessThan(1)

  // Darken odd lines
  const darken = isOddLine.select(float(1).sub(intensityNode), float(1))

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}

/**
 * Smooth scanlines with sine wave pattern.
 * More authentic CRT look with gradual brightness variation.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolution - Vertical resolution
 * @param intensity - Effect intensity
 * @param phase - Phase offset (use for animation/interlacing)
 * @returns Color with smooth scanlines
 */
export function scanlinesSmooth(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 240,
  intensity: FloatInput = 0.2,
  phase: FloatInput = 0
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const phaseNode = typeof phase === 'number' ? float(phase) : phase

  // Sine wave scanline pattern
  const scanline = sin(uv.y.mul(resNode).mul(3.14159).add(phaseNode))
    .mul(0.5)
    .add(0.5)

  // Apply intensity
  const darken = float(1).sub(scanline.mul(intensityNode))

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}

/**
 * Scanlines with bloom/glow between lines.
 * Simulates phosphor glow bleeding between scanlines.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolution - Vertical resolution
 * @param lineIntensity - Scanline darkness
 * @param glowIntensity - Glow between lines
 * @returns Color with scanlines and glow
 */
export function scanlinesGlow(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 240,
  lineIntensity: FloatInput = 0.3,
  glowIntensity: FloatInput = 0.1
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const lineNode = typeof lineIntensity === 'number' ? float(lineIntensity) : lineIntensity
  const glowNode = typeof glowIntensity === 'number' ? float(glowIntensity) : glowIntensity

  // Position within scanline
  const linePos = uv.y.mul(resNode).fract()

  // Scanline shape (dark in middle of each line)
  const scanlineShape = linePos.sub(0.5).abs().mul(2) // 0 at edges, 1 at center

  // Darken center of each line
  const darken = float(1).sub(scanlineShape.mul(lineNode))

  // Add glow at edges
  const glow = float(1).sub(scanlineShape).pow(2).mul(glowNode)

  return vec4(inputColor.rgb.mul(darken).add(glow), inputColor.a)
}

/**
 * Interlaced scanlines for authentic interlaced display simulation.
 * Alternates which lines are visible each frame.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolution - Vertical resolution
 * @param field - Current field (0 or 1, alternate each frame)
 * @param intensity - Scanline intensity
 * @returns Color with interlaced scanlines
 */
export function scanlinesInterlaced(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 240,
  field: TSLNode | FloatInput = 0,
  intensity: FloatInput = 0.5
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const fieldNode = typeof field === 'number' ? float(field) : field
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Calculate line number
  const line = floor(uv.y.mul(resNode))

  // Active lines depend on field (even field = even lines, odd field = odd lines)
  const isActiveLine = mod(line.add(fieldNode), float(2)).lessThan(1)

  // Inactive lines are darker
  const darken = isActiveLine.select(float(1), float(1).sub(intensityNode))

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}

/**
 * Combined horizontal and vertical scanlines (shadow mask simulation).
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolutionX - Horizontal resolution
 * @param resolutionY - Vertical resolution
 * @param intensity - Effect intensity
 * @returns Color with grid pattern
 */
export function scanlinesGrid(
  inputColor: TSLNode,
  uv: TSLNode,
  resolutionX: FloatInput = 320,
  resolutionY: FloatInput = 240,
  intensity: FloatInput = 0.2
): TSLNode {
  const resXNode = typeof resolutionX === 'number' ? float(resolutionX) : resolutionX
  const resYNode = typeof resolutionY === 'number' ? float(resolutionY) : resolutionY
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Horizontal and vertical lines
  const lineH = sin(uv.y.mul(resYNode).mul(3.14159)).mul(0.5).add(0.5)
  const lineV = sin(uv.x.mul(resXNode).mul(3.14159)).mul(0.5).add(0.5)

  // Combine as grid
  const grid = lineH.mul(lineV)
  const darken = float(1).sub(grid.mul(intensityNode))

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}
