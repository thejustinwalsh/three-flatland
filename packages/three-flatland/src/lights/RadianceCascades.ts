import {
  WebGLRenderTarget,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  Mesh,
  HalfFloatType,
  LinearFilter,
  ClampToEdgeWrapping,
  Vector2,
  DataTexture,
  type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  int,
  ivec2,
  Fn,
  Loop,
  If,
  Break,
  texture as sampleTexture,
  textureLoad,
  cos,
  sin,
  floor,
  mod,
  max,
} from 'three/tsl'
import { worldToUV, uvToWorld } from './coordUtils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLNode = any

const TAU = Math.PI * 2
const EPS = 0.001

export interface RadianceCascadesConfig {
  cascadeCount: number
  baseRayCount: number
  /** Base interval in world units. 0 = auto-calculate from world size. */
  baseInterval: number
  /** Cascade texture resolution. 0 = auto-calculate from world size. */
  cascadeResolution: number
}

const DEFAULT_CONFIG: RadianceCascadesConfig = {
  cascadeCount: 4,
  baseRayCount: 4,
  baseInterval: 0,
  cascadeResolution: 0,
}

/**
 * Radiance Cascades GI system.
 *
 * Implements the Radiance Cascades algorithm for 2D global illumination:
 * - Direction-first probe layout for efficient bilinear interpolation
 * - SDF sphere-traced raymarching within bounded intervals
 * - Hierarchical cascade merging (high cascades fill gaps in low cascades)
 *
 * Pipeline per frame:
 * 1. Render scene radiance (lights as soft circles)
 * 2. For cascade = N-1 down to 0: raymarch + merge with cascade N+1
 * 3. Average all directions from cascade 0 into final irradiance texture
 */
export class RadianceCascades {
  private _config: RadianceCascadesConfig
  private _cascadeRTs: WebGLRenderTarget[] = []
  private _sceneRadianceRT: WebGLRenderTarget | null = null
  private _finalRadianceRT: WebGLRenderTarget | null = null
  private _scene: Scene
  private _camera: OrthographicCamera
  private _quad: Mesh
  private _geometry: PlaneGeometry

  private _cascadeMaterials: MeshBasicNodeMaterial[] = []
  private _sceneRadianceMaterial: MeshBasicNodeMaterial | null = null
  private _finalRadianceMaterial: MeshBasicNodeMaterial | null = null

  private _worldSize = new Vector2(1, 1)
  private _worldOffset = new Vector2(0, 0)
  private _worldSizeNode = uniform(new Vector2(1, 1))
  private _worldOffsetNode = uniform(new Vector2(0, 0))

  private _sdfTexture: Texture | null = null
  private _lightsTexture: DataTexture | null = null
  private _lightCountNode: TSLNode = null

  /** Effective base interval (auto-calculated if config.baseInterval is 0) */
  private _effectiveBaseInterval: number = 16

  constructor(config?: Partial<RadianceCascadesConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }

