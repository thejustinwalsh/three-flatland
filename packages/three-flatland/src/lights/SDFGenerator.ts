import {
  RenderTarget,
  HalfFloatType,
  NearestFilter,
  ClampToEdgeWrapping,
  Vector2,
  type Texture,
} from 'three'
import {
  NodeMaterial,
  QuadMesh,
  RendererUtils,
  type WebGPURenderer,
} from 'three/webgpu'
import { uniform, uv, vec2, vec4, float, Fn, texture as sampleTexture } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { registerDebugTexture, unregisterDebugTexture } from '../debug/debug-sink'

/**
 * Jump Flood Algorithm (JFA) SDF Generator.
 *
 * Converts a binary occlusion texture into an unsigned distance field
 * (distance to nearest occluder edge, zero inside or on the caster).
 *
 * Output SDF texture (RGBA16F):
 * - R = distance to nearest occluder in WORLD units (always positive)
 * - G, B = world-space vector (x, y) from fragment to nearest occluder seed
 * - A = 1
 *
 * World-space distances keep the field isotropic on non-square viewports.
 * Caller must supply current frustum size via {@link setWorldBounds} before
 * each {@link generate}.
 *
 * **Rendering pattern**: uses three.js canonical screen-space pass path —
 * `QuadMesh` + `NodeMaterial.fragmentNode` + `RendererUtils.*RendererState`.
 * The prior hand-rolled Scene/Camera/PlaneGeometry/Mesh approach produced
 * WebGPU Y-flip mismatches between ping and pong buffers, because three.js
 * bakes Y-convention handling into `QuadMesh.render()` but not into
 * user-authored scene renders. All passes here go through `_quadMesh`.
 */

// Module-level singletons — one QuadMesh shared across all SDFGenerator
// instances (matches the N8AONode / BloomNode pattern in three.js examples).
const _quadMesh = new QuadMesh()
let _rendererState: ReturnType<typeof RendererUtils.resetRendererState>

export class SDFGenerator {
  /** Final SDF output texture. Reference is stable across resizes. */
  get sdfTexture(): Texture {
    return this._sdfRT.texture
  }

  // Render targets: ping-pong for JFA, scratch for separable blur, final SDF.
  private _pingRT: RenderTarget
  private _pongRT: RenderTarget
  private _sdfRT: RenderTarget
  private _sdfBlurRT: RenderTarget

  // Materials — one per pass / read-direction. `NodeMaterial` (not
  // `MeshBasicNodeMaterial`) matches the three.js TSL post-effect convention.
  private _seedMaterial: NodeMaterial | null = null
  private _jfaMaterialA: NodeMaterial // reads ping → writes pong
  private _jfaMaterialB: NodeMaterial // reads pong → writes ping
  private _finalMaterialA: NodeMaterial // reads ping → writes sdf
  private _finalMaterialB: NodeMaterial // reads pong → writes sdf
  private _blurHMaterial: NodeMaterial // reads sdf  → writes sdfBlur
  private _blurVMaterial: NodeMaterial // reads sdfBlur → writes sdf

  // JFA step-size uniforms — one per material (they read different RTs).
  private _jumpSizeA = uniform(0.5)
  private _jumpSizeB = uniform(0.5)

  // Reciprocal RT size — texel step for the separable blur kernel.
  private _texelSize = uniform(new Vector2(1, 1))

  // Frustum size — weights JFA diffs to world space so the SDF is isotropic.
  private _worldSizeNode = uniform(new Vector2(1, 1))

  // Tracks the input occlusion texture so we only rebuild the seed material
  // when the caller swaps it out.
  private _occlusionTex: Texture | null = null

  constructor() {
    // Eagerly allocate 1×1 placeholder RTs so `sdfTexture` hands out a stable
    // reference to downstream consumers (sprite materials captured it at
    // shader-build time, well before the first `resize` fires).
    const jfaOptions = {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    // NearestFilter on the SDF output: the shadow sphere-trace samples
    // this texture at sub-texel UVs, and bilinear interpolation between a
    // dist=0 texel and a dist=1 texel gives a smooth 0→0.5→1 ramp. With
    // the hit threshold (eps) at 0.5, any trace stepping through that
    // half-texel ramp registers a hit — producing a faint halo exactly
    // `eps` wide around every caster. Nearest snaps sub-texel samples to
    // the closest texel's value, so the hit/no-hit transition is a clean
    // step at the silhouette boundary.
    const sdfOptions = {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    this._pingRT = new RenderTarget(1, 1, jfaOptions)
    this._pongRT = new RenderTarget(1, 1, jfaOptions)
    this._sdfRT = new RenderTarget(1, 1, sdfOptions)
    this._sdfBlurRT = new RenderTarget(1, 1, sdfOptions)

    for (const rt of [this._pingRT, this._pongRT, this._sdfRT, this._sdfBlurRT]) {
      rt.texture.wrapS = ClampToEdgeWrapping
      rt.texture.wrapT = ClampToEdgeWrapping
    }

    // Build pass materials once. TSL captures the RT textures at construction
    // time; the RT references are stable across `setSize`, so these never
    // need rebuilding.
    this._jfaMaterialA = this._buildJFAMaterial(this._pingRT.texture, this._jumpSizeA)
    this._jfaMaterialB = this._buildJFAMaterial(this._pongRT.texture, this._jumpSizeB)
    this._finalMaterialA = this._buildFinalMaterial(this._pingRT.texture)
    this._finalMaterialB = this._buildFinalMaterial(this._pongRT.texture)
    this._blurHMaterial = this._buildBlurMaterial(this._sdfRT.texture, 'horizontal')
    this._blurVMaterial = this._buildBlurMaterial(this._sdfBlurRT.texture, 'vertical')

    registerDebugTexture('sdf.jfaPing', this._pingRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA ping buffer',
      maxDim: 0,
    })
    registerDebugTexture('sdf.jfaPong', this._pongRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA pong buffer',
      maxDim: 0,
    })
    registerDebugTexture('sdf.distanceField', this._sdfRT, 'rgba16f', {
      display: 'signed',
      label: 'SDF distance field',
      maxDim: 0,
    })
    registerDebugTexture('sdf.blurScratch', this._sdfBlurRT, 'rgba16f', {
      display: 'signed',
      label: 'SDF blur scratch',
      maxDim: 0,
    })
  }

