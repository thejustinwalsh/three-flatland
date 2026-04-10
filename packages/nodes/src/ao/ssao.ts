import {
  vec2,
  vec3,
  vec4,
  float,
  texture as sampleTexture,
  sin,
  cos,
  normalize,
  cross,
  abs,
  max,
  clamp,
  smoothstep,
  mix,
  select,
} from 'three/tsl'
import type { Texture } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { FloatInput } from '../types'

// --- Hemisphere sample generation (golden angle stratification) ---

/**
 * Pre-compute hemisphere sample directions using golden angle distribution.
 * These are baked at build time (JS), not run time (GPU).
 *
 * @param n - Number of samples (8-64 recommended)
 * @returns Array of [x, y, z] hemisphere directions
 */
export function generateHemisphereSamples(
  n: number
): [number, number, number][] {
  const points: [number, number, number][] = []
  for (let k = 0; k < n; k++) {
    const theta = 2.399963 * k // golden angle
    const r = Math.sqrt(k + 0.5) / Math.sqrt(n)
    const x = r * Math.cos(theta)
    const y = r * Math.sin(theta)
    const z = Math.sqrt(1 - (x * x + y * y))
    points.push([x, y, z])
  }
  return points
}

// --- Depth utilities ---

/**
 * Linearize a perspective depth buffer value.
 *
 * @param d - Raw depth (0-1)
 * @param zNear - Camera near plane
 * @param zFar - Camera far plane
 * @returns Linear depth in world units
 */
export function linearizeDepth(
  d: Node<'float'>,
  zNear: Node<'float'>,
  zFar: Node<'float'>
): Node<'float'> {
  // perspective: (far * near) / (far - d * (far - near))
  return zFar.mul(zNear).div(zFar.sub(d.mul(zFar.sub(zNear))))
}

/**
 * Reconstruct view-space position from depth and UV coordinates.
 *
 * @param depth - Raw depth value (0-1)
 * @param uv - Screen UV coordinates (0-1)
 * @param invProjMat - Inverse projection matrix as 4 vec4 column nodes
 * @returns View-space position (vec3)
 */
export function reconstructViewPos(
  depth: Node<'float'>,
  uv: Node<'vec2'>,
  invProjMat: Node<'mat4'>
): Node<'vec3'> {
  // NDC: UV 0-1 → clip -1 to 1, depth 0-1 → clip -1 to 1
  const clipX = uv.x.mul(2).sub(1)
  const clipY = uv.y.mul(2).sub(1)
  const clipZ = depth.mul(2).sub(1)
  const clipPos = vec4(clipX, clipY, clipZ, 1.0)

  // Multiply by inverse projection
  const viewPos = invProjMat.mul(clipPos)

  // Perspective divide
  return viewPos.xyz.div(viewPos.w)
}

// --- Normal computation from depth ---

/**
 * Compute view-space normals from depth using finite differences.
 * Uses adaptive edge detection to pick the less discontinuous direction.
 *
 * @param depthTex - Depth texture
 * @param uv - Screen UV
 * @param texelSize - Size of one pixel in UV space (vec2)
 * @param invProjMat - Inverse projection matrix
 * @returns Normalized view-space normal (vec3)
 */
export function normalFromDepth(
  depthTex: Texture,
  uv: Node<'vec2'>,
  texelSize: Node<'vec2'>,
  invProjMat: Node<'mat4'>
): Node<'vec3'> {
  const center = sampleTexture(depthTex, uv).r
  const posC = reconstructViewPos(center, uv, invProjMat)

  // Sample ±1 pixel in each axis
  const depthL = sampleTexture(depthTex, uv.sub(vec2(texelSize.x, 0))).r
  const depthR = sampleTexture(depthTex, uv.add(vec2(texelSize.x, 0))).r
  const depthB = sampleTexture(depthTex, uv.sub(vec2(0, texelSize.y))).r
  const depthT = sampleTexture(depthTex, uv.add(vec2(0, texelSize.y))).r

  const posL = reconstructViewPos(depthL, uv.sub(vec2(texelSize.x, 0)), invProjMat)
  const posR = reconstructViewPos(depthR, uv.add(vec2(texelSize.x, 0)), invProjMat)
  const posB = reconstructViewPos(depthB, uv.sub(vec2(0, texelSize.y)), invProjMat)
  const posT = reconstructViewPos(depthT, uv.add(vec2(0, texelSize.y)), invProjMat)

  // Adaptive: pick whichever neighbor has less depth discontinuity
  const dl = abs(depthL.sub(center))
  const dr = abs(depthR.sub(center))
  const db = abs(depthB.sub(center))
  const dt = abs(depthT.sub(center))

  // dpdx: pick left or right based on smaller discontinuity
  const dpdx = select(dl.lessThan(dr), posC.sub(posL), posR.sub(posC))
  // dpdy: pick bottom or top
  const dpdy = select(db.lessThan(dt), posC.sub(posB), posT.sub(posC))

  return normalize(cross(dpdx, dpdy))
}

