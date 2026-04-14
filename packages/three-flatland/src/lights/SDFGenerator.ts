import {
  RenderTarget,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  Mesh,
  HalfFloatType,
  NearestFilter,
  LinearFilter,
  type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { uniform, uv, vec2, vec4, float, Fn, texture as sampleTexture } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Jump Flood Algorithm (JFA) SDF Generator.
 *
 * Converts a binary occlusion texture into a signed distance field.
 * Uses fragment-shader-only passes (no compute shaders — works on WebGL 2 and WebGPU).
 *
 * Output:
 * - SDF texture: R = distance to nearest occluder (normalized UV space),
 *                G = vector X to nearest occluder, B = vector Y to nearest occluder.
 *
 * Pass count: 1 seed + ceil(log2(max(w,h))) JFA + 1 final ≈ 10-12 passes.
 *
 * NOTE: This generator is SDF-only. Light propagation is handled separately
 * by RadianceCascades which uses the SDF for visibility testing.
 */
export class SDFGenerator {
  /** Final SDF output texture */
  get sdfTexture(): Texture {
    return this._sdfRT!.texture
  }

  // Render targets: ping-pong for JFA, final SDF output
  private _pingRT: RenderTarget | null = null
  private _pongRT: RenderTarget | null = null
  private _sdfRT: RenderTarget | null = null

  // Fullscreen quad rendering setup
  private _scene: Scene
  private _camera: OrthographicCamera
  private _quad: Mesh
  private _geometry: PlaneGeometry

  // Materials for each pass (created lazily)
  private _seedMaterial: MeshBasicNodeMaterial | null = null
  private _jfaMaterialA: MeshBasicNodeMaterial | null = null // reads ping → writes pong
  private _jfaMaterialB: MeshBasicNodeMaterial | null = null // reads pong → writes ping
  private _finalMaterialA: MeshBasicNodeMaterial | null = null // reads ping → writes sdf
  private _finalMaterialB: MeshBasicNodeMaterial | null = null // reads pong → writes sdf

  // JFA step size uniforms (one per material since they read different RTs)
  private _jumpSizeA = uniform(0.5)
  private _jumpSizeB = uniform(0.5)

  // Tracks input texture for seed material creation
  private _occlusionTex: Texture | null = null

  constructor() {
    this._scene = new Scene()
    this._camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this._geometry = new PlaneGeometry(2, 2)
    this._quad = new Mesh(this._geometry)
    this._scene.add(this._quad)

    // Eagerly allocate 1×1 placeholder RTs + materials so the sdfTexture
    // reference is stable from construction onward. TSL captures texture
    // references at shader-build time, which happens when a LightEffect
    // attaches — well before the shadow pipeline system's first tick
    // resizes the RTs to the viewport. Mirrors the same trick in
    // ForwardPlusLighting (see its constructor comment).
    const jfaOptions = {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    const sdfOptions = {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    this._pingRT = new RenderTarget(1, 1, jfaOptions)
    this._pongRT = new RenderTarget(1, 1, jfaOptions)
    this._sdfRT = new RenderTarget(1, 1, sdfOptions)

    // Materials capture the RT textures via TSL texture(); the RT
    // reference is stable across setSize() so materials never need
    // rebuilding after the initial construction.
    this._createJFAMaterials()
    this._createFinalMaterials()
  }

  /**
   * Resize render targets to the given dimensions. First-call semantics
   * (previously called `init`) and subsequent resizes are the same code
   * path now — the RTs already exist from the constructor.
   */
  init(width: number, height: number): void {
    this.resize(width, height)
  }

  /**
   * Resize all render targets. RT textures are stable objects so materials don't need recreation.
   */
  resize(width: number, height: number): void {
    this._pingRT?.setSize(width, height)
    this._pongRT?.setSize(width, height)
    this._sdfRT?.setSize(width, height)
  }

  /**
   * Generate SDF from occlusion render target.
   * The occlusion RT should have alpha > 0 where occluders exist.
   *
   * @param renderer - WebGPU renderer
   * @param occlusionRT - Occlusion render target (alpha = occluder mask)
   */
  generate(renderer: WebGPURenderer, occlusionRT: RenderTarget): void {
    // Ensure seed material exists and matches the input texture
    this._ensureSeedMaterial(occlusionRT.texture)

    const prevRT = renderer.getRenderTarget()
    const maxDim = Math.max(this._pingRT!.width, this._pingRT!.height)
    const passes = Math.ceil(Math.log2(maxDim))

    // Pass 1: Seed — read occlusion alpha, write seed UVs
    this._quad.material = this._seedMaterial!
    renderer.setRenderTarget(this._pingRT)
    renderer.render(this._scene, this._camera)

    // JFA passes: ping-pong with halving jump size
    let readPing = true
    for (let i = 0; i < passes; i++) {
      const jumpSize = Math.pow(2, passes - 1 - i) / maxDim

      if (readPing) {
        this._jumpSizeA.value = jumpSize
        this._quad.material = this._jfaMaterialA!
        renderer.setRenderTarget(this._pongRT)
      } else {
        this._jumpSizeB.value = jumpSize
        this._quad.material = this._jfaMaterialB!
        renderer.setRenderTarget(this._pingRT)
      }

      renderer.render(this._scene, this._camera)
      readPing = !readPing
    }

    // Final pass: compute distance from converged seed UVs
    if (readPing) {
      this._quad.material = this._finalMaterialA! // reads ping
    } else {
      this._quad.material = this._finalMaterialB! // reads pong
    }

    renderer.setRenderTarget(this._sdfRT)
    renderer.render(this._scene, this._camera)

    renderer.setRenderTarget(prevRT)
  }

  /**
   * Dispose of all GPU resources.
   */
  dispose(): void {
    this._pingRT?.dispose()
    this._pongRT?.dispose()
    this._sdfRT?.dispose()
    this._geometry.dispose()
    this._seedMaterial?.dispose()
    this._jfaMaterialA?.dispose()
    this._jfaMaterialB?.dispose()
    this._finalMaterialA?.dispose()
    this._finalMaterialB?.dispose()
  }

  /**
   * Create or recreate the seed material when input texture changes.
   * TSL texture() captures a Texture object reference at node creation time,
   * so we must recreate if the reference changes.
   *
   * Seed pass output:
   * - R, G: Seed UV for SDF (fragment UV where occluder, FAR otherwise)
   */
  private _ensureSeedMaterial(occlusionTexture: Texture): void {
    if (this._occlusionTex === occlusionTexture && this._seedMaterial) return

    this._occlusionTex = occlusionTexture
    this._seedMaterial?.dispose()

    const FAR = float(9999)
    this._seedMaterial = new MeshBasicNodeMaterial()
    this._seedMaterial.colorNode = Fn(() => {
      const fragUV = uv()
      const occSample = sampleTexture(occlusionTexture, fragUV)
      const hasOccluder = occSample.a.greaterThan(float(0))

      // SDF seed: fragment UV where occluder exists, FAR sentinel otherwise
      const seedUV = hasOccluder.select(fragUV, vec2(FAR, FAR))

      return vec4(seedUV.x, seedUV.y, float(0), float(1))
    })() as Node<'vec4'>
  }

  /**
   * Create JFA propagation materials (A reads ping, B reads pong).
   * Each material checks 9 neighbors at offset * jumpSize and keeps the closest seed UV.
   */
  private _createJFAMaterials(): void {
    const pingTex = this._pingRT!.texture
    const pongTex = this._pongRT!.texture

    this._jfaMaterialA = new MeshBasicNodeMaterial()
    this._jfaMaterialA.colorNode = this._jfaColorNode(pingTex, this._jumpSizeA)

    this._jfaMaterialB = new MeshBasicNodeMaterial()
    this._jfaMaterialB.colorNode = this._jfaColorNode(pongTex, this._jumpSizeB)
  }

  /**
   * Create the JFA propagation shader node.
   * For each fragment, check 9 neighbors at offset * jumpSize.
   * Keep the seed UV that is closest to this fragment.
   */
  private _jfaColorNode(sourceTex: Texture, jumpSize: ReturnType<typeof uniform>): Node<'vec4'> {
    return Fn(() => {
      const fragUV = uv()

      // Read current pixel data
      const currentData = sampleTexture(sourceTex, fragUV)
      const currentSeedUV = vec2(currentData.r, currentData.g)

      // Initialize best seed with current value
      const bestSeed = currentSeedUV.toVar('bestSeed')
      const bestDist = fragUV.sub(currentSeedUV).dot(fragUV.sub(currentSeedUV)).toVar('bestDist')

      // 9-neighbor search (3×3 grid centered on fragment)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue // Skip center (already processed)

          const offset = vec2(float(dx), float(dy)).mul(float(jumpSize))
          const neighborUV = fragUV.add(offset)
          const neighborData = sampleTexture(sourceTex, neighborUV)
          const neighborSeedUV = vec2(neighborData.r, neighborData.g)

          // Check if this neighbor's seed is closer
          const diff = fragUV.sub(neighborSeedUV)
          const dist = diff.dot(diff)

          const isCloser = dist.lessThan(bestDist)
          bestDist.assign(isCloser.select(dist, bestDist))
          bestSeed.assign(isCloser.select(neighborSeedUV, bestSeed))
        }
      }

      return vec4(bestSeed.x, bestSeed.y, float(0), float(1))
    })() as Node<'vec4'>
  }

  /**
   * Create final pass materials (A reads ping, B reads pong).
   * Computes final SDF distance from converged seed UVs.
   */
  private _createFinalMaterials(): void {
    const pingTex = this._pingRT!.texture
    const pongTex = this._pongRT!.texture

    this._finalMaterialA = new MeshBasicNodeMaterial()
    this._finalMaterialA.colorNode = this._finalColorNode(pingTex)

    this._finalMaterialB = new MeshBasicNodeMaterial()
    this._finalMaterialB.colorNode = this._finalColorNode(pongTex)
  }

  /**
   * Create the final computation shader node.
   * R = distance to nearest occluder (UV space)
   * G = vector X to nearest occluder
   * B = vector Y to nearest occluder
   */
  private _finalColorNode(sourceTex: Texture): Node<'vec4'> {
    return Fn(() => {
      const fragUV = uv()
      const data = sampleTexture(sourceTex, fragUV)
      const seedUV = vec2(data.r, data.g)
      const diff = fragUV.sub(seedUV)
      const dist = diff.length()
      return vec4(dist, diff.x, diff.y, float(1))
    })() as Node<'vec4'>
  }
}
