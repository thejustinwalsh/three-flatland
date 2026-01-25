import { vec4, float, min, smoothstep } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Fade alpha towards the edges of UV space using smoothstep.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param edgeWidth - Width of the fade region (0-0.5, default: 0.1)
 * @returns Color with edge-faded alpha
 *
 * @example
 * // Fade edges with default width
 * fadeEdge(texture(tex, uv()), uv())
 *
 * @example
 * // Wide fade edge
 * fadeEdge(texture(tex, uv()), uv(), 0.3)
 */
export function fadeEdge(
  inputColor: TSLNode,
  inputUV: TSLNode,
  edgeWidth: FloatInput = 0.1
): TSLNode {
  const widthNode = typeof edgeWidth === 'number' ? float(edgeWidth) : edgeWidth

  // Calculate fade from each edge
  // Left edge: smoothstep(0, edgeWidth, u)
  // Right edge: smoothstep(0, edgeWidth, 1-u)
  // Same for top/bottom

  const fadeLeft = smoothstep(float(0), widthNode, inputUV.x)
  const fadeRight = smoothstep(float(0), widthNode, float(1).sub(inputUV.x))
  const fadeBottom = smoothstep(float(0), widthNode, inputUV.y)
  const fadeTop = smoothstep(float(0), widthNode, float(1).sub(inputUV.y))

  // Combine all edges (minimum of all fades)
  const edgeFade = min(min(fadeLeft, fadeRight), min(fadeBottom, fadeTop))

  return vec4(inputColor.rgb, inputColor.a.mul(edgeFade))
}

/**
 * Fade alpha in a circular pattern from center.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param innerRadius - Radius where fade starts (0-1)
 * @param outerRadius - Radius where fully transparent (0-1)
 * @returns Color with radial-faded alpha
 *
 * @example
 * // Circular fade from 0.3 to 0.5 radius
 * fadeEdgeRadial(texture(tex, uv()), uv(), 0.3, 0.5)
 */
export function fadeEdgeRadial(
  inputColor: TSLNode,
  inputUV: TSLNode,
  innerRadius: FloatInput = 0.3,
  outerRadius: FloatInput = 0.5
): TSLNode {
  const innerNode = typeof innerRadius === 'number' ? float(innerRadius) : innerRadius
  const outerNode = typeof outerRadius === 'number' ? float(outerRadius) : outerRadius

  // Calculate distance from center (0.5, 0.5)
  const centered = inputUV.sub(float(0.5))
  const dist = centered.length()

  // Smoothstep fade between inner and outer radius (inverted - 1 at center, 0 at edge)
  const radialFade = float(1).sub(smoothstep(innerNode, outerNode, dist))

  return vec4(inputColor.rgb, inputColor.a.mul(radialFade))
}

/**
 * Fade alpha only on horizontal edges.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param edgeWidth - Width of the fade region
 * @returns Color with horizontally faded alpha
 */
export function fadeEdgeHorizontal(
  inputColor: TSLNode,
  inputUV: TSLNode,
  edgeWidth: FloatInput = 0.1
): TSLNode {
  const widthNode = typeof edgeWidth === 'number' ? float(edgeWidth) : edgeWidth

  const fadeLeft = smoothstep(float(0), widthNode, inputUV.x)
  const fadeRight = smoothstep(float(0), widthNode, float(1).sub(inputUV.x))
  const edgeFade = min(fadeLeft, fadeRight)

  return vec4(inputColor.rgb, inputColor.a.mul(edgeFade))
}

/**
 * Fade alpha only on vertical edges.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param edgeWidth - Width of the fade region
 * @returns Color with vertically faded alpha
 */
export function fadeEdgeVertical(
  inputColor: TSLNode,
  inputUV: TSLNode,
  edgeWidth: FloatInput = 0.1
): TSLNode {
  const widthNode = typeof edgeWidth === 'number' ? float(edgeWidth) : edgeWidth

  const fadeBottom = smoothstep(float(0), widthNode, inputUV.y)
  const fadeTop = smoothstep(float(0), widthNode, float(1).sub(inputUV.y))
  const edgeFade = min(fadeBottom, fadeTop)

  return vec4(inputColor.rgb, inputColor.a.mul(edgeFade))
}
