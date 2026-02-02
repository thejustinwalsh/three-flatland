import { Vector2, Color, type Texture } from 'three'
import { uniformArray, uniform, vec2, vec3, vec4, float, int, Fn, Loop, texture as sampleTexture } from 'three/tsl'
import type { TSLNode } from '../nodes/types'
import type { Light2D } from './Light2D'

/**
 * Maximum number of lights supported.
 * Pre-allocated uniform arrays — unused slots have enabled=0.
 */
export const MAX_LIGHTS = 8

/**
 * Light type encoding for the shader.
 * Stored as float in the uniform array.
 */
const LIGHT_TYPE_POINT = 0
const LIGHT_TYPE_SPOT = 1
const LIGHT_TYPE_DIRECTIONAL = 2
const LIGHT_TYPE_AMBIENT = 3

/**
 * Fixed-slot lighting system using uniform arrays.
 *
 * Pre-allocates 8 light slots as uniform arrays. The shader compiles once
 * with a loop over all slots, and adding/removing lights just updates
 * the uniform values — no shader recompilation.
 *
 * @example
 * ```typescript
 * const lighting = new LightingSystem()
 *
 * // Create a colorTransform for lit materials (compile once)
 * const transform = lighting.createColorTransform()
 * const material = new Sprite2DMaterial({ map: tex, colorTransform: transform })
 *
 * // Each frame — just copy Light2D properties into the arrays
 * lighting.sync(flatland.lights)
 * ```
 */
export class LightingSystem {
  // Uniform array backing data
  private _positions: Vector2[]
  private _colors: Color[]
  private _intensities: number[]
  private _radii: number[]
  private _falloffs: number[]
  private _directions: Vector2[]
  private _angles: number[]
  private _penumbras: number[]
  private _types: number[]
  private _enabled: number[]

  // TSL uniform array nodes (created once, mutated per-frame)
  private _positionArray: TSLNode
  private _colorArray: TSLNode
  private _intensityArray: TSLNode
  private _radiusArray: TSLNode
  private _falloffArray: TSLNode
  private _directionArray: TSLNode
  private _angleArray: TSLNode
  private _penumbraArray: TSLNode
  private _typeArray: TSLNode
  private _enabledArray: TSLNode
  private _countNode: TSLNode
  private _bandsNode: TSLNode
  private _pixelSizeNode: TSLNode
  private _glowRadiusNode: TSLNode
  private _glowIntensityNode: TSLNode
  private _normalStrengthNode: TSLNode
  private _lightHeightNode: TSLNode
  private _rimPowerNode: TSLNode
  private _rimStrengthNode: TSLNode

  /** Compile-time flag: generate normals from sprite alpha for N·L diffuse. Set before adding sprites. */
  autoNormals: boolean = false

  /** Compile-time flag: add rim lighting on sprite edges. Requires autoNormals. Set before adding sprites. */
  rimEnabled: boolean = false

  constructor() {
    // Initialize backing arrays with defaults
    this._positions = Array.from({ length: MAX_LIGHTS }, () => new Vector2(0, 0))
    this._colors = Array.from({ length: MAX_LIGHTS }, () => new Color(0, 0, 0))
    this._intensities = Array.from({ length: MAX_LIGHTS }, () => 0)
    this._radii = Array.from({ length: MAX_LIGHTS }, () => 100)
    this._falloffs = Array.from({ length: MAX_LIGHTS }, () => 2)
    this._directions = Array.from({ length: MAX_LIGHTS }, () => new Vector2(0, -1))
    this._angles = Array.from({ length: MAX_LIGHTS }, () => Math.PI / 4)
    this._penumbras = Array.from({ length: MAX_LIGHTS }, () => 0)
    this._types = Array.from({ length: MAX_LIGHTS }, () => LIGHT_TYPE_POINT)
    this._enabled = Array.from({ length: MAX_LIGHTS }, () => 0)

    // Create TSL uniform arrays — these are the shader-visible bindings
    this._positionArray = uniformArray(this._positions, 'vec2')
    this._colorArray = uniformArray(this._colors, 'color')
    this._intensityArray = uniformArray(this._intensities)
    this._radiusArray = uniformArray(this._radii)
    this._falloffArray = uniformArray(this._falloffs)
    this._directionArray = uniformArray(this._directions, 'vec2')
    this._angleArray = uniformArray(this._angles)
    this._penumbraArray = uniformArray(this._penumbras)
    this._typeArray = uniformArray(this._types)
    this._enabledArray = uniformArray(this._enabled)
    this._countNode = uniform(0, 'int')
    this._bandsNode = uniform(0)
    this._pixelSizeNode = uniform(0)
    this._glowRadiusNode = uniform(0)
    this._glowIntensityNode = uniform(0)
    this._normalStrengthNode = uniform(1)
    this._lightHeightNode = uniform(1)
    this._rimPowerNode = uniform(2)
    this._rimStrengthNode = uniform(0.5)
  }

