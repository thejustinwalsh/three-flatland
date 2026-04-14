import {
  RenderTarget,
  type Scene,
  type Camera,
  type ColorRepresentation,
  Color,
  NearestFilter,
  LinearFilter,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'

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
   * Render `scene` with `camera` into the occlusion RT. Saves and restores
   * the renderer's render target, scene background, and clear state so the
   * caller's subsequent main-scene render sees no side effects.
   */
  render(renderer: WebGPURenderer, scene: Scene, camera: Camera): void {
    const prevRT = renderer.getRenderTarget()
    const prevBackground = scene.background

    // Clear color/alpha are deliberately NOT restored — Flatland.render sets
    // them per-frame immediately after the pre-pass, so round-tripping the
    // Color4 (which isn't part of the public three type export) would add
    // complexity without changing observable behaviour.
    try {
      scene.background = null
      renderer.setRenderTarget(this._rt)
      renderer.setClearColor(this._clearColor.getHex(), this._clearAlpha)
      renderer.clear(true, false, false)
      renderer.render(scene, camera)
    } finally {
      scene.background = prevBackground
      renderer.setRenderTarget(prevRT)
    }
  }

  dispose(): void {
    this._rt.dispose()
  }
}