  init(width: number, height: number): void {
    this.resize(width, height)
  }

  resize(width: number, height: number): void {
    this._pingRT.setSize(width, height)
    this._pongRT.setSize(width, height)
    this._sdfRT.setSize(width, height)
    this._sdfBlurRT.setSize(width, height)
    this._texelSize.value.set(1 / Math.max(1, width), 1 / Math.max(1, height))
  }

  /**
   * Push the current camera frustum (world units) to the JFA / final-pass
   * shaders so distance math is world-isotropic on non-square viewports.
   * Must be called each frame before {@link generate}.
   */
  setWorldBounds(worldSize: Vector2): void {
    this._worldSizeNode.value.copy(worldSize)
  }

  /**
   * Run the full JFA pipeline: seed pass → N ping-pong passes → final
   * distance pass → separable blur. All passes go through the shared
   * `QuadMesh` with `RendererUtils` wrapping the state save/restore —
   * matching the three.js canonical TSL post-effect pattern (N8AONode,
   * BloomNode, etc.). That path is what lets three.js handle the WebGPU
   * Y-flip and binding refresh correctly; our previous hand-rolled
   * Scene/Camera/Mesh render did not.
   */
  generate(renderer: WebGPURenderer, occlusionRT: RenderTarget): void {
    this._ensureSeedMaterial(occlusionRT.texture)

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState)