  /**
   * Number of quantization bands for pixel-perfect stepped lighting.
   * 0 = smooth (default), >0 = quantize light into N discrete levels.
   */
  get bands(): number {
    return this._bandsNode.value
  }

  set bands(value: number) {
    this._bandsNode.value = value
  }

  /**
   * Spatial pixel size for pixelated lighting in world units.
   * 0 = per-pixel smooth (default), >0 = snap light positions to a grid.
   * e.g. pixelSize=4 means each "light pixel" covers 4×4 world units.
   */
  get pixelSize(): number {
    return this._pixelSizeNode.value
  }

  set pixelSize(value: number) {
    this._pixelSizeNode.value = value
  }

  /**
   * Glow radius multiplier for point/spot lights.
   * 0 = no glow (default). e.g. 2.0 = glow extends 2× the light radius.
   * Adds a broad, dim secondary falloff on top of the sharp primary.
   */
  get glowRadius(): number {
    return this._glowRadiusNode.value
  }

  set glowRadius(value: number) {
    this._glowRadiusNode.value = value
  }

  /**
   * Glow brightness relative to the main light (0-1).
   * 0 = no glow (default). e.g. 0.15 = glow is 15% of main light intensity.
   */
  get glowIntensity(): number {
    return this._glowIntensityNode.value
  }

  set glowIntensity(value: number) {
    this._glowIntensityNode.value = value
  }

  /**
   * Gradient multiplier for auto-generated normal strength.
   * Higher values = stronger edge normals, more pronounced lighting.
   * Runtime uniform — tunable per-frame.
   */
  get normalStrength(): number {
    return this._normalStrengthNode.value
  }

  set normalStrength(value: number) {
    this._normalStrengthNode.value = value
  }

  /**
   * Virtual Z height of lights for 3D-like diffuse shading.
   * 0 = lights at same plane (strong side lighting),
   * 1 = 45 degrees (balanced), higher = more overhead.
   * Runtime uniform — tunable per-frame.
   */
  get lightHeight(): number {
    return this._lightHeightNode.value
  }

  set lightHeight(value: number) {
    this._lightHeightNode.value = value
  }

  /**
   * Rim lighting falloff exponent.
   * Higher values = thinner, sharper rim. Lower = broader rim glow.
   * Runtime uniform — tunable per-frame.
   */
  get rimPower(): number {
    return this._rimPowerNode.value
  }

  set rimPower(value: number) {
    this._rimPowerNode.value = value
  }

  /**
   * Rim lighting intensity multiplier.
   * 0 = no rim, 0.5 = moderate, 1.0 = strong edge highlight.
   * Runtime uniform — tunable per-frame.
   */
  get rimStrength(): number {
    return this._rimStrengthNode.value
  }

  set rimStrength(value: number) {
    this._rimStrengthNode.value = value
  }