// --- Core SSAO computation ---

/** Options for the SSAO computation. */
export interface SSAOOptions {
  /** AO radius in UV-space (default: 0.02) */
  radius?: FloatInput
  /** AO intensity multiplier (default: 1.5) */
  intensity?: FloatInput
  /** Distance falloff factor — controls range check softness (default: 1.0) */
  distanceFalloff?: FloatInput
  /** Depth bias to prevent self-occlusion (default: 0.001) */
  bias?: FloatInput
  /** Camera near plane (default: 0.1) */
  near?: FloatInput
  /** Camera far plane (default: 1000) */
  far?: FloatInput
}

/**
 * Screen-Space Ambient Occlusion based on the N8AO algorithm.
 *
 * Implements hemisphere sampling with golden-angle stratification,
 * depth-based range checking, and blue noise rotation for temporal stability.
 *
 * This function computes the AO term only. Combine with your scene color:
 * ```ts
 * const ao = ssao(depthTex, noiseTex, uv, texelSize, invProjMat, samples)
 * const final = vec4(sceneColor.rgb.mul(ao), sceneColor.a)
 * ```
 *
 * @param depthTex - Depth texture from the scene render
 * @param noiseTex - Blue noise or random rotation texture (4x4 or larger)
 * @param uv - Screen UV coordinates
 * @param texelSize - Size of one pixel in UV space (1/width, 1/height)
 * @param invProjMat - Inverse projection matrix (mat4 node)
 * @param samples - Pre-computed hemisphere directions from generateHemisphereSamples()
 * @param options - AO parameters (radius, intensity, falloff, bias, near, far)
 * @returns AO factor (float, 1 = no occlusion, 0 = fully occluded)
 */
export function ssao(
  depthTex: Texture,
  noiseTex: Texture,
  uv: Node<'vec2'>,
  texelSize: Node<'vec2'>,
  invProjMat: Node<'mat4'>,
  samples: [number, number, number][],
  options: SSAOOptions = {}
): Node<'float'> {
  const {
    radius: radiusInput = 0.02,
    intensity: intensityInput = 1.5,
    distanceFalloff: falloffInput = 1.0,
    bias: biasInput = 0.001,
    near: nearInput = 0.1,
    far: farInput = 1000,
  } = options

  const radiusNode =
    typeof radiusInput === 'number' ? float(radiusInput) : radiusInput
  const intensityNode =
    typeof intensityInput === 'number' ? float(intensityInput) : intensityInput
  const falloffNode =
    typeof falloffInput === 'number' ? float(falloffInput) : falloffInput
  const biasNode =
    typeof biasInput === 'number' ? float(biasInput) : biasInput
  const nearNode =
    typeof nearInput === 'number' ? float(nearInput) : nearInput
  const farNode =
    typeof farInput === 'number' ? float(farInput) : farInput

  const numSamples = samples.length

  // Read center depth and reconstruct view-space position
  const centerDepth = sampleTexture(depthTex, uv).r
  const viewPos = reconstructViewPos(centerDepth, uv, invProjMat)

  // Compute normal from depth
  const normal = normalFromDepth(depthTex, uv, texelSize, invProjMat)

  // Blue noise rotation — sample noise texture tiled across screen
  // Scale UVs so noise repeats every 4 pixels (matches typical 4x4 noise texture)
  const screenSize = vec2(float(1).div(texelSize.x), float(1).div(texelSize.y))
  const noiseScale = screenSize.div(4.0)
  const noise = sampleTexture(noiseTex, uv.mul(noiseScale))
  const noiseAngle = noise.r.mul(Math.PI * 2)

  // Construct TBN with noise rotation
  const cosA = cos(noiseAngle)
  const sinA = sin(noiseAngle)

  // Build tangent from a helper vector — avoid parallel with normal
  const helperVec = select(
    abs(normal.z).greaterThan(0.99),
    vec3(1, 0, 0),
    vec3(0, 0, 1)
  )
  const tangent = normalize(cross(helperVec, normal))
  const bitangent = cross(normal, tangent)

  // Rotate tangent/bitangent by noise angle
  const rotTangent = tangent.mul(cosA).add(bitangent.mul(sinA))
  const rotBitangent = tangent.mul(sinA.negate()).add(bitangent.mul(cosA))

  // Linear depth for range checking
  const centerLinearDepth = linearizeDepth(centerDepth, nearNode, farNode)
  const falloffRadius = radiusNode.mul(falloffNode)

  // Accumulate occlusion — build-time loop (JS) over pre-computed samples
  let occluded: Node<'float'> = float(0)

  for (let i = 0; i < numSamples; i++) {
    const [sx, sy, sz] = samples[i]!

    // Transform hemisphere sample to view-space via rotated TBN
    const sampleDir = rotTangent
      .mul(sx)
      .add(rotBitangent.mul(sy))
      .add(normal.mul(sz))

    // Offset from center position
    const samplePos = viewPos.add(sampleDir.mul(radiusNode))

    // Project sample back to screen UV
    // Simplified: for a symmetric projection, uv ≈ (pos.xy / -pos.z) * focal + 0.5
    // Using the texelSize-based approximation for the focal length
    const sampleUV = vec2(
      samplePos.x.div(samplePos.z.negate()).mul(float(0.5)).add(0.5),
      samplePos.y.div(samplePos.z.negate()).mul(float(0.5)).add(0.5)
    )

    // Sample depth at projected position
    const sampleDepthRaw = sampleTexture(depthTex, sampleUV).r
    const sampleLinearDepth = linearizeDepth(sampleDepthRaw, nearNode, farNode)

    // Range check: smooth falloff based on depth distance
    const depthDiff = abs(centerLinearDepth.sub(sampleLinearDepth))
    const rangeCheck = smoothstep(float(0), float(1), falloffRadius.div(max(depthDiff, float(0.0001))))

    // Occlusion: is the sample behind the surface? (with bias)
    // Using step() for branchless comparison — best performance per TSL skill
    const isOccluded = smoothstep(
      float(0),
      biasNode,
      centerLinearDepth.sub(sampleLinearDepth)
    )

    occluded = occluded.add(isOccluded.mul(rangeCheck))
  }

  // Normalize and invert: 1 = no occlusion, 0 = fully occluded
  const ao = float(1).sub(occluded.div(float(numSamples)).mul(intensityNode))
  return clamp(ao, float(0), float(1))
}

