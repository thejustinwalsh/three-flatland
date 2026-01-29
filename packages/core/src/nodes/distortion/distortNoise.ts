import { vec2, vec3, float, floor, fract } from 'three/tsl'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Simple hash function for noise generation.
 * @internal
 */
function hash2D(p: TSLNode): TSLNode {
  const k = vec2(0.3183099, 0.3678794)
  const scaled = p.mul(k)
  const h = scaled.x.add(scaled.y)
  return fract(h.mul(k).mul(16).sin().mul(43758.5453))
}

/**
 * 2D value noise function.
 * @internal
 */
function valueNoise2D(p: TSLNode): TSLNode {
  const i = floor(p)
  const f = fract(p)

  // Smoothstep interpolation
  const u = f.mul(f).mul(float(3).sub(f.mul(2)))

  // Four corners
  const a = hash2D(i)
  const b = hash2D(i.add(vec2(1, 0)))
  const c = hash2D(i.add(vec2(0, 1)))
  const d = hash2D(i.add(vec2(1, 1)))

  // Bilinear interpolation
  const x1 = a.mix(b, u.x)
  const x2 = c.mix(d, u.x)
  return x1.mix(x2, u.y)
}

/**
 * Gradient function for Perlin noise.
 * @internal
 */
function grad2D(hash: TSLNode, p: TSLNode): TSLNode {
  const angle = hash.mul(6.28318)
  const gradient = vec2(angle.cos(), angle.sin())
  return gradient.dot(p)
}

/**
 * Simple Perlin-like noise.
 * @internal
 */
function perlinNoise2D(p: TSLNode): TSLNode {
  const i = floor(p)
  const f = fract(p)

  // Quintic smoothstep for smoother gradients
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10))

  // Hash for gradients
  const h00 = hash2D(i)
  const h10 = hash2D(i.add(vec2(1, 0)))
  const h01 = hash2D(i.add(vec2(0, 1)))
  const h11 = hash2D(i.add(vec2(1, 1)))

  // Gradients
  const g00 = grad2D(h00, f)
  const g10 = grad2D(h10, f.sub(vec2(1, 0)))
  const g01 = grad2D(h01, f.sub(vec2(0, 1)))
  const g11 = grad2D(h11, f.sub(vec2(1, 1)))

  // Interpolate
  const x1 = g00.mix(g10, u.x)
  const x2 = g01.mix(g11, u.x)
  return x1.mix(x2, u.y).mul(0.5).add(0.5) // Normalize to 0-1
}

/**
 * Apply noise-based distortion to UV coordinates.
 * Uses simple value noise for displacement.
 *
 * @param uv - Input UV coordinates
 * @param strength - Distortion strength in UV space
 * @param scale - Noise scale (higher = finer detail)
 * @param time - Animation time for moving noise
 * @param speed - Animation speed
 * @returns Noise-distorted UV coordinates
 *
 * @example
 * const distorted = distortNoise(uv, 0.03, 5, time)
 */
export function distortNoise(
  uv: TSLNode,
  strength: FloatInput = 0.02,
  scale: FloatInput = 10,
  time: TSLNode | FloatInput = 0,
  speed: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const scaleNode = typeof scale === 'number' ? float(scale) : scale
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  const noiseCoord = uv.mul(scaleNode).add(timeNode.mul(speedNode))

  // Sample noise for X and Y offsets (use different offsets for variation)
  const noiseX = valueNoise2D(noiseCoord).sub(0.5).mul(2)
  const noiseY = valueNoise2D(noiseCoord.add(vec2(100, 100))).sub(0.5).mul(2)

  return uv.add(vec2(noiseX, noiseY).mul(strengthNode))
}

/**
 * Apply Perlin noise distortion for smoother, more organic displacement.
 *
 * @param uv - Input UV coordinates
 * @param strength - Distortion strength
 * @param scale - Noise scale
 * @param time - Animation time
 * @param octaves - Number of noise octaves for detail (default: 1)
 * @returns Perlin-distorted UV coordinates
 *
 * @example
 * const distorted = distortPerlin(uv, 0.02, 8, time, 2)
 */
export function distortPerlin(
  uv: TSLNode,
  strength: FloatInput = 0.02,
  scale: FloatInput = 5,
  time: TSLNode | FloatInput = 0,
  octaves: number = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const scaleNode = typeof scale === 'number' ? float(scale) : scale
  const timeNode = typeof time === 'number' ? float(time) : time

  const noiseCoord = uv.mul(scaleNode).add(timeNode)

  // Accumulate octaves
  let noiseX: TSLNode = float(0)
  let noiseY: TSLNode = float(0)
  let amplitude: TSLNode = float(1)
  let frequency: TSLNode = float(1)
  let totalAmplitude: TSLNode = float(0)

  for (let i = 0; i < octaves; i++) {
    const coord = noiseCoord.mul(frequency)
    noiseX = noiseX.add(perlinNoise2D(coord).sub(0.5).mul(amplitude))
    noiseY = noiseY.add(perlinNoise2D(coord.add(vec2(50, 50))).sub(0.5).mul(amplitude))
    totalAmplitude = totalAmplitude.add(amplitude)
    amplitude = amplitude.mul(0.5)
    frequency = frequency.mul(2)
  }

  // Normalize by total amplitude
  noiseX = noiseX.div(totalAmplitude).mul(2)
  noiseY = noiseY.div(totalAmplitude).mul(2)

  return uv.add(vec2(noiseX, noiseY).mul(strengthNode))
}