  /**
   * Sync Light2D array into uniform arrays.
   * Call once per frame. Copies current Light2D properties into the
   * pre-allocated uniform slots. No shader recompilation.
   */
  sync(lights: readonly Light2D[]): void {
    const count = Math.min(lights.length, MAX_LIGHTS)
    this._countNode.value = count

    for (let i = 0; i < count; i++) {
      const light = lights[i]!

      this._positions[i]!.set(light.position.x, light.position.y)
      this._colors[i]!.copy(light.color)
      this._intensities[i] = light.intensity
      this._radii[i] = light.radius
      this._falloffs[i] = light.falloff
      this._directions[i]!.copy(light.direction)
      this._angles[i] = light.angle
      this._penumbras[i] = light.penumbra
      this._enabled[i] = light.enabled ? 1 : 0

      switch (light.lightType) {
        case 'point':
          this._types[i] = LIGHT_TYPE_POINT
          break
        case 'spot':
          this._types[i] = LIGHT_TYPE_SPOT
          break
        case 'directional':
          this._types[i] = LIGHT_TYPE_DIRECTIONAL
          break
        case 'ambient':
          this._types[i] = LIGHT_TYPE_AMBIENT
          break
      }
    }

    // Zero out unused slots
    for (let i = count; i < MAX_LIGHTS; i++) {
      this._enabled[i] = 0
      this._intensities[i] = 0
    }

    // Mark uniform arrays as needing upload
    this._positionArray.array = this._positions
    this._colorArray.array = this._colors
    this._intensityArray.array = this._intensities
    this._radiusArray.array = this._radii
    this._falloffArray.array = this._falloffs
    this._directionArray.array = this._directions
    this._angleArray.array = this._angles
    this._penumbraArray.array = this._penumbras
    this._typeArray.array = this._types
    this._enabledArray.array = this._enabled
  }

