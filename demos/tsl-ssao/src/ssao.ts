/**
 * Screen-Space Ambient Occlusion — N8AO algorithm ported to TSL.
 *
 * Pure TSL implementation: no GLSL strings, no ShaderMaterial, no onBeforeCompile.
 * All shader logic is built via three/tsl node functions.
 */
import {
  vec2,
  vec3,
  vec4,
  float,
  texture as sampleTexture,
  Fn,
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
  screenSize,
  screenUV,
  cameraProjectionMatrix,
} from 'three/tsl'
import type { Texture } from 'three'
import type Node from 'three/src/nodes/core/Node.js'

// ---------------------------------------------------------------------------
// Hemisphere sample generation (golden angle stratification)
// This runs at BUILD TIME in JavaScript, NOT on the GPU.
// ---------------------------------------------------------------------------

export function generateHemisphereSamples(
  n: number
): [number, number, number][] {
  const points: [number, number, number][] = []
  for (let k = 0; k < n; k++) {
    const theta = 2.399963 * k
    const r = Math.sqrt(k + 0.5) / Math.sqrt(n)
    const x = r * Math.cos(theta)
    const y = r * Math.sin(theta)
    const z = Math.sqrt(1 - (x * x + y * y))
    points.push([x, y, z])
  }
  return points
}

// ---------------------------------------------------------------------------
// Depth utilities
// ---------------------------------------------------------------------------

/** Linearize a perspective depth buffer value. */
export function linearizeDepth(
  d: Node<'float'>,
  zNear: Node<'float'>,
  zFar: Node<'float'>
): Node<'float'> {
  return zFar.mul(zNear).div(zFar.sub(d.mul(zFar.sub(zNear))))
}

/** Reconstruct view-space position from depth and UV. */
export function reconstructViewPos(
  depth: Node<'float'>,
  uv: Node<'vec2'>,
  invProjMat: Node<'mat4'>
): Node<'vec3'> {
  const clipX = uv.x.mul(2).sub(1)
  const clipY = uv.y.mul(2).sub(1)
  const clipZ = depth.mul(2).sub(1)
  const clipPos = vec4(clipX, clipY, clipZ, 1.0)
  const viewPos = invProjMat.mul(clipPos)
  return viewPos.xyz.div(viewPos.w)
}

// ---------------------------------------------------------------------------
// Normal computation from depth (finite differences, adaptive edge detection)
// ---------------------------------------------------------------------------

export function normalFromDepth(
  depthTex: Texture,
  uv: Node<'vec2'>,
  texelSize: Node<'vec2'>,
  invProjMat: Node<'mat4'>
): Node<'vec3'> {
  const center = sampleTexture(depthTex, uv).r
  const posC = reconstructViewPos(center, uv, invProjMat)

  const depthL = sampleTexture(depthTex, uv.sub(vec2(texelSize.x, 0))).r
  const depthR = sampleTexture(depthTex, uv.add(vec2(texelSize.x, 0))).r
  const depthB = sampleTexture(depthTex, uv.sub(vec2(0, texelSize.y))).r
  const depthT = sampleTexture(depthTex, uv.add(vec2(0, texelSize.y))).r

  const posL = reconstructViewPos(depthL, uv.sub(vec2(texelSize.x, 0)), invProjMat)
  const posR = reconstructViewPos(depthR, uv.add(vec2(texelSize.x, 0)), invProjMat)
  const posB = reconstructViewPos(depthB, uv.sub(vec2(0, texelSize.y)), invProjMat)
  const posT = reconstructViewPos(depthT, uv.add(vec2(0, texelSize.y)), invProjMat)

  const dl = abs(depthL.sub(center))
  const dr = abs(depthR.sub(center))
  const db = abs(depthB.sub(center))
  const dt = abs(depthT.sub(center))

  const dpdx = select(dl.lessThan(dr), posC.sub(posL), posR.sub(posC))
  const dpdy = select(db.lessThan(dt), posC.sub(posB), posT.sub(posC))

  return normalize(cross(dpdx, dpdy))
}

// ---------------------------------------------------------------------------
// Core SSAO
// ---------------------------------------------------------------------------

