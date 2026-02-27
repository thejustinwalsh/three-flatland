import {
  Vector2,
  DataTexture,
  FloatType,
  RGBAFormat,
  NearestFilter,
  type Texture,
} from 'three'
import {
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  int,
  ivec2,
  Fn,
  Loop,
  If,
  texture as sampleTexture,
  textureLoad,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type { Light2D } from './Light2D'

/**
 * Function that reads a light index from a tile buffer/texture.
 * Abstracts over WebGPU storage buffers and WebGL2 DataTextures.
 *
 * @param tileIndex - TSL node for the flat tile index
 * @param slotIndex - TSL node for the slot within the tile (0..MAX_LIGHTS_PER_TILE-1)
 * @returns TSL int node containing the 1-based light index (0 = empty)
 */
export type TileLookupFn = (tileIndex: Node<'int'>, slotIndex: Node<'int'>) => Node<'int'>

/**
 * Light type encoding for the shader.
 * Stored as float in the DataTexture.
 */
const LIGHT_TYPE_POINT = 0
const LIGHT_TYPE_SPOT = 1
const LIGHT_TYPE_DIRECTIONAL = 2
const LIGHT_TYPE_AMBIENT = 3

/**
 * DataTexture light storage system.
 *
 * Stores per-light data in a DataTexture (width=maxLights, height=4 rows,
 * RGBAFormat, FloatType). Removes the MAX_LIGHTS hard cap — supports up
 * to `maxLights` (default 256, configurable).
 *
 * DataTexture layout:
 * | Row | R      | G         | B      | A        |
 * |-----|--------|-----------|--------|----------|
 * | 0   | posX   | posY      | colorR | colorG   |
 * | 1   | colorB | intensity | distance | decay  |
 * | 2   | dirX   | dirY      | angle  | penumbra |
 * | 3   | type   | enabled   | 0      | 0        |
 *
 * The shader reads via `textureLoad(lightsTexture, ivec2(lightIndex, row))`.
 *
 * @example
 * ```typescript
 * const lighting = new LightingSystem({ maxLights: 64 })
 *
 * // Create a colorTransform for lit materials (compile once)
 * const transform = lighting.createColorTransform()
 * const material = new Sprite2DMaterial({ map: tex, colorTransform: transform })
 *
 * // Each frame — just copy Light2D properties into the DataTexture
 * lighting.sync(flatland.lights)
 * ```
 */
export class LightingSystem {
  /** Maximum number of lights this system can handle */
  readonly maxLights: number

  // DataTexture light storage
  private _lightsData: Float32Array
  private _lightsTexture: DataTexture
  private _lightsTextureNode: Node<'vec4'>

  // Scalar uniforms (non-per-light)
  private _countNode: UniformNode<'float', number>
  private _bandsNode: UniformNode<'float', number>
  private _pixelSizeNode: UniformNode<'float', number>
  private _glowRadiusNode: UniformNode<'float', number>
  private _glowIntensityNode: UniformNode<'float', number>
  private _normalStrengthNode: UniformNode<'float', number>
  private _lightHeightNode: UniformNode<'float', number>
  private _rimPowerNode: UniformNode<'float', number>
  private _rimStrengthNode: UniformNode<'float', number>

  // Shadow uniforms
  private _occlusionTexture: Texture
  private _occlusionSizeNode: UniformNode<'vec2', Vector2>
  private _occlusionOffsetNode: UniformNode<'vec2', Vector2>
  private _shadowStrengthNode: UniformNode<'float', number>
  private _shadowSoftnessNode: UniformNode<'float', number>
  private _shadowBiasNode: UniformNode<'float', number>

  // SDF texture from SDFGenerator (replaces raw occlusion sampling for shadows)
  private _sdfTexture: Texture | null = null

  // Radiance textures for indirect GI
  private _radianceTexture: Texture | null = null
  private _radianceFarTexture: Texture | null = null
  private _radianceIntensityNode: UniformNode<'float', number>

  /** Compile-time flag: generate normals from sprite alpha for N·L diffuse. Set before adding sprites. */
  autoNormals: boolean = false

  /** Compile-time flag: add rim lighting on sprite edges. Requires autoNormals. Set before adding sprites. */
  rimEnabled: boolean = false

  /** Compile-time flag: enable shadow casting via occlusion map. Set before adding sprites. */
  shadows: boolean = false

  constructor(options?: { maxLights?: number }) {
    this.maxLights = options?.maxLights ?? 256

    // DataTexture: width=maxLights, height=4 rows, RGBA float
    const dataSize = this.maxLights * 4 * 4 // 4 rows × 4 channels × maxLights
    this._lightsData = new Float32Array(dataSize)
    this._lightsTexture = new DataTexture(
      this._lightsData,
      this.maxLights,
      4,
      RGBAFormat,
      FloatType
    )
    this._lightsTexture.minFilter = NearestFilter
    this._lightsTexture.magFilter = NearestFilter
    this._lightsTexture.needsUpdate = true

    // Stable TSL node reference for the lights DataTexture
    this._lightsTextureNode = sampleTexture(this._lightsTexture)

    this._countNode = uniform(0)
    this._bandsNode = uniform(0)
    this._pixelSizeNode = uniform(0)
    this._glowRadiusNode = uniform(0)
    this._glowIntensityNode = uniform(0)
    this._normalStrengthNode = uniform(1)
    this._lightHeightNode = uniform(1)
    this._rimPowerNode = uniform(2)
    this._rimStrengthNode = uniform(0.5)

    // Shadow: placeholder 1×1 transparent texture (replaced by Flatland with RT texture)
    const placeholderData = new Uint8Array([0, 0, 0, 0])
    this._occlusionTexture = new DataTexture(placeholderData, 1, 1)
    this._occlusionTexture.needsUpdate = true
    this._occlusionSizeNode = uniform(new Vector2(1, 1))
    this._occlusionOffsetNode = uniform(new Vector2(0, 0))
    this._shadowStrengthNode = uniform(0.6)
    this._shadowSoftnessNode = uniform(8.0) // Quilez soft shadow k parameter (higher = harder)
    this._shadowBiasNode = uniform(0.04) // Ray start bias in UV space to skip past caster's own SDF

    // Radiance Cascades (primary GI when active)
    this._radianceIntensityNode = uniform(1.0)
  }

  /** Get the lights DataTexture (for use by TiledLightCuller compute shader) */
  get lightsTexture(): DataTexture {
    return this._lightsTexture
  }

  /** Get the TSL node for the lights DataTexture */
  get lightsTextureNode(): Node<'vec4'> {
    return this._lightsTextureNode
  }

  /** Get the current light count uniform node (for TiledLightCuller) */
  get countNode(): UniformNode<'float', number> {
    return this._countNode
  }

  /** Get the occlusion size uniform node (for TiledLightCuller SDF culling) */
  get occlusionSizeNode(): UniformNode<'vec2', Vector2> {
    return this._occlusionSizeNode
  }

  /** Get the occlusion offset uniform node (for TiledLightCuller SDF culling) */
  get occlusionOffsetNode(): UniformNode<'vec2', Vector2> {
    return this._occlusionOffsetNode
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
   * Shadow strength (0 = invisible, 1 = pitch black).
   * Runtime uniform — tunable per-frame.
   */
  get shadowStrength(): number {
    return this._shadowStrengthNode.value
  }

  set shadowStrength(value: number) {
    this._shadowStrengthNode.value = value
  }

  /**
   * Shadow softness control (Quilez k parameter).
   * Higher values = harder shadows, lower = softer penumbra.
   * Typical range: 2 (very soft) to 32 (hard).
   * Runtime uniform — tunable per-frame.
   */
  get shadowSoftness(): number {
    return this._shadowSoftnessNode.value
  }

  set shadowSoftness(value: number) {
    this._shadowSoftnessNode.value = value
  }

  /**
   * Shadow ray start bias in UV space.
   * Skips past the caster's own SDF region to avoid self-shadowing.
   * Typical range: 0.02 to 0.08. Default: 0.04.
   * Runtime uniform — tunable per-frame.
   */
  get shadowBias(): number {
    return this._shadowBiasNode.value
  }

  set shadowBias(value: number) {
    this._shadowBiasNode.value = value
  }

  /**
   * Radiance (indirect GI) intensity multiplier.
   * 0 = no indirect, 0.3 = moderate, 1.0 = strong.
   * Runtime uniform — tunable per-frame.
   */
  get radianceIntensity(): number {
    return this._radianceIntensityNode.value
  }

  set radianceIntensity(value: number) {
    this._radianceIntensityNode.value = value
  }

  /**
   * Set the SDF texture generated by SDFGenerator.
   * The SDF texture replaces raw occlusion sampling for sphere-traced shadows.
   *
   * @param texture - SDF texture (R=distance, G=vectorX, B=vectorY)
   */
  setSdfTexture(texture: Texture): void {
    this._sdfTexture = texture
  }

  /** Get the current SDF texture (for TiledLightCuller) */
  get sdfTexture(): Texture | null {
    return this._sdfTexture
  }

  /**
   * Set the near radiance texture for indirect GI (1/4 screen res).
   *
   * @param texture - Near radiance texture
   */
  setRadianceTexture(texture: Texture): void {
    this._radianceTexture = texture
  }

  /**
   * Set the far radiance texture for indirect GI (1/16 screen res, SDF-aware).
   *
   * @param texture - Far radiance texture (SDF-aware bilateral downsampled)
   */
  setRadianceFarTexture(texture: Texture): void {
    this._radianceFarTexture = texture
  }

  /**
   * Update the occlusion texture and world bounds covered by the map.
   * Called by Flatland when the shadow pipeline is initialized or resized.
   *
   * @param texture - The occlusion render target texture
   * @param worldSize - Camera frustum size in world units (width, height)
   * @param worldOffset - Camera frustum lower-left corner in world units (camera.left, camera.bottom)
   */
  setOcclusionTexture(texture: Texture, worldSize: Vector2, worldOffset: Vector2): void {
    this._occlusionTexture = texture
    this._occlusionSizeNode.value.copy(worldSize)
    this._occlusionOffsetNode.value.copy(worldOffset)
  }

  /**
   * Sync Light2D array into DataTexture.
   * Call once per frame. Copies current Light2D properties into the
   * DataTexture backing array. No shader recompilation.
   */
  sync(lights: readonly Light2D[]): void {
    const count = Math.min(lights.length, this.maxLights)
    this._countNode.value = count

    const data = this._lightsData
    const lineSize = this.maxLights * 4 // stride per row (4 channels × width)

    for (let i = 0; i < count; i++) {
      const light = lights[i]!
      const offset = i * 4

      // Row 0: posX, posY, colorR, colorG
      data[offset + 0] = light.position.x
      data[offset + 1] = light.position.y
      data[offset + 2] = light.color.r
      data[offset + 3] = light.color.g

      // Row 1: colorB, intensity, distance, decay
      data[lineSize + offset + 0] = light.color.b
      data[lineSize + offset + 1] = light.intensity
      data[lineSize + offset + 2] = light.distance
      data[lineSize + offset + 3] = light.decay

      // Row 2: dirX, dirY, angle, penumbra
      data[2 * lineSize + offset + 0] = light.direction.x
      data[2 * lineSize + offset + 1] = light.direction.y
      data[2 * lineSize + offset + 2] = light.angle
      data[2 * lineSize + offset + 3] = light.penumbra

      // Row 3: type, enabled, 0, 0
      let lightType = LIGHT_TYPE_POINT
      switch (light.lightType) {
        case 'point':
          lightType = LIGHT_TYPE_POINT
          break
        case 'spot':
          lightType = LIGHT_TYPE_SPOT
          break
        case 'directional':
          lightType = LIGHT_TYPE_DIRECTIONAL
          break
        case 'ambient':
          lightType = LIGHT_TYPE_AMBIENT
          break
      }
      data[3 * lineSize + offset + 0] = lightType
      data[3 * lineSize + offset + 1] = light.enabled ? 1 : 0
      data[3 * lineSize + offset + 2] = 0
      data[3 * lineSize + offset + 3] = 0
    }

    // Zero out unused slots (enabled=0)
    for (let i = count; i < this.maxLights; i++) {
      const offset = i * 4
      // Row 1: intensity = 0
      data[lineSize + offset + 1] = 0
      // Row 3: enabled = 0
      data[3 * lineSize + offset + 1] = 0
    }

    this._lightsTexture.needsUpdate = true
  }

  /**
   * Read light data from the DataTexture in TSL.
   * Returns row0..row3 vec4 values for a given light index.
   */
  private _readLightData(lightIndex: Node<'float'> | Node<'int'>): {
    row0: Node<'vec4'>
    row1: Node<'vec4'>
    row2: Node<'vec4'>
    row3: Node<'vec4'>
  } {
    const i = int(lightIndex)
    const row0 = textureLoad(this._lightsTexture, ivec2(i, int(0)))
    const row1 = textureLoad(this._lightsTexture, ivec2(i, int(1)))
    const row2 = textureLoad(this._lightsTexture, ivec2(i, int(2)))
    const row3 = textureLoad(this._lightsTexture, ivec2(i, int(3)))
    return { row0, row1, row2, row3 }
  }

  /**
   * Build the per-light shading logic (shared between tiled and non-tiled paths).
   * Given light data rows, computes attenuation, shadows, normals, and returns
   * the light contribution to add to totalLight.
   */
  private _buildLightContribution(
    row0: Node<'vec4'>,
    row1: Node<'vec4'>,
    row2: Node<'vec4'>,
    row3: Node<'vec4'>,
    surfacePos: Node<'vec2'>,
    normal: Node<'vec3'>,
    options: {
      useShadows: boolean
      useAutoNormals: boolean
      glowRadius: Node<'float'>,
      glowIntensity: Node<'float'>,
      lightHeight: Node<'float'>,
      occSize: Node<'vec2'>,
      occOffset: Node<'vec2'>,
      shadowStr: Node<'float'>,
      shadowSoftness: Node<'float'>,
      shadowBias: Node<'float'>,
      sdfTexGetter: () => Texture | null
    }
  ): Node<'vec3'> {
    // Unpack light data from DataTexture rows
    const lightPos = vec2(row0.r, row0.g)
    const lightColor = vec3(row0.b, row0.a, row1.r)
    const lightIntensity = row1.g
    const lightDistance = row1.b
    const lightDecay = row1.a
    const lightDir = vec2(row2.r, row2.g)
    const lightAngle = row2.b
    const lightPenumbra = row2.a
    const lightType = row3.r
    const lightEnabled = row3.g

    // Base contribution = color * intensity * enabled
    const contribution = lightColor.mul(lightIntensity).mul(lightEnabled)

    // Point light attenuation: sharp center
    // distance=0 means no cutoff — use a large effective distance to avoid div-by-zero
    const effectiveDistance = lightDistance.greaterThan(float(0)).select(lightDistance, float(1e6))
    const toLight = lightPos.sub(vec2(surfacePos))
    const dist = toLight.length()
    const normalizedDist = dist.div(effectiveDistance).clamp(0, 1)
    const sharpAtten = float(1).sub(normalizedDist.pow(lightDecay)).clamp(0, 1)

    // Broad glow: linear falloff over extended radius
    const useGlow = options.glowRadius.greaterThan(float(0))
    const glowDist = dist.div(effectiveDistance.mul(options.glowRadius)).clamp(0, 1)
    const broadAtten = float(1).sub(glowDist).clamp(0, 1)
    const pointAtten = useGlow.select(
      sharpAtten.add(broadAtten.mul(options.glowIntensity)).clamp(0, 1),
      sharpAtten
    )

    // Spot light cone attenuation
    const toSurfaceNorm = vec2(surfacePos).sub(lightPos).normalize()
    const spotCos = toSurfaceNorm.dot(lightDir.normalize())
    const innerCos = lightAngle.cos()
    const outerCos = lightAngle.add(lightPenumbra).cos()
    const coneAtten = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)

    // Select attenuation by type
    const isPoint = lightType.lessThan(float(0.5))
    const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5)))
    const atten = isPoint.select(pointAtten, isSpot.select(pointAtten.mul(coneAtten), float(1)))

    // Apply N·L diffuse for non-ambient lights when auto-normals enabled
    let finalContribution: Node<'vec3'>
    if (normal) {
      const isPositional = lightType.lessThan(float(1.5))
      const toLightDir = toLight.div(dist.max(float(0.001)))
      const lightDir3D = vec3(toLightDir, options.lightHeight).normalize()
      const NdotL = normal.dot(lightDir3D).max(float(0))
      finalContribution = contribution.mul(atten).mul(isPositional.select(NdotL, float(1)))
    } else {
      finalContribution = contribution.mul(atten)
    }

    // SDF sphere-traced shadows
    if (options.useShadows) {
      const sdfTex = options.sdfTexGetter()
      if (sdfTex) {
        const surfaceUV = vec2(surfacePos).sub(options.occOffset).div(options.occSize)
        const lightUV = lightPos.sub(options.occOffset).div(options.occSize)
        const rayDir = lightUV.sub(surfaceUV).normalize()
        const rayLength = lightUV.sub(surfaceUV).length()

        const shadow = float(1).toVar('shadow')
        const t = options.shadowBias.toVar('t')
        const stillMarching = float(1).toVar('stillMarching')

        for (let step = 0; step < 16; step++) {
          If(stillMarching.greaterThan(0.5), () => {
            const sampleUV = surfaceUV.add(rayDir.mul(t))
            const sdfSample = sampleTexture(sdfTex, sampleUV)
            const sdfDist = sdfSample.r

            const hitOccluder = sdfDist.lessThan(float(0.001))
            shadow.assign(hitOccluder.select(float(0), shadow))

            const quilez = options.shadowSoftness.mul(sdfDist).div(t)
            shadow.assign(hitOccluder.select(shadow, shadow.min(quilez)))

            t.addAssign(sdfDist.max(float(0.001)))

            // Stop marching if hit occluder or passed the light
            const pastLight = t.greaterThan(rayLength)
            stillMarching.assign(
              hitOccluder.select(float(0), pastLight.select(float(0), stillMarching))
            )
          })
        }

        shadow.assign(shadow.clamp(0, 1))
        const shadowFactor = float(1).sub(float(1).sub(shadow).mul(options.shadowStr))
        const isPositionalForShadow = lightType.lessThan(float(1.5))
        finalContribution = finalContribution.mul(
          isPositionalForShadow.select(shadowFactor, float(1))
        )
      }
    }

    return finalContribution
  }

  /**
   * Create a ColorTransformFn that applies lighting from the DataTexture.
   * The returned function captures the texture node (not the light list),
   * so the shader compiles once and handles 0-N lights dynamically.
   *
   * @param options - Optional overrides for auto-normals, rim lighting, shadows
   * @returns ColorTransformFn for use with Sprite2DMaterial
   */
  createColorTransform(options?: {
    texture?: Texture
    autoNormals?: boolean
    rimEnabled?: boolean
    shadows?: boolean
    radiance?: boolean
  }): (ctx: { color: Node<'vec4'>; atlasUV: Node<'vec2'>; worldPosition: Node<'vec2'> }) => Node<'vec4'> {
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

    const useShadows = options?.shadows ?? false
    const useRadiance = options?.radiance ?? false
    const occSize = this._occlusionSizeNode
    const occOffset = this._occlusionOffsetNode
    const shadowStr = this._shadowStrengthNode
    const shadowSoftness = this._shadowSoftnessNode
    const shadowBias = this._shadowBiasNode
    const sdfTexGetter = () => this._sdfTexture
    const radianceTexGetter = () => this._radianceTexture
    const _radianceFarTexGetter = () => this._radianceFarTexture
    const radianceIntensity = this._radianceIntensityNode

    let texelW: number | undefined
    let texelH: number | undefined
    const tex = options?.texture
    if (useAutoNormals && tex?.image) {
      const img = tex.image as { width: number; height: number }
      texelW = 1.0 / img.width
      texelH = 1.0 / img.height
    }

    return (ctx) => {
      const lit = Fn(() => {
        const rawPos = ctx.worldPosition
        const usePixelSnap = pixelSize.greaterThan(float(0))
        const snappedPos = vec2(rawPos).div(pixelSize).floor().mul(pixelSize)
        const surfacePos = usePixelSnap.select(snappedPos, vec2(rawPos))
        const totalLight = vec3(0, 0, 0).toVar('totalLight')

        // Auto-generate surface normal from sprite alpha gradient
        let normal: Node<'vec3'> = vec3(0, 0, 1)
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

        // Direct light loop: skip when RC is the primary illumination source
        if (!useRadiance) {
          Loop(
            { start: 0, end: count, type: 'float', condition: '<' },
            ({ i }: { i: Node<'float'> }) => {
              const { row0, row1, row2, row3 } = this._readLightData(i)

              const finalContribution = this._buildLightContribution(
                row0,
                row1,
                row2,
                row3,
                surfacePos,
                normal,
                {
                  useShadows,
                  useAutoNormals: !!useAutoNormals,
                  glowRadius,
                  glowIntensity,
                  lightHeight,
                  occSize,
                  occOffset,
                  shadowStr,
                  shadowSoftness,
                  shadowBias,
                  sdfTexGetter,
                }
              )

              totalLight.addAssign(finalContribution)
            }
          )
        }

        // Radiance Cascades (primary illumination): sample RC final irradiance texture
        if (useRadiance) {
          const radianceTex = radianceTexGetter()
          if (radianceTex) {
            const surfaceUV = vec2(surfacePos).sub(occOffset).div(occSize)
            const indirect = sampleTexture(radianceTex, surfaceUV)
            totalLight.addAssign(indirect.rgb.mul(radianceIntensity))
          }
        }

        // Rim lighting: fresnel-like edge highlight
        if (useRim && normal) {
          const viewDir = vec3(0, 0, 1)
          const NdotV = normal.dot(viewDir).max(float(0))
          const rimFactor = float(1).sub(NdotV).pow(rimPower).mul(rimStrength)
          totalLight.addAssign(vec3(rimFactor, rimFactor, rimFactor))
        }

        // Quantize to discrete bands
        const useBands = bands.greaterThan(float(0))
        const raw = vec3(totalLight)
        const quantized = raw.mul(bands).add(float(0.5)).floor().div(bands)
        return useBands.select(quantized, raw)
      })() as Node<'vec3'>

      return Fn(() => {
        const litColor = ctx.color.rgb.mul(lit)
        return vec4(litColor, ctx.color.a)
      })() as Node<'vec4'>
    }
  }

  /**
   * Create a tiled ColorTransformFn that reads light indices from a tile buffer.
   * Only processes lights assigned to the fragment's screen-space tile.
   *
   * @param tileLookup - Function that reads a light index from the tile data (works with both WebGPU storage buffers and WebGL2 DataTextures)
   * @param tileCountX - Number of tiles in X direction (int uniform)
   * @param screenSize - Screen size in pixels (vec2 uniform)
   * @param tileSize - Tile size in pixels
   * @param options - Optional overrides for auto-normals, rim lighting, shadows
   * @returns ColorTransformFn for use with Sprite2DMaterial
   */
  createTiledColorTransform(
    tileLookup: TileLookupFn,
    tileCountX: Node<'float'>,
    screenSize: Node<'vec2'>,
    tileSize: number,
    options?: {
      texture?: Texture
      autoNormals?: boolean
      rimEnabled?: boolean
      shadows?: boolean
      radiance?: boolean
    }
  ): (ctx: { color: Node<'vec4'>; atlasUV: Node<'vec2'>; worldPosition: Node<'vec2'> }) => Node<'vec4'> {
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

    const useShadows = options?.shadows ?? false
    const useRadiance = options?.radiance ?? false
    const occSize = this._occlusionSizeNode
    const occOffset = this._occlusionOffsetNode
    const shadowStr = this._shadowStrengthNode
    const shadowSoftness = this._shadowSoftnessNode
    const shadowBias = this._shadowBiasNode
    const sdfTexGetter = () => this._sdfTexture
    const radianceTexGetter = () => this._radianceTexture
    const _radianceFarTexGetter = () => this._radianceFarTexture
    const radianceIntensity = this._radianceIntensityNode
    const lightCount = this._countNode

    const MAX_LIGHTS_PER_TILE = 16

    let texelW: number | undefined
    let texelH: number | undefined
    const tex = options?.texture
    if (useAutoNormals && tex?.image) {
      const img = tex.image as { width: number; height: number }
      texelW = 1.0 / img.width
      texelH = 1.0 / img.height
    }

    return (ctx) => {
      const lit = Fn(() => {
        const rawPos = ctx.worldPosition
        const usePixelSnap = pixelSize.greaterThan(float(0))
        const snappedPos = vec2(rawPos).div(pixelSize).floor().mul(pixelSize)
        const surfacePos = usePixelSnap.select(snappedPos, vec2(rawPos))
        const totalLight = vec3(0, 0, 0).toVar('totalLight')

        // Auto-generate surface normal
        let normal: Node<'vec3'> = vec3(0, 0, 1)
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

        // Global ambient pass: ambient lights aren't in tiles, add them directly
        Loop(
          { start: 0, end: lightCount, type: 'float', condition: '<' },
          ({ i }: { i: Node<'float'> }) => {
            const { row0, row1, row3 } = this._readLightData(i)
            const lightType = row3.r
            const lightEnabled = row3.g
            const isAmbient = lightType.greaterThan(float(2.5))
            If(isAmbient.and(lightEnabled.greaterThan(float(0.5))), () => {
              const lightColor = vec3(row0.b, row0.a, row1.r)
              const lightIntensity = row1.g
              totalLight.addAssign(lightColor.mul(lightIntensity))
            })
          }
        )

        const fragUV = vec2(surfacePos).sub(occOffset).div(occSize)
        const tileXY = fragUV.mul(screenSize).div(float(tileSize)).floor()
        const tileIndex = int(tileXY.y).mul(int(tileCountX)).add(int(tileXY.x))

        // Loop over positional lights in this tile (skip when RC handles primary illumination)
        if (!useRadiance) {
          Loop(MAX_LIGHTS_PER_TILE, ({ i }: { i: Node<'int'> }) => {
            const lightIndex = tileLookup(tileIndex, i)

            // 0 = empty sentinel → skip (If guard avoids GPU work for empty slots)
            const isValid = lightIndex.greaterThan(int(0))

            If(isValid, () => {
              // Fetch light data (1-based → 0-based)
              const actualIndex = lightIndex.sub(int(1))
              const { row0, row1, row2, row3 } = this._readLightData(actualIndex)

              const finalContribution = this._buildLightContribution(
                row0,
                row1,
                row2,
                row3,
                surfacePos,
                normal,
                {
                  useShadows,
                  useAutoNormals: !!useAutoNormals,
                  glowRadius,
                  glowIntensity,
                  lightHeight,
                  occSize,
                  occOffset,
                  shadowStr,
                  shadowSoftness,
                  shadowBias,
                  sdfTexGetter,
                }
              )

              totalLight.addAssign(finalContribution)
            })
          })
        }

        // Radiance Cascades (primary illumination): sample RC final irradiance texture
        if (useRadiance) {
          const radianceTex = radianceTexGetter()
          if (radianceTex) {
            const surfaceUV2 = vec2(surfacePos).sub(occOffset).div(occSize)
            const indirect = sampleTexture(radianceTex, surfaceUV2)
            totalLight.addAssign(indirect.rgb.mul(radianceIntensity))
          }
        }

        // Rim lighting
        if (useRim && normal) {
          const viewDir = vec3(0, 0, 1)
          const NdotV = normal.dot(viewDir).max(float(0))
          const rimFactor = float(1).sub(NdotV).pow(rimPower).mul(rimStrength)
          totalLight.addAssign(vec3(rimFactor, rimFactor, rimFactor))
        }

        // Quantize to discrete bands
        const useBands = bands.greaterThan(float(0))
        const raw = vec3(totalLight)
        const quantized = raw.mul(bands).add(float(0.5)).floor().div(bands)
        return useBands.select(quantized, raw)
      })() as Node<'vec3'>

      return Fn(() => {
        const litColor = ctx.color.rgb.mul(lit)
        return vec4(litColor, ctx.color.a)
      })() as Node<'vec4'>
    }
  }
}