  /**
   * Create a ColorTransformFn that applies lighting from the uniform arrays.
   * The returned function captures the uniform nodes (not the light list),
   * so the shader compiles once and handles 0-8 lights dynamically.
   *
   * @param options - Optional overrides for auto-normals and rim lighting
   * @returns ColorTransformFn for use with Sprite2DMaterial
   */
  createColorTransform(options?: {
    texture?: Texture
    autoNormals?: boolean
    rimEnabled?: boolean
  }): (ctx: { color: TSLNode; atlasUV: TSLNode; worldPosition: TSLNode }) => TSLNode {
    const positions = this._positionArray
    const colors = this._colorArray
    const intensities = this._intensityArray
    const radii = this._radiusArray
    const falloffs = this._falloffArray
    const directions = this._directionArray
    const angles = this._angleArray
    const penumbras = this._penumbraArray
    const types = this._typeArray
    const enabled = this._enabledArray
    const count = this._countNode
    const bands = this._bandsNode
    const pixelSize = this._pixelSizeNode
    const glowRadius = this._glowRadiusNode
    const glowIntensity = this._glowIntensityNode

    const useAutoNormals = (options?.autoNormals ?? this.autoNormals) && options?.texture
    const useRim = (options?.rimEnabled ?? this.rimEnabled) && useAutoNormals
    const normalStrength = this._normalStrengthNode
    const lightHeight = this._lightHeightNode
    const rimPower = this._rimPowerNode
    const rimStrength = this._rimStrengthNode

    // Pre-compute texel size as float constants from texture dimensions
    let texelW: number | undefined
    let texelH: number | undefined
    const tex = options?.texture
    if (useAutoNormals && tex?.image) {
      const img = tex.image as { width: number; height: number }
      texelW = 1.0 / img.width
      texelH = 1.0 / img.height
    }

    return (ctx) => {
      // Compute lighting in a TSL Fn so we can use Loop + toVar
      const lit = Fn(() => {
        const rawPos = ctx.worldPosition
        // Snap surface position to pixel grid for pixelated lighting
        const usePixelSnap = pixelSize.greaterThan(float(0))
        const snappedPos = vec2(rawPos).div(pixelSize).floor().mul(pixelSize)
        const surfacePos = usePixelSnap.select(snappedPos, vec2(rawPos))
        const totalLight = vec3(0, 0, 0).toVar('totalLight')

        // Auto-generate surface normal from sprite alpha gradient
        let normal: TSLNode | undefined
        if (useAutoNormals && tex && texelW !== undefined && texelH !== undefined) {
          const tw = float(texelW)
          const th = float(texelH)
          const uvCoord = ctx.atlasUV

          const alphaL = sampleTexture(tex, uvCoord.sub(vec2(tw, 0))).a
          const alphaR = sampleTexture(tex, uvCoord.add(vec2(tw, 0))).a
          const alphaD = sampleTexture(tex, uvCoord.sub(vec2(0, th))).a
          const alphaU = sampleTexture(tex, uvCoord.add(vec2(0, th))).a

          const dx = alphaR.sub(alphaL).mul(normalStrength)
          const dy = alphaU.sub(alphaD).mul(normalStrength)

          normal = vec3(dx.negate(), dy.negate(), float(1)).normalize().toVar('surfaceNormal')
        }

        Loop({ start: int(0), end: count, type: 'int', condition: '<' }, ({ i }: { i: TSLNode }) => {
          const lightEnabled = enabled.element(i)
          const lightColor = colors.element(i)
          const lightIntensity = intensities.element(i)
          const lightType = types.element(i)
          const lightPos = positions.element(i)
          const lightRadius = radii.element(i)
          const lightFalloff = falloffs.element(i)
          const lightDir = directions.element(i)
          const lightAngle = angles.element(i)
          const lightPenumbra = penumbras.element(i)

          // Base contribution = color * intensity * enabled
          const contribution = lightColor.mul(lightIntensity).mul(lightEnabled)

          // Point light attenuation: sharp center
          const toLight = lightPos.sub(vec2(surfacePos))
          const dist = toLight.length()
          const normalizedDist = dist.div(lightRadius).clamp(0, 1)
          const sharpAtten = float(1).sub(normalizedDist.pow(lightFalloff)).clamp(0, 1)

          // Broad glow: linear falloff over extended radius
          const useGlow = glowRadius.greaterThan(float(0))
          const glowDist = dist.div(lightRadius.mul(glowRadius)).clamp(0, 1)
          const broadAtten = float(1).sub(glowDist).clamp(0, 1)
          const pointAtten = useGlow.select(
            sharpAtten.add(broadAtten.mul(glowIntensity)).clamp(0, 1),
            sharpAtten
          )

          // Spot light cone attenuation
          const toSurfaceNorm = vec2(surfacePos).sub(lightPos).normalize()
          const spotCos = toSurfaceNorm.dot(lightDir.normalize())
          const innerCos = lightAngle.cos()
          const outerCos = lightAngle.add(lightPenumbra).cos()
          const coneAtten = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)

          // Select attenuation by type:
          // point (0) = pointAtten
          // spot (1) = pointAtten * coneAtten
          // directional (2) = 1.0
          // ambient (3) = 1.0
          const isPoint = lightType.lessThan(float(0.5)) // type == 0
          const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5))) // type == 1

          const atten = isPoint.select(
            pointAtten,
            isSpot.select(
              pointAtten.mul(coneAtten),
              float(1) // directional or ambient
            )
          )

          // Apply N·L diffuse for non-ambient lights when auto-normals enabled
          let finalContribution: TSLNode
          if (normal) {
            // Point (type < 0.5) and Spot (type < 1.5) get N·L shading
            const isPositional = lightType.lessThan(float(1.5))
            // Normalize 2D direction first so N·L depends on angle, not distance.
            // Distance falloff is already handled by attenuation — without this,
            // N·L crushes light to near-zero at any meaningful range.
            const toLightDir = toLight.div(dist.max(float(0.001)))
            const lightDir3D = vec3(toLightDir, lightHeight).normalize()
            const NdotL = normal.dot(lightDir3D).max(float(0))
            // Apply NdotL only to point/spot lights; ambient/directional pass through
            finalContribution = contribution.mul(atten).mul(
              isPositional.select(NdotL, float(1))
            )
          } else {
            finalContribution = contribution.mul(atten)
          }

          totalLight.addAssign(finalContribution)
        })

        // Rim lighting: fresnel-like edge highlight
        if (useRim && normal) {
          const viewDir = vec3(0, 0, 1)
          const NdotV = normal.dot(viewDir).max(float(0))
          const rimFactor = float(1).sub(NdotV).pow(rimPower).mul(rimStrength)
          totalLight.addAssign(vec3(rimFactor, rimFactor, rimFactor))
        }

        // Quantize to discrete bands for pixel-perfect stepped lighting
        // When bands > 0: round(value * bands) / bands
        // Using round instead of floor so dim ambient light isn't crushed to zero
        // When bands == 0: smooth (no quantization)
        const useBands = bands.greaterThan(float(0))
        const raw = vec3(totalLight)
        const quantized = raw.mul(bands).round().div(bands)
        return useBands.select(quantized, raw)
      })()

      // Apply lighting to sprite color
      return Fn(() => {
        const litColor = ctx.color.rgb.mul(lit)
        return vec4(litColor, ctx.color.a)
      })()
    }
  }
}
