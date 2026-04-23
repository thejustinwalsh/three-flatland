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
 * running JFA twice — once seeded on occluder texels (outside distance)
 * and once seeded on empty texels (inside distance) — and combining
 * them as `signedDist = distOutside - distInside`. Fragments outside
 * every occluder see positive distance to the nearest occluder;
 * fragments inside a caster see negative distance to the nearest edge.
 * This lets the shadow sphere-trace detect "ray originated inside a
 * caster" and "ray stepped into a caster" cleanly via `sdf < 0`,
 * without the hardcoded escape-offset workaround the unsigned SDF
 * required.
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

  // Render targets: two ping-pong pairs (outside + inside JFA chains),
  // scratch for separable blur, final SDF.
  private _pingOutsideRT: RenderTarget
  private _pongOutsideRT: RenderTarget
  private _pingInsideRT: RenderTarget
  private _pongInsideRT: RenderTarget
  private _sdfRT: RenderTarget
  private _sdfBlurRT: RenderTarget

  // Materials — one per pass / read-direction. `NodeMaterial` (not
  // `MeshBasicNodeMaterial`) matches the three.js TSL post-effect convention.
  private _seedMaterialOutside: NodeMaterial | null = null
  private _seedMaterialInside: NodeMaterial | null = null
  private _jfaMaterialOutsideA: NodeMaterial // reads outside ping → writes outside pong
  private _jfaMaterialOutsideB: NodeMaterial // reads outside pong → writes outside ping
  private _jfaMaterialInsideA: NodeMaterial // reads inside ping → writes inside pong
  private _jfaMaterialInsideB: NodeMaterial // reads inside pong → writes inside ping
  private _finalMaterialA: NodeMaterial // reads outside+inside ping → writes sdf
  private _finalMaterialB: NodeMaterial // reads outside+inside pong → writes sdf
  private _blurHMaterial: NodeMaterial // reads sdf  → writes sdfBlur
  private _blurVMaterial: NodeMaterial // reads sdfBlur → writes sdf

  // JFA step-size uniforms — shared across both chains since outside
  // and inside JFA run the same pass count with identical jump sizes.
  // Still one per read-direction so A and B materials don't fight
  // over the same uniform node.
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
    this._pingOutsideRT = new RenderTarget(1, 1, jfaOptions)
    this._pongOutsideRT = new RenderTarget(1, 1, jfaOptions)
    this._pingInsideRT = new RenderTarget(1, 1, jfaOptions)
    this._pongInsideRT = new RenderTarget(1, 1, jfaOptions)
    this._sdfRT = new RenderTarget(1, 1, sdfOptions)
    this._sdfBlurRT = new RenderTarget(1, 1, sdfOptions)

    for (const rt of [
      this._pingOutsideRT,
      this._pongOutsideRT,
      this._pingInsideRT,
      this._pongInsideRT,
      this._sdfRT,
      this._sdfBlurRT,
    ]) {
      rt.texture.wrapS = ClampToEdgeWrapping
      rt.texture.wrapT = ClampToEdgeWrapping
    }

    // Build pass materials once. TSL captures the RT textures at construction
    // time; the RT references are stable across `setSize`, so these never
    // need rebuilding.
    this._jfaMaterialOutsideA = this._buildJFAMaterial(this._pingOutsideRT.texture, this._jumpSizeA)
    this._jfaMaterialOutsideB = this._buildJFAMaterial(this._pongOutsideRT.texture, this._jumpSizeB)
    this._jfaMaterialInsideA = this._buildJFAMaterial(this._pingInsideRT.texture, this._jumpSizeA)
    this._jfaMaterialInsideB = this._buildJFAMaterial(this._pongInsideRT.texture, this._jumpSizeB)
    this._finalMaterialA = this._buildFinalMaterial(
      this._pingOutsideRT.texture,
      this._pingInsideRT.texture
    )
    this._finalMaterialB = this._buildFinalMaterial(
      this._pongOutsideRT.texture,
      this._pongInsideRT.texture
    )
    this._blurHMaterial = this._buildBlurMaterial(this._sdfRT.texture, 'horizontal')
    this._blurVMaterial = this._buildBlurMaterial(this._sdfBlurRT.texture, 'vertical')

    // Preview mode (thumbnail vs full-size stream) is now a per-consumer
    // runtime choice; no downsample cap at registration.
    registerDebugTexture('sdf.jfaPingOutside', this._pingOutsideRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA outside ping buffer',
    })
    registerDebugTexture('sdf.jfaPongOutside', this._pongOutsideRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA outside pong buffer',
    })
    registerDebugTexture('sdf.jfaPingInside', this._pingInsideRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA inside ping buffer',
    })
    registerDebugTexture('sdf.jfaPongInside', this._pongInsideRT, 'rgba16f', {
      display: 'normalize',
      label: 'JFA inside pong buffer',
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
    this._pingOutsideRT.setSize(width, height)
    this._pongOutsideRT.setSize(width, height)
    this._pingInsideRT.setSize(width, height)
    this._pongInsideRT.setSize(width, height)
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
    this._ensureSeedMaterials(occlusionRT.texture)

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState)

    try {
      const maxDim = Math.max(this._pingOutsideRT.width, this._pingOutsideRT.height)
      const passes = Math.ceil(Math.log2(maxDim))

      // Seed both chains. Outside = occluder texels are seeds (→ dist
      // to nearest occluder). Inside = empty texels are seeds (→ dist
      // to nearest empty space, nonzero only inside occluders).
      beginDebugPass('sdf.seedOutside', renderer)
      _quadMesh.material = this._seedMaterialOutside!
      renderer.setRenderTarget(this._pingOutsideRT)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      beginDebugPass('sdf.seedInside', renderer)
      _quadMesh.material = this._seedMaterialInside!
      renderer.setRenderTarget(this._pingInsideRT)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      // JFA ping-pong with halving jump sizes. Two chains run back-to-
      // back (outside, then inside). Grouped under `sdf.jfa*` spans so
      // the panel collapses the ~11 iterations each into single
      // totaling rows. Jump-size uniforms are shared across chains —
      // each pass rewrites the uniform right before binding, so there
      // is no cross-talk between chains.
      beginDebugPass('sdf.jfaOutside', renderer)
      let readPing = true
      for (let i = 0; i < passes; i++) {
        const jumpSize = Math.pow(2, passes - 1 - i) / maxDim
        if (readPing) {
          this._jumpSizeA.value = jumpSize
          _quadMesh.material = this._jfaMaterialOutsideA
          renderer.setRenderTarget(this._pongOutsideRT)
        } else {
          this._jumpSizeB.value = jumpSize
          _quadMesh.material = this._jfaMaterialOutsideB
          renderer.setRenderTarget(this._pingOutsideRT)
        }
        _quadMesh.render(renderer)
        readPing = !readPing
      }
      endDebugPass(renderer)

      beginDebugPass('sdf.jfaInside', renderer)
      let readPingInside = true
      for (let i = 0; i < passes; i++) {
        const jumpSize = Math.pow(2, passes - 1 - i) / maxDim
        if (readPingInside) {
          this._jumpSizeA.value = jumpSize
          _quadMesh.material = this._jfaMaterialInsideA
          renderer.setRenderTarget(this._pongInsideRT)
        } else {
          this._jumpSizeB.value = jumpSize
          _quadMesh.material = this._jfaMaterialInsideB
          renderer.setRenderTarget(this._pingInsideRT)
        }
        _quadMesh.render(renderer)
        readPingInside = !readPingInside
      }
      endDebugPass(renderer)

      // Final distance pass — combines outside + inside converged seed
      // UVs into a signed distance field. Both chains run the same
      // pass count, so they end on the same parity — one final
      // material handles both source reads.
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
    unregisterDebugTexture('sdf.jfaPingOutside')
    unregisterDebugTexture('sdf.jfaPongOutside')
    unregisterDebugTexture('sdf.jfaPingInside')
    unregisterDebugTexture('sdf.jfaPongInside')
    unregisterDebugTexture('sdf.distanceField')
    unregisterDebugTexture('sdf.blurScratch')
    this._pingOutsideRT.dispose()
    this._pongOutsideRT.dispose()
    this._pingInsideRT.dispose()
    this._pongInsideRT.dispose()
    this._sdfRT.dispose()
    this._sdfBlurRT.dispose()
    this._seedMaterialOutside?.dispose()
    this._seedMaterialInside?.dispose()
    this._jfaMaterialOutsideA.dispose()
    this._jfaMaterialOutsideB.dispose()
    this._jfaMaterialInsideA.dispose()
    this._jfaMaterialInsideB.dispose()
    this._finalMaterialA.dispose()
    this._finalMaterialB.dispose()
    this._blurHMaterial.dispose()
    this._blurVMaterial.dispose()
  }

  /**
   * Build the outside + inside seed materials. Outside seeds occluder
   * texels (so the JFA converges on "distance to nearest occluder" at
   * every fragment). Inside seeds empty texels (so the JFA converges
   * on "distance to nearest empty space" at every fragment — nonzero
   * only for fragments inside an occluder). Both rebuild together
   * whenever the input texture reference changes.
   *
   * The 0.5 alpha threshold clamps sub-pixel sprite positioning and
   * anti-aliased edges to a clean binary mask, so outside and inside
   * use exactly the same silhouette interpretation.
   */
  private _ensureSeedMaterials(occlusionTexture: Texture): void {
    if (
      this._occlusionTex === occlusionTexture &&
      this._seedMaterialOutside &&
      this._seedMaterialInside
    ) {
      return
    }
    this._occlusionTex = occlusionTexture
    this._seedMaterialOutside?.dispose()
    this._seedMaterialInside?.dispose()

    const FAR = float(9999)

    // Outside: occluder fragments seed their own UV; empty fragments
    // seed a sentinel far value (the JFA will then find the real
    // nearest-occluder seed at every empty fragment).
    const matOutside = new NodeMaterial()
    matOutside.fragmentNode = Fn(() => {
      const fragUV = uv()
      const alpha = sampleTexture(occlusionTexture, fragUV).a
      const hasOccluder = alpha.greaterThan(float(0.5))
      const seedUV = hasOccluder.select(fragUV, vec2(FAR, FAR))
      return vec4(seedUV.x, seedUV.y, float(0), float(1))
    })() as Node<'vec4'>
    this._seedMaterialOutside = matOutside

    // Inside: empty fragments seed their own UV; occluder fragments
    // seed a sentinel far value (the JFA finds nearest-empty-space
    // seed, which is exactly "distance to the occluder edge" for
    // fragments inside an occluder).
    const matInside = new NodeMaterial()
    matInside.fragmentNode = Fn(() => {
      const fragUV = uv()
      const alpha = sampleTexture(occlusionTexture, fragUV).a
      const isEmpty = alpha.lessThanEqual(float(0.5))
      const seedUV = isEmpty.select(fragUV, vec2(FAR, FAR))
      return vec4(seedUV.x, seedUV.y, float(0), float(1))
    })() as Node<'vec4'>
    this._seedMaterialInside = matInside
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
      // Anonymous toVar — TSL auto-names to avoid collisions across the
      // pair of JFA materials (A reads ping, B reads pong) that build
      // into the same shader namespace.
      const bestSeed = currentSeedUV.toVar()
      const bestDist = currentDiff.dot(currentDiff).toVar()

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
   * Final-distance material. Reads the converged seed UV from BOTH the
   * outside and inside JFA chains at each fragment and writes a signed
   * distance: positive = distance to nearest occluder (fragment is in
   * empty space); negative = -distance to nearest empty space (fragment
   * is inside an occluder). The two terms never both exceed zero — a
   * fragment either sits in empty space (distOutside > 0, distInside =
   * 0) or inside an occluder (distOutside = 0, distInside > 0) — so
   * `distOutside - distInside` gives a clean signed output.
   *
   * G/B hold the outward-pointing world-space gradient from the OUTSIDE
   * chain (vector toward the nearest occluder). Consumers use them as a
   * direction hint; magnitude is redundant with |R|.
   */
  private _buildFinalMaterial(outsideTex: Texture, insideTex: Texture): NodeMaterial {
    const worldSize = this._worldSizeNode
    const mat = new NodeMaterial()
    mat.fragmentNode = Fn(() => {
      const fragUV = uv()

      const outsideData = sampleTexture(outsideTex, fragUV)
      const outsideSeedUV = vec2(outsideData.r, outsideData.g)
      const outsideDiff = fragUV.sub(outsideSeedUV).mul(worldSize)
      const distOutside = outsideDiff.length()

      const insideData = sampleTexture(insideTex, fragUV)
      const insideSeedUV = vec2(insideData.r, insideData.g)
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
