import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Vector2,
  Vector4,
  Color,
  Matrix4,
  FrontSide,
  NormalBlending,
} from 'three'
import type { Camera, Object3D } from 'three'
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  attribute,
  uniform,
  bool,
  round,
  dot,
  select,
  fwidth,
  varyingProperty,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { slugRender } from './shaders/slugFragment.js'
import { slugDilate } from './shaders/slugDilate.js'
import type { SlugFont } from './SlugFont.js'

export interface SlugMaterialOptions {
  color?: number | Color
  opacity?: number
  evenOdd?: boolean
  weightBoost?: boolean
  transparent?: boolean
  /** Stem darkening strength. 0 = off, ~0.4 = subtle, ~1.0 = strong. Default 0. */
  stemDarken?: number
  /** Thickening strength for small text. 0 = off, ~1.5 = default. Widens coverage at low ppem. */
  thicken?: number
  /** Enable 2x2 supersampling for smoother edges (expensive). Default false. */
  supersample?: boolean
  /** Snap glyph positions to pixel grid for crisp small text. Default true. */
  pixelSnap?: boolean
}

const _mvp = new Matrix4()

/**
 * NodeMaterial implementing the Slug font rendering algorithm.
 *
 * Vertex stage: positions instanced glyph quads with dynamic dilation.
 * Fragment stage: evaluates winding number from quadratic Bezier curves
 *   via dual-axis ray casting, producing antialiased coverage.
 */
export class SlugMaterial extends MeshBasicNodeMaterial {
  private _font: SlugFont
  private _colorUniform
  private _opacityUniform
  private _viewportUniform
  private _mvpRow0Uniform
  private _mvpRow1Uniform
  private _mvpRow3Uniform
  private _stemDarkenUniform
  private _thickenUniform
  private _evenOdd: boolean
  private _weightBoost: boolean
  private _supersample: boolean
  private _pixelSnap: boolean

  constructor(font: SlugFont, options: SlugMaterialOptions = {}) {
    super()

    this._font = font
    this._evenOdd = options.evenOdd ?? false
    this._weightBoost = options.weightBoost ?? false
    this._supersample = options.supersample ?? false
    this._pixelSnap = options.pixelSnap ?? true

    const color = options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)

    this._colorUniform = uniform(color)
    this._opacityUniform = uniform(options.opacity ?? 1.0)
    this._viewportUniform = uniform(new Vector2(1, 1))
    this._mvpRow0Uniform = uniform(new Vector4(1, 0, 0, 0))
    this._mvpRow1Uniform = uniform(new Vector4(0, 1, 0, 0))
    this._mvpRow3Uniform = uniform(new Vector4(0, 0, 0, 1))
    this._stemDarkenUniform = uniform(options.stemDarken ?? 0)
    this._thickenUniform = uniform(options.thicken ?? 0)

    this.transparent = options.transparent ?? true
    this.side = FrontSide
    this.depthWrite = false
    this.blending = NormalBlending