export interface SSAOOptions {
  radius?: number | Node<'float'>
  intensity?: number | Node<'float'>
  distanceFalloff?: number | Node<'float'>
  bias?: number | Node<'float'>
  near?: number | Node<'float'>
  far?: number | Node<'float'>
}

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
    radius: radiusInput = 0.5,
    intensity: intensityInput = 1.5,
    distanceFalloff: falloffInput = 1.0,
    bias: biasInput = 0.01,
    near: nearInput = 0.1,
    far: farInput = 100,
  } = options

  const radiusNode = typeof radiusInput === 'number' ? float(radiusInput) : radiusInput
  const intensityNode = typeof intensityInput === 'number' ? float(intensityInput) : intensityInput
  const falloffNode = typeof falloffInput === 'number' ? float(falloffInput) : falloffInput
  const biasNode = typeof biasInput === 'number' ? float(biasInput) : biasInput
  const nearNode = typeof nearInput === 'number' ? float(nearInput) : nearInput
  const farNode = typeof farInput === 'number' ? float(farInput) : farInput

  const numSamples = samples.length

  const centerDepth = sampleTexture(depthTex, uv).r
  const viewPos = reconstructViewPos(centerDepth, uv, invProjMat)
  const normal = normalFromDepth(depthTex, uv, texelSize, invProjMat)

  // Blue noise rotation
  const noiseScaleVec = vec2(float(1).div(texelSize.x), float(1).div(texelSize.y)).div(4.0)
  const noise = sampleTexture(noiseTex, uv.mul(noiseScaleVec))
  const noiseAngle = noise.r.mul(Math.PI * 2)

  const cosA = cos(noiseAngle)
  const sinA = sin(noiseAngle)

  // TBN construction
  const helperVec = select(
    abs(normal.z).greaterThan(0.99),
    vec3(1, 0, 0),
    vec3(0, 0, 1)
  )
  const tangent = normalize(cross(helperVec, normal))
  const bitangent = cross(normal, tangent)

  const rotTangent = tangent.mul(cosA).add(bitangent.mul(sinA))
  const rotBitangent = tangent.mul(sinA.negate()).add(bitangent.mul(cosA))

  const centerLinearDepth = linearizeDepth(centerDepth, nearNode, farNode)
  const falloffRadius = radiusNode.mul(falloffNode)

  // Build-time loop: JS for-loop unrolls into the shader node graph
  let occluded: Node<'float'> = float(0)

  for (let i = 0; i < numSamples; i++) {
    const [sx, sy, sz] = samples[i]!

    const sampleDir = rotTangent.mul(sx)
      .add(rotBitangent.mul(sy))
      .add(normal.mul(sz))

    const samplePos = viewPos.add(sampleDir.mul(radiusNode))

    // Re-project to screen UV using the projection matrix
    const projected = cameraProjectionMatrix.mul(vec4(samplePos, 1.0))
    const sampleUV = vec2(
      projected.x.div(projected.w).mul(0.5).add(0.5),
      projected.y.div(projected.w).mul(0.5).add(0.5)
    )

    const sampleDepthRaw = sampleTexture(depthTex, sampleUV).r
    const sampleLinearDepth = linearizeDepth(sampleDepthRaw, nearNode, farNode)

    const depthDiff = abs(centerLinearDepth.sub(sampleLinearDepth))
    const rangeCheck = smoothstep(float(0), float(1), falloffRadius.div(max(depthDiff, float(0.0001))))

    const isOccluded = smoothstep(
      float(0),
      biasNode,
      centerLinearDepth.sub(sampleLinearDepth)
    )

    occluded = occluded.add(isOccluded.mul(rangeCheck))
  }

  const ao = float(1).sub(occluded.div(float(numSamples)).mul(intensityNode))
  return clamp(ao, float(0), float(1))
}

// ---------------------------------------------------------------------------
// Edge-aware bilateral blur
// ---------------------------------------------------------------------------

export function ssaoBlur(
  aoTex: Texture,
  depthTex: Texture,
  uv: Node<'vec2'>,
  texelSize: Node<'vec2'>,
  direction: [number, number] = [1, 0],
  sharpness: number = 16
): Node<'float'> {
  const dirVec = vec2(direction[0], direction[1])
  const sharpnessNode = float(sharpness)

  const centerAO = sampleTexture(aoTex, uv).r
  const centerDepth = sampleTexture(depthTex, uv).r

  const weights = [1.0, 0.9, 0.75, 0.5, 0.25] as const

  let totalAO: Node<'float'> = centerAO.mul(weights[0])
  let totalWeight: Node<'float'> = float(weights[0])

  for (let i = 1; i < weights.length; i++) {
    const w = weights[i]!
    const offset = dirVec.mul(texelSize).mul(float(i))

    for (const sign of [1, -1]) {
      const sampleUV = sign === 1 ? uv.add(offset) : uv.sub(offset)
      const sampleAO = sampleTexture(aoTex, sampleUV).r
      const sampleDepth = sampleTexture(depthTex, sampleUV).r

      const depthDiff = abs(centerDepth.sub(sampleDepth))
      const edgeWeight = depthDiff.mul(sharpnessNode).negate().exp().mul(w)

      totalAO = totalAO.add(sampleAO.mul(edgeWeight))
      totalWeight = totalWeight.add(edgeWeight)
    }
  }

  return totalAO.div(totalWeight)
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function ssaoComposite(
  sceneColor: Node<'vec4'>,
  ao: Node<'float'>,
  intensity: number = 1,
  occlusionColor: [number, number, number] = [0, 0, 0]
): Node<'vec4'> {
  const intensityNode = float(intensity)
  const occColor = vec3(...occlusionColor)

  const aoStrength = mix(float(1), ao, intensityNode)
  const result = mix(occColor, sceneColor.rgb, aoStrength)

  return vec4(result, sceneColor.a)
}
