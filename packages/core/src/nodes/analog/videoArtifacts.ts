import { vec2, vec3, vec4, float, floor, fract, sin, cos, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input, Vec3Input } from '../types'

/**
 * Color bleeding/smearing effect.
 * Simulates horizontal color bleeding in composite video signals.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param amount - Bleed amount (default: 0.003)
 * @param samples - Number of samples (default: 4)
 * @returns Color with bleeding effect
 */
export function colorBleeding(
  tex: Texture,
  uv: TSLNode,
  amount: FloatInput = 0.003,
  samples: number = 4
): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount

  let colorSum = sampleTexture(tex, uv).rgb

  for (let i = 1; i <= samples; i++) {
    const offset = vec2(amountNode.mul(float(i)), 0)
    colorSum = colorSum.add(sampleTexture(tex, uv.sub(offset)).rgb.mul(float(1 / (i + 1))))
  }

  // Normalize
  let totalWeight: TSLNode = float(1)
  for (let i = 1; i <= samples; i++) {
    totalWeight = totalWeight.add(float(1 / (i + 1)))
  }

  return vec4(colorSum.div(totalWeight), sampleTexture(tex, uv).a)
}

/**
 * Interlacing effect.
 * Simulates interlaced video display with field alternation.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolution - Vertical resolution
 * @param field - Current field (0 or 1, alternate each frame)
 * @param blendFactor - How much to blend inactive lines (default: 0.5)
 * @returns Color with interlacing
 */
export function interlacing(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 480,
  field: TSLNode | FloatInput = 0,
  blendFactor: FloatInput = 0.5
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const fieldNode = typeof field === 'number' ? float(field) : field
  const blendNode = typeof blendFactor === 'number' ? float(blendFactor) : blendFactor

  const line = floor(uv.y.mul(resNode))
  const isActiveLine = line.add(fieldNode).mod(2).lessThan(1)

  const darken = isActiveLine.select(float(1), blendNode)

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}

/**
 * NTSC composite video artifact simulation.
 * Simplified version of composite video encoding artifacts.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param artifactIntensity - Artifact visibility (default: 0.3)
 * @param bleedAmount - Color bleed amount (default: 0.002)
 * @returns Color with NTSC artifacts
 */
export function ntscComposite(
  tex: Texture,
  uv: TSLNode,
  artifactIntensity: FloatInput = 0.3,
  bleedAmount: FloatInput = 0.002
): TSLNode {
  const artifactNode = typeof artifactIntensity === 'number' ? float(artifactIntensity) : artifactIntensity
  const bleedNode = typeof bleedAmount === 'number' ? float(bleedAmount) : bleedAmount

  // Base color with horizontal color bleeding
  const r = sampleTexture(tex, uv.sub(vec2(bleedNode, 0))).r
  const g = sampleTexture(tex, uv).g
  const b = sampleTexture(tex, uv.add(vec2(bleedNode, 0))).b
  const a = sampleTexture(tex, uv).a

  // NTSC artifact pattern (dot crawl approximation)
  const scanline = floor(uv.y.mul(240))
  const phase = scanline.mul(0.5).add(uv.x.mul(240))
  const artifact = sin(phase.mul(6.28)).mul(artifactNode).mul(0.5)

  // Apply artifact to chroma (affects color more than luma)
  const artifactedColor = vec3(r.add(artifact.mul(0.5)), g, b.sub(artifact.mul(0.5)))

  return vec4(artifactedColor, a)
}

/**
 * VHS tape distortion effect.
 * Simulates tracking errors and tape degradation.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param intensity - Distortion intensity (default: 0.02)
 * @param noiseAmount - Noise visibility (default: 0.1)
 * @returns Color with VHS distortion
 */
export function vhsDistortion(
  tex: Texture,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  intensity: FloatInput = 0.02,
  noiseAmount: FloatInput = 0.1
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const noiseNode = typeof noiseAmount === 'number' ? float(noiseAmount) : noiseAmount

  // Horizontal offset that varies by scanline and time
  const scanline = floor(uv.y.mul(240))
  const waveOffset = sin(scanline.mul(0.5).add(timeNode.mul(3)))
    .add(sin(scanline.mul(0.1).add(timeNode)))
    .mul(intensityNode)

  // Occasional tracking glitch (stronger distortion)
  const glitchLine = sin(timeNode.mul(2).add(scanline.mul(0.02))).greaterThan(0.98)
  const glitchOffset = glitchLine.select(intensityNode.mul(5), float(0))

  const distortedUV = vec2(uv.x.add(waveOffset).add(glitchOffset), uv.y)

  // Sample with color separation
  const r = sampleTexture(tex, distortedUV.add(vec2(0.002, 0))).r
  const g = sampleTexture(tex, distortedUV).g
  const b = sampleTexture(tex, distortedUV.sub(vec2(0.002, 0))).b

  // Add noise
  const noise = sin(uv.y.mul(1000).add(timeNode.mul(100))).mul(noiseNode)

  return vec4(r.add(noise), g.add(noise), b.add(noise), float(1))
}

/**
 * TV static noise effect.
 *
 * @param inputColor - Input color (can mix with static)
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param intensity - Static intensity (0 = no static, 1 = full static)
 * @returns Color with static noise
 */
export function staticNoise(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  intensity: FloatInput = 0.5
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Generate noise
  const seed = uv.x.mul(12.9898).add(uv.y.mul(78.233)).add(timeNode.mul(43.5453))
  const noise = fract(sin(seed).mul(43758.5453))

  // Mix input with noise
  const staticColor = vec3(noise, noise, noise)
  const mixed = inputColor.rgb.mix(staticColor, intensityNode)

  return vec4(mixed, inputColor.a)
}

/**
 * Analog glitch effect with continuous distortion.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param intensity - Glitch intensity (default: 0.03)
 * @param speed - Animation speed (default: 1)
 * @returns Color with analog glitch
 */
export function analogGlitch(
  tex: Texture,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  intensity: FloatInput = 0.03,
  speed: FloatInput = 1
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  // Wave distortion
  const wave1 = sin(uv.y.mul(10).add(timeNode.mul(speedNode))).mul(intensityNode)
  const wave2 = sin(uv.y.mul(30).add(timeNode.mul(speedNode.mul(1.5)))).mul(intensityNode.mul(0.3))

  const distortedX = uv.x.add(wave1).add(wave2)

  // Color channel separation
  const r = sampleTexture(tex, vec2(distortedX.add(intensityNode.mul(0.5)), uv.y)).r
  const g = sampleTexture(tex, vec2(distortedX, uv.y)).g
  const b = sampleTexture(tex, vec2(distortedX.sub(intensityNode.mul(0.5)), uv.y)).b

  return vec4(r, g, b, float(1))
}

/**
 * Signal interference bars.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param barHeight - Height of interference bars (default: 0.1)
 * @param intensity - Interference intensity
 * @param speed - Bar movement speed
 * @returns Color with interference
 */
export function signalInterference(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  barHeight: FloatInput = 0.1,
  intensity: FloatInput = 0.3,
  speed: FloatInput = 1
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const barNode = typeof barHeight === 'number' ? float(barHeight) : barHeight
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  // Moving interference bars
  const barPos = uv.y.add(timeNode.mul(speedNode)).mod(1)
  const inBar = barPos.lessThan(barNode)

  const darken = inBar.select(float(1).sub(intensityNode), float(1))

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}