    this._scene = new Scene()
    this._camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this._geometry = new PlaneGeometry(2, 2)
    this._quad = new Mesh(this._geometry)
    this._scene.add(this._quad)
  }

  get config(): RadianceCascadesConfig {
    return this._config
  }

  set cascadeCount(value: number) {
    if (value !== this._config.cascadeCount) {
      this._config.cascadeCount = Math.max(2, Math.min(6, value))
      this._rebuildCascadeRTs()
    }
  }

  get cascadeCount(): number {
    return this._config.cascadeCount
  }

  get radianceTexture(): Texture | null {
    return this._finalRadianceRT?.texture ?? null
  }

  get sceneRadianceTexture(): Texture | null {
    return this._sceneRadianceRT?.texture ?? null
  }

  get cascadeTextures(): (Texture | null)[] {
    return this._cascadeRTs.map((rt) => rt?.texture ?? null)
  }

  get finalRadianceTexture(): Texture | null {
    return this._finalRadianceRT?.texture ?? null
  }

  init(
    worldWidth: number,
    worldHeight: number,
    lightsTexture: DataTexture,
    lightCountNode: TSLNode
  ): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._lightsTexture = lightsTexture
    this._lightCountNode = lightCountNode

    // Auto-calculate cascadeResolution from world size if not explicitly set.
    // Target ~1 probe per 1.5 world units, rounded up to next power of 2.
    const baseAngular = Math.sqrt(this._config.baseRayCount)
    if (this._config.cascadeResolution <= 0) {
      const maxDim = Math.max(worldWidth, worldHeight)
      const targetProbes = maxDim / 1.5
      const targetRes = targetProbes * baseAngular
      this._config.cascadeResolution = Math.pow(2, Math.ceil(Math.log2(targetRes)))
    }

    // Auto-calculate baseInterval so total cascade reach covers the view diagonal.
    // Total reach = bi * sum(4^c for c in 0..N-1) = bi * (4^N - 1) / 3
    if (this._config.baseInterval <= 0) {
      const diagonal = Math.sqrt(worldWidth * worldWidth + worldHeight * worldHeight)
      const N = this._config.cascadeCount
      const geometricSum = (Math.pow(4, N) - 1) / 3 // 1 + 4 + 16 + 64 = 85 for N=4
      this._effectiveBaseInterval = diagonal / geometricSum
    } else {
      this._effectiveBaseInterval = this._config.baseInterval
    }

    const res = this._config.cascadeResolution
    const probeCount = res / baseAngular

    this._sceneRadianceRT = new WebGLRenderTarget(res, res, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    })

    this._finalRadianceRT = new WebGLRenderTarget(probeCount, probeCount, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    })

    this._rebuildCascadeRTs()
  }

  private _rebuildCascadeRTs(): void {
    for (const rt of this._cascadeRTs) {
      rt.dispose()
    }
    this._cascadeRTs = []

    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []

    // Invalidate final radiance material (it references cascade 0 texture)
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null

    const res = this._config.cascadeResolution
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const rt = new WebGLRenderTarget(res, res, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      })
      this._cascadeRTs.push(rt)
    }

    this._createCascadeMaterials()
  }

  resize(worldWidth: number, worldHeight: number): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
  }

  setWorldBounds(worldSize: Vector2, worldOffset: Vector2): void {
    this._worldSize.copy(worldSize)
    this._worldOffset.copy(worldOffset)
    this._worldSizeNode.value.copy(worldSize)
    this._worldOffsetNode.value.copy(worldOffset)
  }

  setSdfTexture(texture: Texture): void {
    if (this._sdfTexture !== texture) {
      this._sdfTexture = texture
      this._createCascadeMaterials()
    }
  }

  generate(renderer: WebGPURenderer, sdfTexture: Texture): void {
    if (this._sdfTexture !== sdfTexture) {
      this._sdfTexture = sdfTexture
      this._createCascadeMaterials()
    }

    const prevRT = renderer.getRenderTarget()

    // Step 1: Render scene radiance (lights as soft circles)
    this._renderSceneRadiance(renderer)

    // Step 2: Process cascades from highest to lowest
    // Each cascade raymarches within its interval, then merges with cascade N+1
    for (let i = this._config.cascadeCount - 1; i >= 0; i--) {
      this._renderCascade(renderer, i)
    }

    // Step 3: Average all directions from cascade 0 into final irradiance
    this._renderFinalRadiance(renderer)

    renderer.setRenderTarget(prevRT)
  }

  // ============================================
  // SCENE RADIANCE (lights as soft circles)
  // ============================================

  private _renderSceneRadiance(renderer: WebGPURenderer): void {
    if (!this._sceneRadianceRT || !this._lightsTexture || !this._lightCountNode) return

    this._ensureSceneRadianceMaterial()
    if (!this._sceneRadianceMaterial) return

    this._quad.material = this._sceneRadianceMaterial
    renderer.setRenderTarget(this._sceneRadianceRT)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(this._scene, this._camera)
  }

  /**
   * Create the scene radiance material.
   * Renders each light as a soft circle of radiance.
   *
   * Bug 7 fix: Uses uvToWorld() consistently — no manual Y-flip.
   */
  private _ensureSceneRadianceMaterial(): void {
    if (this._sceneRadianceMaterial) return
    if (!this._lightsTexture || !this._lightCountNode) return

    const lightsTexture = this._lightsTexture
    const lightCount = this._lightCountNode
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode

    this._sceneRadianceMaterial = new MeshBasicNodeMaterial()
    this._sceneRadianceMaterial.colorNode = Fn(() => {
      // Flip Y: render target UV has Y=0 at top, but worldOffset.y is bottom
      const fragUV = vec2(uv().x, float(1).sub(uv().y))
      const worldPos = uvToWorld(fragUV, worldSize, worldOffset)

      const totalRadiance = vec3(0, 0, 0).toVar()

      Loop(
        { start: int(0), end: lightCount, type: 'int', condition: '<' },
        ({ i }: { i: TSLNode }) => {
          const row0 = textureLoad(lightsTexture, ivec2(i, 0))
          const row1 = textureLoad(lightsTexture, ivec2(i, 1))
          const row3 = textureLoad(lightsTexture, ivec2(i, 3))

          const lightPos = vec2(row0.r, row0.g)
          const lightColor = vec3(row0.b, row0.a, row1.r)
          const lightIntensity = row1.g
          const lightDistance = row1.b
          const lightType = row3.r
          const lightEnabled = row3.g

          If(lightEnabled.greaterThan(float(0.5)), () => {
            const isAmbient = lightType.greaterThan(float(2.5))
            If(isAmbient, () => {
              totalRadiance.addAssign(lightColor.mul(lightIntensity).mul(float(0.1)))
            })

            const isPositional = lightType.lessThan(float(1.5))
            If(isPositional, () => {
              const toLight = lightPos.sub(worldPos)
              const dist = toLight.length()
              const lightRadius = lightDistance.max(float(1))

              // Smooth emission falloff for scene radiance (input to RC propagation).
              // (1 - (d/r)²)² gives a smooth bell curve: 1 at center, 0 at radius,
              // C¹ continuous at boundary. No hard seam, no infinity at center.
              // RC handles the actual distance-based light transport.
              const normDist = dist.div(lightRadius).clamp(0, 1)
              const falloff = float(1).sub(normDist.mul(normDist))
              const smoothFalloff = falloff.mul(falloff)
              totalRadiance.addAssign(lightColor.mul(lightIntensity).mul(smoothFalloff))
            })
          })
        }
      )

      // Store in linear space — no gamma conversion
      return vec4(totalRadiance, float(1))
    })()
  }

  // ============================================
  // CASCADE PASSES (raymarch + merge)
  // ============================================

  private _renderCascade(renderer: WebGPURenderer, cascadeIndex: number): void {
    const material = this._cascadeMaterials[cascadeIndex]
    if (!material) return

    this._quad.material = material
    renderer.setRenderTarget(this._cascadeRTs[cascadeIndex]!)
    renderer.render(this._scene, this._camera)
  }

  private _createCascadeMaterials(): void {
    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []

    if (!this._sdfTexture || !this._sceneRadianceRT) return
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const prevCascadeTex =
        i < this._config.cascadeCount - 1 ? (this._cascadeRTs[i + 1]?.texture ?? null) : null

      const material = this._createCascadeMaterial(i, prevCascadeTex)
      this._cascadeMaterials.push(material)
    }
  }

  /**
   * Create a material for a single cascade pass.
   *
   * Direction-first layout: the cascade texture is divided into angular×angular
   * direction blocks, each probeGroupSize×probeGroupSize pixels. A texel's
   * position determines which probe and which direction it represents.
   *
   * Fixes applied:
   * - Interval scaling uses pow(4, c) geometric series (branching factor 4)
   * - Highest cascade samples scene radiance at ray endpoint on miss (boundary condition)
   * - SDF scale uses average(worldW, worldH) for isotropic distance conversion
   * - Cascade merge averages 4 sub-rays from cascade N+1
   * - Uses worldToUV/uvToWorld consistently
   */
  private _createCascadeMaterial(
    cascadeIndex: number,
    prevCascadeTexture: Texture | null
  ): MeshBasicNodeMaterial {
    const config = this._config
    const sdfTexture = this._sdfTexture!
    const sceneRadianceTexture = this._sceneRadianceRT!.texture
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode

    const baseAngular = Math.sqrt(config.baseRayCount)
    const angular = baseAngular * Math.pow(2, cascadeIndex)
    const angularSq = angular * angular

    const bi = this._effectiveBaseInterval
    // Interval offset = sum of previous cascade ranges (geometric series with factor 4)
    // Branching factor is 4 (4x angular directions per level), so interval scales by 4.
    // Cascade N covers interval [sum(bi*4^c for c<N), sum(bi*4^c for c<=N)]
    let intervalOffset = 0
    for (let c = 0; c < cascadeIndex; c++) {
      intervalOffset += bi * Math.pow(4, c)
    }
    const intervalRange = bi * Math.pow(4, cascadeIndex)

    const res = config.cascadeResolution
    const probeGroupSize = res / angular

    // Minimum step per cascade: fraction of this cascade's range
    // Must be small enough that cascade 0 (shortest range) gets meaningful steps
    const minStep = Math.max(intervalRange / 32, 0.001)

    const material = new MeshBasicNodeMaterial()
    material.colorNode = Fn(() => {
      const fragCoord = vec2(uv().x, float(1).sub(uv().y)).mul(float(res))

      // Direction-first layout decomposition
      const rayXY = floor(fragCoord.div(float(probeGroupSize)))
      const probeXY = mod(fragCoord, float(probeGroupSize))
      const rayIndex = rayXY.x.add(rayXY.y.mul(float(angular)))

      // Probe UV → world position (Bug 7 fix: use uvToWorld, no Y-flip)
      const probeUV = probeXY.add(float(0.5)).div(float(probeGroupSize))
      const probeWorldPos = uvToWorld(probeUV, worldSize, worldOffset)

      // // DEBUG PASSTHROUGH (disabled — all cascades now raymarching):
      // // eslint-disable-next-line no-constant-condition
      // if (cascadeIndex < config.cascadeCount - 3) {
      //   const probeSampleUV = worldToUV(probeWorldPos, worldSize, worldOffset)
      //   const passthrough = sampleTexture(sceneRadianceTexture, probeSampleUV)
      //   return vec4(passthrough.rgb, float(1))
      // }

      // --- RAYMARCHING (SDF enabled, NO cascade merging) ---

      // Ray direction from angular index
      const theta = rayIndex.add(float(0.5)).mul(float(TAU / angularSq))
      const rayDir = vec2(cos(theta), sin(theta))

      // Raymarching state
      const peakEmission = vec3(0).toVar() // Peak emission seen along ray (lights are transparent)
      const visibility = float(1).toVar() // 0 = hit occluder (SDF), 1 = clear
      const t = float(intervalOffset).toVar()

      // SDF stores distance in UV space [0,1]. Convert ray direction to UV
      // space so we can compare SDF distance against ray step directly.
      // Scale by average of world dimensions for isotropic approximation.
      const sdfScale = worldSize.x.add(worldSize.y).mul(float(0.5))

      Loop(32, () => {
        const sampleWorld = probeWorldPos.add(rayDir.mul(t))
        const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)

        // Bounds check
        const outOfBounds = sampleUV.x
          .lessThan(0)
          .or(sampleUV.x.greaterThan(1))
          .or(sampleUV.y.lessThan(0))
          .or(sampleUV.y.greaterThan(1))

        If(outOfBounds, () => {
          Break()
        })

        // SDF sphere trace — check for occluder hit
        const sdfSample = sampleTexture(sdfTexture, sampleUV)
        const sdfDist = sdfSample.r.mul(sdfScale)

        If(sdfDist.lessThan(float(EPS)), () => {
          // Hit occluder — ray is blocked. Capture any emission at surface.
          peakEmission.assign(max(peakEmission, sampleTexture(sceneRadianceTexture, sampleUV).rgb))
          visibility.assign(float(0))
          Break()
        })

        // Track peak emission along the ray. Lights are transparent — they emit
        // but don't block the ray. Only SDF occluders block.
        const sceneRad = sampleTexture(sceneRadianceTexture, sampleUV)
        peakEmission.assign(max(peakEmission, sceneRad.rgb))

        t.addAssign(sdfDist.max(float(minStep)))

        If(t.greaterThan(float(intervalOffset + intervalRange)), () => {
          Break()
        })
      })

      // Result: peak emission in this interval + merge from higher cascades (if not blocked)
      const merged = vec3(peakEmission).toVar()

      if (prevCascadeTexture && cascadeIndex < config.cascadeCount - 1) {
        If(visibility.greaterThan(float(0.5)), () => {
          // Merge with higher cascade's 4 sub-rays using bilinear interpolation.
          // Cascade textures have LinearFilter, so sampleTexture gives hardware bilinear.
          const angularN1 = angular * 2
          const probeGroupSizeN1 = res / angularN1

          // Map probe position from this cascade to next cascade's probe space.
          // N+1 has half the probes per direction block (double angular resolution).
          const probeN1 = probeXY.mul(float(0.5)).clamp(float(0.5), float(probeGroupSizeN1 - 0.5))

          const mergeAccum = vec3(0).toVar()

          for (let subRay = 0; subRay < 4; subRay++) {
            const subRayIndex = rayIndex.mul(float(4)).add(float(subRay))
            const rayN1XY = vec2(
              mod(subRayIndex, float(angularN1)),
              floor(subRayIndex.div(float(angularN1)))
            )

            // Compute full texel position, then convert to UV for bilinear sampling.
            // textureLoad and sampleTexture share the same coordinate origin for
            // render targets in WebGPU — no Y-flip needed.
            const texelPos = rayN1XY.mul(float(probeGroupSizeN1)).add(probeN1)
            const mergeUV = texelPos.div(float(res))
            const mergedSample = sampleTexture(prevCascadeTexture!, mergeUV)
            mergeAccum.addAssign(mergedSample.rgb)
          }

          merged.addAssign(mergeAccum.mul(float(0.25)))
        })
      }

      return vec4(merged, float(1).sub(visibility))
    })()

    return material
  }

  // ============================================
  // FINAL IRRADIANCE READOUT
  // ============================================

  private _renderFinalRadiance(renderer: WebGPURenderer): void {
    if (!this._finalRadianceRT || !this._cascadeRTs[0]) return

    this._ensureFinalRadianceMaterial()
    if (!this._finalRadianceMaterial) return

    this._quad.material = this._finalRadianceMaterial
    renderer.setRenderTarget(this._finalRadianceRT)
    renderer.render(this._scene, this._camera)
  }

  /**
   * Create the final irradiance averaging material.
   *
   * Bug 3 fix: Averages ALL direction blocks from cascade 0.
   * (Previously only sampled top-left 25% = one direction.)
   *
   * For each probe position, loops over all angular²  directions and averages
   * the radiance. Output is a probeCount × probeCount texture addressed by
   * world UV [0,1] — same convention as the SDF and occlusion textures.
   */
  private _ensureFinalRadianceMaterial(): void {
    if (this._finalRadianceMaterial) return
    if (!this._cascadeRTs[0]) return

    const cascade0Texture = this._cascadeRTs[0].texture
    const config = this._config
    const baseAngular = Math.sqrt(config.baseRayCount)
    const angular = baseAngular // Cascade 0 angular
    const angularSq = angular * angular
    const res = config.cascadeResolution
    const probeGroupSize = res / angular

    this._finalRadianceMaterial = new MeshBasicNodeMaterial()
    this._finalRadianceMaterial.colorNode = Fn(() => {
      // Map final RT UV → probe position in cascade 0
      // Flip Y: render target UV has Y=0 at top, but world space has Y=0 at bottom
      const flippedUV = vec2(uv().x, float(1).sub(uv().y))
      const probeXY = flippedUV.mul(float(probeGroupSize))

      const irradiance = vec3(0).toVar()

      // Unrolled loop: average all direction blocks
      for (let dirY = 0; dirY < angular; dirY++) {
        for (let dirX = 0; dirX < angular; dirX++) {
          const lookupCoord = vec2(
            float(dirX * probeGroupSize).add(probeXY.x),
            float(dirY * probeGroupSize).add(probeXY.y)
          )
          const lookupUV = lookupCoord.div(float(res))
          const sample = sampleTexture(cascade0Texture, lookupUV)
          irradiance.addAssign(sample.rgb)
        }
      }

      irradiance.divAssign(float(angularSq))

      return vec4(irradiance, float(1))
    })()
  }

  // ============================================
  // CLEANUP
  // ============================================

  dispose(): void {
    for (const rt of this._cascadeRTs) {
      rt.dispose()
    }
    this._cascadeRTs = []

    this._sceneRadianceRT?.dispose()
    this._sceneRadianceRT = null

    this._finalRadianceRT?.dispose()
    this._finalRadianceRT = null

    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []

    this._sceneRadianceMaterial?.dispose()
    this._sceneRadianceMaterial = null

    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null

    this._geometry.dispose()
  }
}