    this._buildShader()
  }

  private _buildShader(): void {
    const font = this._font

    // Instance attributes
    const glyphPos = attribute<'vec4'>('glyphPos', 'vec4')
    const glyphTex = attribute<'vec4'>('glyphTex', 'vec4')
    const glyphJac = attribute<'vec4'>('glyphJac', 'vec4')
    const glyphBand = attribute<'vec4'>('glyphBand', 'vec4')
    const glyphColorAttr = attribute<'vec4'>('glyphColor', 'vec4')
    const basePos = attribute<'vec3'>('position', 'vec3')

    // Varying: dilated em-space coordinate (vertex → fragment)
    const vRenderCoord = varyingProperty('vec2', 'vRenderCoord')
    // Varying: per-glyph data that needs flat interpolation equivalent
    const vGlyphLocX = varyingProperty('float', 'vGlyphLocX')
    const vGlyphLocY = varyingProperty('float', 'vGlyphLocY')
    const vNumHBands = varyingProperty('float', 'vNumHBands')
    const vNumVBands = varyingProperty('float', 'vNumVBands')

    // Capture for closures
    const curveTexture = font.curveTexture
    const bandTexture = font.bandTexture
    const evenOddNode = bool(this._evenOdd)
    const weightBoostNode = bool(this._weightBoost)
    const colorUniform = this._colorUniform
    const opacityUniform = this._opacityUniform
    const viewportUniform = this._viewportUniform
    const mvpRow0 = this._mvpRow0Uniform
    const mvpRow1 = this._mvpRow1Uniform
    const mvpRow3 = this._mvpRow3Uniform
    const stemDarkenUniform = this._stemDarkenUniform
    const thickenUniform = this._thickenUniform

    // --- Vertex shader ---
    this.positionNode = Fn(() => {
      const center = vec2(glyphPos.x, glyphPos.y)
      const halfSize = vec2(glyphPos.z, glyphPos.w)

      // Object-space position for this quad vertex
      const objPos = vec2(
        center.x.add(basePos.x.mul(halfSize.x.mul(2.0))),
        center.y.add(basePos.y.mul(halfSize.y.mul(2.0))),
      )

      // Outward normal: points from center toward this corner
      const normal = vec2(
        basePos.x.mul(halfSize.x.mul(2.0)),
        basePos.y.mul(halfSize.y.mul(2.0)),
      )

      // Em-space coordinate at this vertex (before dilation)
      const emCenter = vec2(glyphTex.x, glyphTex.y)
      const invScale = glyphJac.x
      const emHalfW = halfSize.x.mul(invScale)
      const emHalfH = halfSize.y.mul(invScale)
      const emCoord = vec2(
        emCenter.x.add(basePos.x.mul(emHalfW.mul(2.0))),
        emCenter.y.add(basePos.y.mul(emHalfH.mul(2.0))),
      )

      // Dynamic dilation — expands quad by half a pixel in screen space
      const dilated = slugDilate(
        objPos, normal, emCoord, invScale,
        mvpRow0, mvpRow1, mvpRow3, viewportUniform,
      )

      let finalPos = dilated.vpos
      let finalTex = dilated.texcoord

      // Pixel-grid snapping: snap glyph center to nearest pixel boundary.
      // Only applied to the center vertex offset (basePos = 0,0 doesn't exist,
      // but all 4 corners shift by the same amount since we snap the center).
      if (this._pixelSnap) {
        // Compute clip-space position using our MVP uniforms
        const clipX = dot(mvpRow0, vec4(finalPos.x, finalPos.y, float(0), float(1)))
        const clipY = dot(mvpRow1, vec4(finalPos.x, finalPos.y, float(0), float(1)))
        const clipW = dot(mvpRow3, vec4(finalPos.x, finalPos.y, float(0), float(1)))

        // NDC → pixel position
        const halfVP = viewportUniform.mul(0.5)
        const pixelX = clipX.div(clipW).mul(halfVP.x)
        const pixelY = clipY.div(clipW).mul(halfVP.y)

        // Snap to pixel grid and compute delta in pixel space
        const snapDeltaX = round(pixelX).sub(pixelX)
        const snapDeltaY = round(pixelY).sub(pixelY)

        // Convert pixel delta back to object space: delta_obj = delta_px / (mvp_scale * halfVP)
        // For ortho, mvp_scale is mvpRow0.x (X) and mvpRow1.y (Y)
        const objDeltaX = snapDeltaX.div(halfVP.x).mul(clipW).div(mvpRow0.x)
        const objDeltaY = snapDeltaY.div(halfVP.y).mul(clipW).div(mvpRow1.y)

        finalPos = vec2(finalPos.x.add(objDeltaX), finalPos.y.add(objDeltaY))
        finalTex = vec2(finalTex.x.add(objDeltaX.mul(invScale)), finalTex.y.add(objDeltaY.mul(invScale)))
      }

      // Write em-space coordinate to varying for fragment shader
      vRenderCoord.assign(finalTex)

      // Pass per-glyph metadata through varyings
      vGlyphLocX.assign(glyphTex.z)
      vGlyphLocY.assign(glyphTex.w)
      vNumHBands.assign(glyphJac.z)
      vNumVBands.assign(glyphJac.w)

      return vec3(finalPos.x, finalPos.y, float(0.0))
    })()

    // --- Fragment shader ---

    // Helper: evaluate slug coverage at a given em-space coordinate.
    // Captures all the texture/varying/uniform references from the closure.
    function evalCoverage(coord: Node<'vec2'>) {
      return slugRender(
        curveTexture,
        bandTexture,
        coord,
        vGlyphLocX,
        vGlyphLocY,
        vNumHBands,
        vNumVBands,
        glyphBand,
        evenOddNode,
        weightBoostNode,
        stemDarkenUniform,
        thickenUniform,
      )
    }

    const supersampleNode = bool(this._supersample)

    this.colorNode = Fn(() => {
      const renderCoord = vRenderCoord

      // Single-sample coverage (default path)
      const single = evalCoverage(renderCoord)

      // 2x2 supersampled coverage: evaluate at quarter-pixel offsets and average.
      // fwidth gives the em-space size of one pixel; mul(0.25) → quarter-pixel jitter.
      const hp = fwidth(renderCoord).mul(0.25)
      const ss = evalCoverage(renderCoord.add(hp.mul(vec2(-1, -1))))
        .add(evalCoverage(renderCoord.add(hp.mul(vec2(1, -1)))))
        .add(evalCoverage(renderCoord.add(hp.mul(vec2(-1, 1)))))
        .add(evalCoverage(renderCoord.add(hp.mul(vec2(1, 1)))))
        .mul(0.25)

      // Compile-time bool: dead-code eliminates the unused path
      const coverage = select(supersampleNode, ss, single)

      // Final color: glyph color * material color * coverage
      return vec4(
        colorUniform.x.mul(glyphColorAttr.x),
        colorUniform.y.mul(glyphColorAttr.y),
        colorUniform.z.mul(glyphColorAttr.z),
        coverage.mul(glyphColorAttr.w).mul(opacityUniform),
      )
    })()
  }

  /**
   * Update the MVP matrix uniforms for dilation.
   * Call before rendering each frame.
   */
  updateMVP(object: Object3D, camera: Camera): void {
    _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _mvp.multiply(object.matrixWorld)

    const e = _mvp.elements
    ;(this._mvpRow0Uniform.value as Vector4).set(e[0]!, e[4]!, e[8]!, e[12]!)
    ;(this._mvpRow1Uniform.value as Vector4).set(e[1]!, e[5]!, e[9]!, e[13]!)
    ;(this._mvpRow3Uniform.value as Vector4).set(e[3]!, e[7]!, e[11]!, e[15]!)
  }

  setViewportSize(width: number, height: number): void {
    ;(this._viewportUniform.value as Vector2).set(width, height)
  }

  setColor(value: Color | number): void {
    const c = value instanceof Color ? value : new Color(value)
    ;(this._colorUniform.value as Color).copy(c)
  }

  setOpacity(value: number): void {
    this._opacityUniform.value = value
  }

  setStemDarken(value: number): void {
    this._stemDarkenUniform.value = value
  }

  setThicken(value: number): void {
    this._thickenUniform.value = value
  }

  get font(): SlugFont {
    return this._font
  }
}
