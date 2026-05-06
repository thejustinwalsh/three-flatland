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
import {
  beginDebugPass,
  endDebugPass,
  registerDebugTexture,
  unregisterDebugTexture,
} from '../debug/debug-sink'

/**
 * Jump Flood Algorithm (JFA) SDF Generator.
 *
 * Converts a binary occlusion texture into a SIGNED distance field by
 * propagating TWO seed fields in parallel through a single ping-pong
 * JFA chain. Each RT texel packs both seed UVs into its RGBA channels:
 *
 *   R, G = nearest-occluder seed UV        (→ distOutside)
 *   B, A = nearest-empty-space seed UV     (→ distInside)
 *
 * Final pass converts both to world distances and writes
 * `signedDist = distOutside - distInside`: positive outside every
 * occluder, negative inside. Signed distance lets the shadow sphere-
 * trace detect "ray originated inside a caster" and "ray stepped into
 * a caster" cleanly via `sdf < 0`, without the hardcoded escape-offset
 * workaround the unsigned SDF required.
 *
 * Packing both chains into one RGBA buffer keeps memory and pass count
 * identical to the old unsigned single-chain design: one seed pass, one
 * ping-pong JFA chain, one final pass. The JFA propagation shader does
 * one extra distance comparison per neighbor (cheap ALU); bandwidth is
 * the same one texture sample per neighbor as before.
 *
 * Output SDF texture (RGBA16F):
 * - R = signed world-space distance (negative inside, positive outside)
 * - G, B = world-space vector from fragment to nearest occluder seed
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

  // Render targets: ping-pong for JFA (each texel packs outside + inside
  // seed UVs in RGBA), scratch for separable blur, final signed SDF.
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

    // Preview mode (thumbnail vs full-size stream) is now a per-consumer
    // runtime choice; no downsample cap at registration.
    registerDebugTexture('sdf.jfaPing', this._pingRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA ping buffer (RG=outside, BA=inside)',
    })
    registerDebugTexture('sdf.jfaPong', this._pongRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA pong buffer (RG=outside, BA=inside)',
    })
    registerDebugTexture('sdf.distanceField', this._sdfRT, 'rgba16f', {
      display: 'signed',
      label: 'SDF distance field (signed)',
    })
    registerDebugTexture('sdf.blurScratch', this._sdfBlurRT, 'rgba16f', {
      display: 'signed',
      label: 'SDF blur scratch',
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

      // Seed pass — one draw writes both outside and inside seed UVs
      // into ping (RG = outside, BA = inside).
      beginDebugPass('sdf.seed', renderer)
      _quadMesh.material = this._seedMaterial!
      renderer.setRenderTarget(this._pingRT)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      // JFA ping-pong with halving jump sizes. Grouped under one
      // `sdf.jfa` span so the panel collapses the ~11 iterations into
      // a single totaling row; still fine-grained numbers are
      // recoverable by expanding. Labels are stable strings so no
      // per-iteration label allocation. Each iteration propagates BOTH
      // seed fields in parallel (see `_buildJFAMaterial`).
      beginDebugPass('sdf.jfa', renderer)
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
      endDebugPass(renderer)

      // Final distance pass — converged outside + inside seed UVs
      // combined into a signed distance field (see `_buildFinalMaterial`).
      beginDebugPass('sdf.final', renderer)
      _quadMesh.material = readPing ? this._finalMaterialA : this._finalMaterialB
      renderer.setRenderTarget(this._sdfRT)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      // Separable 5-tap binomial blur — H: sdfRT → sdfBlurRT,
      // V: sdfBlurRT → sdfRT. Smooths the per-texel distance values so
      // soft-shadow math (and any future linear-filter consumers) see a
      // graceful transition instead of the stair-stepped Voronoi seams
      // the raw JFA leaves at diagonal boundaries. Samples are taken at
      // ±1 and ±2 full-texel offsets, so NearestFilter source sampling
      // still returns exact texel values; the blur smooths the stored
      // distances without needing linear interpolation.
      beginDebugPass('sdf.blurH', renderer)
      _quadMesh.material = this._blurHMaterial
      renderer.setRenderTarget(this._sdfBlurRT)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      beginDebugPass('sdf.blurV', renderer)
      _quadMesh.material = this._blurVMaterial
      renderer.setRenderTarget(this._sdfRT)
      _quadMesh.render(renderer)
      endDebugPass(renderer)
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
   * Seed pass — classifies each texel by occluder alpha (threshold 0.5
   * to clamp sub-pixel / anti-aliased edges to a clean binary mask) and
   * writes two seed UVs packed into RGBA:
   *
   *   (R, G) = occluder fragments seed their own UV, empty fragments
   *            seed a FAR sentinel. JFA converges this to "nearest-
   *            occluder seed UV" at every fragment.
   *   (B, A) = empty fragments seed their own UV, occluder fragments
   *            seed FAR. JFA converges to "nearest-empty-space seed UV"
   *            at every fragment.
   *
   * One material, one draw, both chains propagated in parallel through
   * the JFA pass.
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
      const hasOccluder = alpha.greaterThan(float(0.5))
      const outsideSeed = hasOccluder.select(fragUV, vec2(FAR, FAR))
      const insideSeed = hasOccluder.select(vec2(FAR, FAR), fragUV)
      return vec4(outsideSeed.x, outsideSeed.y, insideSeed.x, insideSeed.y)
    })() as Node<'vec4'>
    this._seedMaterial = mat
  }

  /**
   * JFA propagation material. For each fragment, tests 9 neighbor texels
   * at `jumpSize` UV distance and updates BOTH the outside and inside
   * best-seed records in parallel. One texture sample per neighbor
   * (identical bandwidth to the pre-signed single-chain design); two
   * distance comparisons and two conditional updates per neighbor (cheap
   * ALU relative to the sample cost).
   *
   * UV diffs are weighted by world size so the sphere-trace distance
   * comparison is isotropic on non-square viewports — UV-space comparison
   * on a rectangular RT would pick an anisotropic winner and squash the
   * SDF along one axis.
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

      const currentOutsideSeed = vec2(currentData.r, currentData.g)
      const currentOutsideDiff = fragUV.sub(currentOutsideSeed).mul(worldSize)
      const bestOutsideSeed = currentOutsideSeed.toVar()
      const bestOutsideDist = currentOutsideDiff.dot(currentOutsideDiff).toVar()

      const currentInsideSeed = vec2(currentData.b, currentData.a)
      const currentInsideDiff = fragUV.sub(currentInsideSeed).mul(worldSize)
      const bestInsideSeed = currentInsideSeed.toVar()
      const bestInsideDist = currentInsideDiff.dot(currentInsideDiff).toVar()

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const offset = vec2(float(dx), float(dy)).mul(float(jumpSize))
          const neighborUV = fragUV.add(offset)
          const neighborData = sampleTexture(sourceTex, neighborUV)

          const neighborOutsideSeed = vec2(neighborData.r, neighborData.g)
          const outsideDiff = fragUV.sub(neighborOutsideSeed).mul(worldSize)
          const outsideDist = outsideDiff.dot(outsideDiff)
          const isCloserOutside = outsideDist.lessThan(bestOutsideDist)
          bestOutsideDist.assign(isCloserOutside.select(outsideDist, bestOutsideDist))
          bestOutsideSeed.assign(isCloserOutside.select(neighborOutsideSeed, bestOutsideSeed))

          const neighborInsideSeed = vec2(neighborData.b, neighborData.a)
          const insideDiff = fragUV.sub(neighborInsideSeed).mul(worldSize)
          const insideDist = insideDiff.dot(insideDiff)
          const isCloserInside = insideDist.lessThan(bestInsideDist)
          bestInsideDist.assign(isCloserInside.select(insideDist, bestInsideDist))
          bestInsideSeed.assign(isCloserInside.select(neighborInsideSeed, bestInsideSeed))
        }
      }

      return vec4(bestOutsideSeed.x, bestOutsideSeed.y, bestInsideSeed.x, bestInsideSeed.y)
    })() as Node<'vec4'>
    return mat
  }

  /**
   * Final-distance material. Reads the packed converged seed UVs from
   * one texture and writes a signed distance:
   *
   *   distOutside = |fragUV - nearestOccluderSeedUV| in world units
   *   distInside  = |fragUV - nearestEmptySeedUV|    in world units
   *   signedDist  = distOutside - distInside
   *
   * Because the two terms never both exceed zero — a fragment either
   * sits in empty space (distOutside > 0, distInside = 0) or inside an
   * occluder (distOutside = 0, distInside > 0) — the subtraction yields
   * a clean signed output: positive outside, negative inside.
   *
   * G/B hold the outward-pointing world-space gradient (vector toward
   * the nearest occluder). Consumers use them as a direction hint;
   * magnitude is redundant with |R|.
   */
  private _buildFinalMaterial(sourceTex: Texture): NodeMaterial {
    const worldSize = this._worldSizeNode
    const mat = new NodeMaterial()
    mat.fragmentNode = Fn(() => {
      const fragUV = uv()
      const data = sampleTexture(sourceTex, fragUV)

      const outsideSeedUV = vec2(data.r, data.g)
      const outsideDiff = fragUV.sub(outsideSeedUV).mul(worldSize)
      const distOutside = outsideDiff.length()

      const insideSeedUV = vec2(data.b, data.a)
      const insideDiff = fragUV.sub(insideSeedUV).mul(worldSize)
      const distInside = insideDiff.length()

      const signedDist = distOutside.sub(distInside)
      return vec4(signedDist, outsideDiff.x, outsideDiff.y, float(1))
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
