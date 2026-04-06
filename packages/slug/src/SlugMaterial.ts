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
  vec4,
  attribute,
  uniform,
  bool,
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
  private _evenOdd: boolean
  private _weightBoost: boolean

  constructor(font: SlugFont, options: SlugMaterialOptions = {}) {
    super()

    this._font = font
    this._evenOdd = options.evenOdd ?? false
    this._weightBoost = options.weightBoost ?? false

    const color = options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)

    this._colorUniform = uniform(color)
    this._opacityUniform = uniform(options.opacity ?? 1.0)
    this._viewportUniform = uniform(new Vector2(1, 1))
    this._mvpRow0Uniform = uniform(new Vector4(1, 0, 0, 0))
    this._mvpRow1Uniform = uniform(new Vector4(0, 1, 0, 0))
    this._mvpRow3Uniform = uniform(new Vector4(0, 0, 0, 1))

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

      // Write dilated em-space coordinate to varying for fragment shader
      vRenderCoord.assign(dilated.texcoord)

      // Pass per-glyph metadata through varyings
      vGlyphLocX.assign(glyphTex.z)
      vGlyphLocY.assign(glyphTex.w)
      vNumHBands.assign(glyphJac.z)
      vNumVBands.assign(glyphJac.w)

      return vec4(dilated.vpos.x, dilated.vpos.y, float(0.0), float(1.0))
    })()

    // --- Fragment shader ---
    this.colorNode = Fn(() => {
      // Read dilated em-space coordinate from varying (interpolated from vertex)
      const renderCoord = vRenderCoord

      // Read per-glyph metadata from varyings
      const glyphLocX = vGlyphLocX
      const glyphLocY = vGlyphLocY
      const numHBands = vNumHBands
      const numVBands = vNumVBands

      // Compute coverage via Slug algorithm
      const coverage = slugRender(
        curveTexture,
        bandTexture,
        renderCoord,
        glyphLocX,
        glyphLocY,
        numHBands,
        numVBands,
        glyphBand,
        evenOddNode,
        weightBoostNode,
      )

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

  get font(): SlugFont {
    return this._font
  }
}