    try {
      const maxDim = Math.max(this._pingRT.width, this._pingRT.height)
      const passes = Math.ceil(Math.log2(maxDim))

      // Seed pass — occlusion alpha → seed UV into ping buffer.
      _quadMesh.material = this._seedMaterial!
      renderer.setRenderTarget(this._pingRT)
      _quadMesh.render(renderer)

      // JFA ping-pong with halving jump sizes.
      let readPing = true
      for (let i = 0; i < passes; i++) {
        const jumpSize = Math.pow(2, passes - 1 - i) / maxDim
        if (readPing) {
          this._jumpSizeA.value = jumpSize
          _quadMesh.material = this._jfaMaterialA
          renderer.setRenderTarget(this._pongRT)
        } else {
          this._jumpSizeB.value = jumpSize
          _quadMesh.material = this._jfaMaterialB
          renderer.setRenderTarget(this._pingRT)
        }
        _quadMesh.render(renderer)
        readPing = !readPing
      }

      // Final distance pass — converged seed UV → world-distance SDF.
      _quadMesh.material = readPing ? this._finalMaterialA : this._finalMaterialB
      renderer.setRenderTarget(this._sdfRT)
      _quadMesh.render(renderer)

      // Separable blur is still disabled pending a zero-output investigation —
      // see earlier commit history. Re-enable once fixed.
      // _quadMesh.material = this._blurHMaterial
      // renderer.setRenderTarget(this._sdfBlurRT)
      // _quadMesh.render(renderer)
      //
      // _quadMesh.material = this._blurVMaterial
      // renderer.setRenderTarget(this._sdfRT)
      // _quadMesh.render(renderer)
    } finally {
      RendererUtils.restoreRendererState(renderer, _rendererState)
    }
  }

  dispose(): void {
    unregisterDebugTexture('sdf.jfaPing')
    unregisterDebugTexture('sdf.jfaPong')
    unregisterDebugTexture('sdf.distanceField')
    unregisterDebugTexture('sdf.blurScratch')
    this._pingRT.dispose()
    this._pongRT.dispose()
    this._sdfRT.dispose()
    this._sdfBlurRT.dispose()
    this._seedMaterial?.dispose()
    this._jfaMaterialA.dispose()
    this._jfaMaterialB.dispose()
    this._finalMaterialA.dispose()
    this._finalMaterialB.dispose()
    this._blurHMaterial.dispose()
    this._blurVMaterial.dispose()
  }

  /**
   * Seed pass — reads the occlusion texture (3×3 max-alpha dilation closes
   * pixel-art silhouette gaps) and writes `(fragUV, 0, 1)` at occluder
   * fragments or `(FAR, FAR, 0, 1)` elsewhere. Rebuilt when the input
   * texture reference changes.
   */
  private _ensureSeedMaterial(occlusionTexture: Texture): void {
    if (this._occlusionTex === occlusionTexture && this._seedMaterial) return
    this._occlusionTex = occlusionTexture
    this._seedMaterial?.dispose()

    const FAR = float(9999)
    const mat = new NodeMaterial()
    mat.fragmentNode = Fn(() => {
      const fragUV = uv()
      const alpha = sampleTexture(occlusionTexture, fragUV).a
      // Threshold at 0.5 instead of 0 so any residual fractional alpha
      // (e.g. from sub-pixel sprite positioning or anti-aliased sprite
      // art) rounds to a clean binary occluder mask. Without this the
      // SDF silhouette grows by half a pixel along each edge.
      const hasOccluder = alpha.greaterThan(float(0.5))
      const seedUV = hasOccluder.select(fragUV, vec2(FAR, FAR))
      return vec4(seedUV.x, seedUV.y, float(0), float(1))
    })() as Node<'vec4'>
    this._seedMaterial = mat
  }

  /**
   * JFA propagation material. For each fragment, tests 9 neighbor texels at
   * `jumpSize` UV distance, keeps the seed that's closest in WORLD space.
   * (UV-space comparison on a non-square RT would pick an anisotropic
   * winner — the SDF would come out squashed along one axis.)
   */
  private _buildJFAMaterial(
    sourceTex: Texture,
    jumpSize: ReturnType<typeof uniform>
  ): NodeMaterial {
    const worldSize = this._worldSizeNode
    const mat = new NodeMaterial()
    mat.fragmentNode = Fn(() => {
      const fragUV = uv()
      const currentData = sampleTexture(sourceTex, fragUV)
      const currentSeedUV = vec2(currentData.r, currentData.g)
      const currentDiff = fragUV.sub(currentSeedUV).mul(worldSize)
      const bestSeed = currentSeedUV.toVar('bestSeed')
      const bestDist = currentDiff.dot(currentDiff).toVar('bestDist')

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const offset = vec2(float(dx), float(dy)).mul(float(jumpSize))
          const neighborUV = fragUV.add(offset)
          const neighborData = sampleTexture(sourceTex, neighborUV)
          const neighborSeedUV = vec2(neighborData.r, neighborData.g)
          const diff = fragUV.sub(neighborSeedUV).mul(worldSize)
          const dist = diff.dot(diff)
          const isCloser = dist.lessThan(bestDist)
          bestDist.assign(isCloser.select(dist, bestDist))
          bestSeed.assign(isCloser.select(neighborSeedUV, bestSeed))
        }
      }

      return vec4(bestSeed.x, bestSeed.y, float(0), float(1))
    })() as Node<'vec4'>
    return mat
  }

  /**
   * Final-distance material. Reads the converged seed UV at each fragment,
   * converts diff UV → world via `* worldSize`, encodes length in R, and
   * the world-space diff vector in G/B.
   */
  private _buildFinalMaterial(sourceTex: Texture): NodeMaterial {
    const worldSize = this._worldSizeNode
    const mat = new NodeMaterial()
    mat.fragmentNode = Fn(() => {
      const fragUV = uv()
      const data = sampleTexture(sourceTex, fragUV)
      const seedUV = vec2(data.r, data.g)
      const diff = fragUV.sub(seedUV).mul(worldSize)
      const dist = diff.length()
      return vec4(dist, diff.x, diff.y, float(1))
    })() as Node<'vec4'>
    return mat
  }

  /**
   * 5-tap binomial separable blur [1,4,6,4,1]/16. Disabled in the hot path
   * until a zero-output bug is fixed, but kept built so the shader graph
   * stays consistent and `sdfBlurRT` is a valid debug target.
   */
  private _buildBlurMaterial(
    sourceTex: Texture,
    axis: 'horizontal' | 'vertical'
  ): NodeMaterial {
    const ts = this._texelSize
    const mat = new NodeMaterial()
    mat.fragmentNode = Fn(() => {
      const fragUV = uv()
      const step = axis === 'horizontal' ? vec2(ts.x, float(0)) : vec2(float(0), ts.y)
      const s0 = sampleTexture(sourceTex, fragUV)
      const s1a = sampleTexture(sourceTex, fragUV.add(step))
      const s1b = sampleTexture(sourceTex, fragUV.sub(step))
      const s2a = sampleTexture(sourceTex, fragUV.add(step.mul(float(2))))
      const s2b = sampleTexture(sourceTex, fragUV.sub(step.mul(float(2))))
      return s0
        .mul(float(6 / 16))
        .add(s1a.mul(float(4 / 16)))
        .add(s1b.mul(float(4 / 16)))
        .add(s2a.mul(float(1 / 16)))
        .add(s2b.mul(float(1 / 16)))
    })() as Node<'vec4'>
    return mat
  }
}
