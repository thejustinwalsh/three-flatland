import {
  RenderTarget,
  type Scene,
  type Camera,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  type ColorRepresentation,
  Color,
  NearestFilter,
  LinearFilter,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { registerDebugTexture, unregisterDebugTexture } from '../debug/debug-sink'
import {
  Fn,
  uv,
  vec2,
  vec4,
  float,
  select,
  attribute,
  texture as sampleTexture,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { readCastShadowFlag } from './wrapWithLightFlags'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

/**
 * Optional construction knobs for {@link OcclusionPass}.
 */
export interface OcclusionPassOptions {
  /**
   * Resolution multiplier relative to the main viewport (0 < x <= 1).
   * The SDF is derived from this RT, so lower values trade shadow fidelity
   * for shadow cost. Default: 0.5 (half resolution each axis).
   */
  resolutionScale?: number
  /** Clear color for the RT. Default: transparent black. */
  clearColor?: ColorRepresentation
  /** Clear alpha. Default: 0. */
  clearAlpha?: number
  /**
   * Use NearestFilter on the RT texture instead of LinearFilter. SDF seeding
   * reads via NearestFilter in `SDFGenerator`, so this matches the default
   * consumer. Switch to linear only if a custom consumer needs it.
   */
  nearestFilter?: boolean
}

/**
 * Offscreen pre-pass that produces an occluder-silhouette render target for
 * the SDF shadow pipeline.
 *
 * Owns:
 * - A {@link RenderTarget} sized to `resolutionScale * viewport`.
 * - No material — renders the host scene with the scene's own sprite
 *   materials. The SDF JFA consumes the RT's alpha channel only, so sprite
 *   color output is discarded downstream. This keeps per-sprite opt-out
 *   (eventually via `castShadow`) bindable through the existing material
 *   path without requiring a scene-wide override material that loses
 *   per-object texture bindings in TSL.
 *
 * **Limitation (deliberate):** every rendered mesh currently contributes
 * its alpha to the SDF seed. A follow-up commit propagates the Object3D
 * `castShadow` flag through the batched sprite attribute buffers so
 * non-casters write alpha = 0 from inside the sprite material. Tracked in
 * `planning/experiments/SDF-Shadow-Plumbing.md` as the T2 follow-up.
 */
export class OcclusionPass {
  private _resolutionScale: number
  private _clearColor: Color
  private _clearAlpha: number

  private _rt: RenderTarget
  private _width = 1
  private _height = 1

  /**
   * Per-source-texture occlusion material cache. Each SpriteBatch that feeds
   * the pass has its own source texture (sprite atlas); we mint an
   * occlusion material once per texture and reuse it across frames.
   */
  private _occlusionMaterials = new Map<Texture, MeshBasicNodeMaterial>()

  /**
   * Reusable arrays for the per-frame material-swap dance. Never reallocated
   * — only `length = 0` + push — so the render path stays zero-alloc past
   * warmup, matching the perf conventions in Sprite2D / transformSyncSystem.
   */
  private _swappedMeshes: Mesh[] = []
  private _swappedOriginals: Material[] = []

  /**
   * Meshes hidden for the duration of the occlusion pass because their
   * geometry lacks the `effectBuf0` instance attribute the occlusion shader
   * needs (e.g. tilemap chunks, which share Sprite2DMaterial but don't
   * allocate effect buffers). They can't per-instance cast shadows anyway.
   */
  private _hiddenMeshes: Mesh[] = []

  constructor(options: OcclusionPassOptions = {}) {
    this._resolutionScale = options.resolutionScale ?? 0.5
    this._clearColor = new Color(options.clearColor ?? 0x000000)
    this._clearAlpha = options.clearAlpha ?? 0

    this._rt = new RenderTarget(this._width, this._height, {
      depthBuffer: false,
      stencilBuffer: false,
    })
    const filter = options.nearestFilter ?? true ? NearestFilter : LinearFilter
    this._rt.texture.minFilter = filter
    this._rt.texture.magFilter = filter

    registerDebugTexture('occlusion.mask', this._rt, 'rgba8', {
      display: 'alpha',
      label: 'Occlusion mask',
      maxDim: 0,
    })
  }

  /** The render target whose `texture.a` is the occluder silhouette. */
  get renderTarget(): RenderTarget {
    return this._rt
  }

  get resolutionScale(): number {
    return this._resolutionScale
  }

  get width(): number {
    return this._width
  }

  get height(): number {
    return this._height
  }

  /**
   * Resize the RT to match `viewportWidth × viewportHeight * resolutionScale`.
   * Cheap when the size hasn't changed. Clamped to a 1×1 minimum so
   * instantiation-before-first-render never hits a zero-size GPU resource.
   */
  resize(viewportWidth: number, viewportHeight: number): void {
    const w = Math.max(1, Math.floor(viewportWidth * this._resolutionScale))
    const h = Math.max(1, Math.floor(viewportHeight * this._resolutionScale))
    if (w === this._width && h === this._height) return
    this._width = w
    this._height = h
    this._rt.setSize(w, h)
  }

  /**
   * Render `scene` with `camera` into the occlusion RT. Every mesh whose
   * material is a {@link Sprite2DMaterial} has its material temporarily
   * swapped to a per-texture occlusion variant that samples the sprite's
   * alpha and masks it by the per-instance `castsShadow` bit in
   * `effectBuf0.x`. Non-casters contribute alpha = 0 to the SDF seed;
   * casters contribute their silhouette alpha unchanged.
   *
   * Non-sprite meshes render with their own materials. That's usually
   * harmless (background meshes don't emit alpha) but callers who mix in
   * custom materials can park them on a dedicated layer that the occlusion
   * camera excludes.
   *
   * Saves and restores renderer render target and scene.background so the
   * caller's subsequent main-scene render sees no side effects.
   */
  render(renderer: WebGPURenderer, scene: Scene, camera: Camera): void {
    const prevRT = renderer.getRenderTarget()
    const prevBackground = scene.background

    // Swap in occlusion materials for any Sprite2DMaterial we find. The
    // original materials are stashed in parallel arrays (not an object
    // literal) to keep the traverse callback allocation-free.
    this._swappedMeshes.length = 0
    this._swappedOriginals.length = 0
    this._hiddenMeshes.length = 0
    scene.traverse(this._collectAndSwap)

    // Clear color/alpha are deliberately NOT restored — Flatland.render
    // sets them per-frame immediately after the pre-pass, so round-tripping
    // the Color4 (which isn't part of the public three type export) would
    // add complexity without changing observable behaviour.
    try {
      scene.background = null
      renderer.setRenderTarget(this._rt)
      renderer.setClearColor(this._clearColor.getHex(), this._clearAlpha)
      renderer.clear(true, false, false)
      renderer.render(scene, camera)
    } finally {
      // Restore original materials in reverse order so the arrays can clear
      // via `length = 0` without per-element delete overhead.
      for (let i = this._swappedMeshes.length - 1; i >= 0; i--) {
        this._swappedMeshes[i]!.material = this._swappedOriginals[i]!
      }
      this._swappedMeshes.length = 0
      this._swappedOriginals.length = 0

      for (let i = this._hiddenMeshes.length - 1; i >= 0; i--) {
        this._hiddenMeshes[i]!.visible = true
      }
      this._hiddenMeshes.length = 0

      scene.background = prevBackground
      renderer.setRenderTarget(prevRT)
    }
  }

  /**
   * Traverse callback bound once so `scene.traverse` doesn't re-box it
   * every frame. Reads `this._swappedMeshes` / `_swappedOriginals` /
   * `_occlusionMaterials` via arrow-function closure.
   */
  private _collectAndSwap = (obj: Object3D): void => {
    const mesh = obj as Mesh
    if (!(mesh as { isMesh?: boolean }).isMesh) return
    const current = mesh.material
    if (Array.isArray(current)) return
    if (!(current instanceof Sprite2DMaterial)) return

    // The occlusion shader reads `effectBuf0` per instance. Meshes that
    // share Sprite2DMaterial but bypass the EffectMaterial attribute setup
    // (notably TileLayer chunks) don't have effectBuf0 on their geometry
    // — rendering them here triggers a TSL "attribute not found" warning
    // and can't contribute meaningful shadow data anyway. Hide them for
    // the duration of the pass and restore afterwards.
    if (!mesh.geometry.getAttribute('effectBuf0')) {
      if (mesh.visible) {
        mesh.visible = false
        this._hiddenMeshes.push(mesh)
      }
      return
    }

    const texture = current.getTexture()
    if (!texture) return

    const occlusion = this._getOrCreateOcclusionMaterial(texture)
    this._swappedMeshes.push(mesh)
    this._swappedOriginals.push(current)
    mesh.material = occlusion
  }

  private _getOrCreateOcclusionMaterial(texture: Texture): MeshBasicNodeMaterial {
    const cached = this._occlusionMaterials.get(texture)
    if (cached) return cached
    const material = buildOcclusionMaterial(texture)
    this._occlusionMaterials.set(texture, material)
    return material
  }

  dispose(): void {
    unregisterDebugTexture('occlusion.mask')
    this._rt.dispose()
    for (const mat of this._occlusionMaterials.values()) mat.dispose()
    this._occlusionMaterials.clear()
  }
}

/**
 * Construct the TSL occlusion material for a given sprite atlas texture.
 *
 * Shader responsibilities (fragment):
 *   1. Replicate Sprite2DMaterial's instance-UV flip + atlas remap so each
 *      sprite samples its own frame out of the shared atlas.
 *   2. Sample the alpha channel of the atlas at the remapped UV.
 *   3. Read `castsShadow` (bit 2 of `effectBuf0.x`) per instance; multiply
 *      sampled alpha by 1 when set, 0 when clear.
 *   4. Output `vec4(0, 0, 0, alpha * castMask)`.
 *
 * Output RGB is deliberately zero — the SDF JFA seed pass only consumes
 * alpha, so no color bandwidth is spent on the occlusion silhouette.
 *
 * **Maintenance note:** the UV remap mirrors the logic in
 * `Sprite2DMaterial._buildBaseColor`. If the instance attribute shape
 * changes (e.g., adding instanceUVOffset) this material must be updated
 * in lockstep — there is no shared helper yet. Revisit if we grow a
 * second consumer of the same UV math.
 */
function buildOcclusionMaterial(texture: Texture): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true })
  material.colorNode = Fn(() => {
    const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
    const instanceFlip = attribute<'vec2'>('instanceFlip', 'vec2')

    const baseUV = uv()
    const flippedUV = vec2(
      select(instanceFlip.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
      select(instanceFlip.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
    )
    const atlasUV = flippedUV
      .mul(vec2(instanceUV.z, instanceUV.w))
      .add(vec2(instanceUV.x, instanceUV.y))

    const alpha = sampleTexture(texture, atlasUV).a
    const casts = readCastShadowFlag()
    const mask = select(casts, float(1), float(0))
    return vec4(float(0), float(0), float(0), alpha.mul(mask))
  })() as Node<'vec4'>

  return material
}