/**
 * Simplex-like noise distortion (approximation).
 * Faster than Perlin with similar quality.
 *
 * @param uv - Input UV coordinates
 * @param strength - Distortion strength
 * @param scale - Noise scale
 * @param time - Animation time
 * @returns Simplex-distorted UV coordinates
 */
export function distortSimplex(
  uv: TSLNode,
  strength: FloatInput = 0.02,
  scale: FloatInput = 5,
  time: TSLNode | FloatInput = 0
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const scaleNode = typeof scale === 'number' ? float(scale) : scale
  const timeNode = typeof time === 'number' ? float(time) : time

  // Skew factors for 2D simplex
  const F2 = float(0.366025404) // (sqrt(3)-1)/2
  const G2 = float(0.211324865) // (3-sqrt(3))/6

  const noiseCoord = uv.mul(scaleNode).add(timeNode)

  // Skew input space
  const s = noiseCoord.x.add(noiseCoord.y).mul(F2)
  const i = floor(noiseCoord.x.add(s))
  const j = floor(noiseCoord.y.add(s))

  // Unskew
  const t = i.add(j).mul(G2)
  const X0 = i.sub(t)
  const Y0 = j.sub(t)
  const x0 = noiseCoord.x.sub(X0)
  const y0 = noiseCoord.y.sub(Y0)

  // Determine simplex corner
  const i1 = x0.greaterThan(y0).select(float(1), float(0))
  const j1 = x0.greaterThan(y0).select(float(0), float(1))

  // Offsets for corners
  const x1 = x0.sub(i1).add(G2)
  const y1 = y0.sub(j1).add(G2)
  const x2 = x0.sub(1).add(G2.mul(2))
  const y2 = y0.sub(1).add(G2.mul(2))

  // Noise contributions
  const n0 = hash2D(vec2(i, j)).sub(0.5).mul(2)
  const n1 = hash2D(vec2(i.add(i1), j.add(j1))).sub(0.5).mul(2)
  const n2 = hash2D(vec2(i.add(1), j.add(1))).sub(0.5).mul(2)

  // Falloff
  const t0 = float(0.5).sub(x0.mul(x0)).sub(y0.mul(y0)).clamp(0, 1)
  const t1 = float(0.5).sub(x1.mul(x1)).sub(y1.mul(y1)).clamp(0, 1)
  const t2 = float(0.5).sub(x2.mul(x2)).sub(y2.mul(y2)).clamp(0, 1)

  const noise = t0.pow(4).mul(n0).add(t1.pow(4).mul(n1)).add(t2.pow(4).mul(n2))

  // Second noise sample for Y offset
  const noiseY = hash2D(noiseCoord.add(vec2(73.156, 91.234))).sub(0.5).mul(2)

  return uv.add(vec2(noise, noiseY).mul(strengthNode))
}

/**
 * Turbulent noise distortion with multiple octaves.
 * Creates a more chaotic, organic distortion pattern.
 *
 * @param uv - Input UV coordinates
 * @param strength - Distortion strength
 * @param scale - Base noise scale
 * @param time - Animation time
 * @param octaves - Number of noise layers
 * @param lacunarity - Frequency multiplier per octave (default: 2)
 * @param persistence - Amplitude multiplier per octave (default: 0.5)
 * @returns Turbulence-distorted UV coordinates
 */
export function distortTurbulence(
  uv: TSLNode,
  strength: FloatInput = 0.03,
  scale: FloatInput = 4,
  time: TSLNode | FloatInput = 0,
  octaves: number = 4,
  lacunarity: FloatInput = 2,
  persistence: FloatInput = 0.5
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const scaleNode = typeof scale === 'number' ? float(scale) : scale
  const timeNode = typeof time === 'number' ? float(time) : time
  const lacunarityNode = typeof lacunarity === 'number' ? float(lacunarity) : lacunarity
  const persistenceNode = typeof persistence === 'number' ? float(persistence) : persistence

  let noiseX: TSLNode = float(0)
  let noiseY: TSLNode = float(0)
  let amplitude: TSLNode = float(1)
  let frequency: TSLNode = scaleNode
  let totalAmplitude: TSLNode = float(0)

  for (let i = 0; i < octaves; i++) {
    const coord = uv.mul(frequency).add(timeNode)
    // Use absolute value for turbulence
    noiseX = noiseX.add(valueNoise2D(coord).sub(0.5).abs().mul(amplitude))
    noiseY = noiseY.add(valueNoise2D(coord.add(vec2(37, 17))).sub(0.5).abs().mul(amplitude))
    totalAmplitude = totalAmplitude.add(amplitude)
    amplitude = amplitude.mul(persistenceNode)
    frequency = frequency.mul(lacunarityNode)
  }

  noiseX = noiseX.div(totalAmplitude).sub(0.25).mul(4)
  noiseY = noiseY.div(totalAmplitude).sub(0.25).mul(4)

  return uv.add(vec2(noiseX, noiseY).mul(strengthNode))
}