// --- Blur pass for AO denoising ---

/**
 * Edge-aware bilateral blur for denoising AO.
 * Preserves edges by weighting samples based on depth similarity.
 *
 * @param aoTex - AO texture to blur (red channel)
 * @param depthTex - Scene depth texture for edge detection
 * @param uv - Screen UV coordinates
 * @param texelSize - Pixel size in UV space
 * @param direction - Blur direction ([1,0] horizontal, [0,1] vertical)
 * @param radius - Blur kernel radius in pixels (default: 4)
 * @param sharpness - Edge preservation strength (default: 16)
 * @returns Blurred AO value (float)
 */
export function ssaoBlur(
  aoTex: Texture,
  depthTex: Texture,
  uv: Node<'vec2'>,
  texelSize: Node<'vec2'>,
  direction: [number, number] = [1, 0],
  radius: FloatInput = 4,
  sharpness: FloatInput = 16
): Node<'float'> {
  const dirVec = vec2(direction[0], direction[1])
  const sharpnessNode =
    typeof sharpness === 'number' ? float(sharpness) : sharpness

  const centerAO = sampleTexture(aoTex, uv).r
  const centerDepth = sampleTexture(depthTex, uv).r

  const radiusInt = typeof radius === 'number' ? radius : 4
  const weights = [1.0, 0.9, 0.75, 0.5, 0.25] as const // approximate Gaussian

  let totalAO: Node<'float'> = centerAO.mul(weights[0])
  let totalWeight: Node<'float'> = float(weights[0])

  for (let i = 1; i <= Math.min(radiusInt as number, weights.length - 1); i++) {
    const w = weights[i]!
    const offset = dirVec.mul(texelSize).mul(float(i))

    for (const sign of [1, -1]) {
      const sampleUV = sign === 1 ? uv.add(offset) : uv.sub(offset)
      const sampleAO = sampleTexture(aoTex, sampleUV).r
      const sampleDepth = sampleTexture(depthTex, sampleUV).r

      // Edge-aware weight: exponential falloff based on depth difference
      const depthDiff = abs(centerDepth.sub(sampleDepth))
      const edgeWeight = depthDiff.mul(sharpnessNode).negate().exp().mul(w)

      totalAO = totalAO.add(sampleAO.mul(edgeWeight))
      totalWeight = totalWeight.add(edgeWeight)
    }
  }

  return totalAO.div(totalWeight)
}

// --- Composition ---

/**
 * Apply AO to a scene color.
 * Multiplies scene color by the AO factor, with optional tint for occluded areas.
 *
 * @param sceneColor - Original scene color (vec4)
 * @param ao - AO factor (float, 1 = no occlusion)
 * @param intensity - Effect intensity (default: 1)
 * @param occlusionColor - Color of occluded areas (default: black)
 * @returns Scene color with AO applied
 */
export function ssaoComposite(
  sceneColor: Node<'vec4'>,
  ao: Node<'float'>,
  intensity: FloatInput = 1,
  occlusionColor: [number, number, number] = [0, 0, 0]
): Node<'vec4'> {
  const intensityNode =
    typeof intensity === 'number' ? float(intensity) : intensity
  const occColor = vec3(...occlusionColor)

  // Mix between occlusion color and scene based on AO factor
  const aoStrength = mix(float(1), ao, intensityNode)
  const result = mix(occColor, sceneColor.rgb, aoStrength)

  return vec4(result, sceneColor.a)
}
