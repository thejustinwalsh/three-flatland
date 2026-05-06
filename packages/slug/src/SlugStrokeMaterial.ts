import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Vector2, Vector4, Color, Matrix4, FrontSide, NormalBlending } from 'three'
import type { Camera, Object3D } from 'three'
import { Fn, float, sign, vec2, vec3, vec4, attribute, uniform, varyingProperty } from 'three/tsl'
import { slugStroke } from './shaders/slugStroke'
import { slugDilate } from './shaders/slugDilate'
import type { SlugFont } from './SlugFont'

export interface SlugStrokeMaterialOptions {
  color?: number | Color
  opacity?: number
  transparent?: boolean
  /** Stroke half-width in em-space. Runtime-uniform. Default 0.025 (≈0.05 em total width). */
  strokeHalfWidth?: number
}

const _mvp = new Matrix4()

/**
 * Phase 4 stroke material — pairs with `slugStroke` fragment shader.
 *
 * Parallels `SlugMaterial` in every way except the fragment path: quad
 * dilation is extended by `strokeHalfWidth` in object space (so the
 * stroke's outer ring doesn't get clipped by the glyph bbox), and the
 * fragment shader evaluates analytic distance-to-curve instead of
 * winding-number coverage.
 *
 * Phase 5 will extend this material with `joinStyle` / `miterLimit` /
 * `capStyle` uniforms (reserved here as private slots pre-declared but
 * not yet plumbed into the shader). Adding them later is strictly
 * additive — the material API surface announced today (color, opacity,
 * strokeHalfWidth) is the Phase 4 contract.
 */
export class SlugStrokeMaterial extends MeshBasicNodeMaterial {
  private _font: SlugFont
  private _colorUniform
  private _opacityUniform
  private _viewportUniform
  private _mvpRow0Uniform
  private _mvpRow1Uniform
  private _mvpRow3Uniform
  private _strokeHalfWidthUniform

  constructor(font: SlugFont, options: SlugStrokeMaterialOptions = {}) {
    super()

    this._font = font

    const color =
      options.color instanceof Color ? options.color : new Color(options.color ?? 0x000000)

    this._colorUniform = uniform(color)
    this._opacityUniform = uniform(options.opacity ?? 1.0)
    this._viewportUniform = uniform(new Vector2(1, 1))
    this._mvpRow0Uniform = uniform(new Vector4(1, 0, 0, 0))
    this._mvpRow1Uniform = uniform(new Vector4(0, 1, 0, 0))
    this._mvpRow3Uniform = uniform(new Vector4(0, 0, 0, 1))
    this._strokeHalfWidthUniform = uniform(options.strokeHalfWidth ?? 0.025)

    this.transparent = options.transparent ?? true
    this.side = FrontSide
    this.depthWrite = false
    this.blending = NormalBlending

    this._buildShader()
  }

  private _buildShader(): void {
    const font = this._font

    const glyphPos = attribute<'vec4'>('glyphPos', 'vec4')
    const glyphTex = attribute<'vec4'>('glyphTex', 'vec4')
    const glyphJac = attribute<'vec4'>('glyphJac', 'vec4')
    const glyphBand = attribute<'vec4'>('glyphBand', 'vec4')
    const glyphColorAttr = attribute<'vec4'>('glyphColor', 'vec4')
    const basePos = attribute<'vec3'>('position', 'vec3')

    const vRenderCoord = varyingProperty('vec2', 'vRenderCoord')
    const vGlyphLocX = varyingProperty('float', 'vGlyphLocX')
    const vGlyphLocY = varyingProperty('float', 'vGlyphLocY')
    const vNumHBands = varyingProperty('float', 'vNumHBands')
    const vNumVBands = varyingProperty('float', 'vNumVBands')

    const curveTexture = font.curveTexture
    const bandTexture = font.bandTexture
    const colorUniform = this._colorUniform
    const opacityUniform = this._opacityUniform
    const viewportUniform = this._viewportUniform
    const mvpRow0 = this._mvpRow0Uniform
    const mvpRow1 = this._mvpRow1Uniform
    const mvpRow3 = this._mvpRow3Uniform
    const strokeHalfWidthUniform = this._strokeHalfWidthUniform

    this.positionNode = Fn(() => {
      const center = vec2(glyphPos.x, glyphPos.y)
      const halfSize = vec2(glyphPos.z, glyphPos.w)

      // Object-space corner position before stroke expansion.
      const baseObjPos = vec2(
        center.x.add(basePos.x.mul(halfSize.x.mul(2.0))),
        center.y.add(basePos.y.mul(halfSize.y.mul(2.0)))
      )

      const emCenter = vec2(glyphTex.x, glyphTex.y)
      const invScale = glyphJac.x
      const emHalfW = halfSize.x.mul(invScale)
      const emHalfH = halfSize.y.mul(invScale)
      const baseEmCoord = vec2(
        emCenter.x.add(basePos.x.mul(emHalfW.mul(2.0))),
        emCenter.y.add(basePos.y.mul(emHalfH.mul(2.0)))
      )

      // Axis-aligned stroke expansion. Every vertex pushes outward by
      // strokeHalfWidth (em-space) along each axis independently, signed
      // by its basePos quadrant. That grows the full (W × H) quad to
      // (W + 2·halfWidth) × (H + 2·halfWidth) regardless of aspect
      // ratio — vs. unit-normal dilation which under-expands the axes
      // at corners (diagonal normal only delivers halfWidth/√2 along
      // each axis, visibly clipping the stroke's outer ring at glyph
      // extents).
      const strokeEm = strokeHalfWidthUniform
      const strokeObj = strokeEm.div(invScale)
      const signX = sign(basePos.x)
      const signY = sign(basePos.y)

      const expandedObjPos = vec2(
        baseObjPos.x.add(signX.mul(strokeObj)),
        baseObjPos.y.add(signY.mul(strokeObj))
      )
      const expandedEmCoord = vec2(
        baseEmCoord.x.add(signX.mul(strokeEm)),
        baseEmCoord.y.add(signY.mul(strokeEm))
      )

      // Outward normal from center to the expanded corner — used by
      // slugDilate for the uniform half-pixel AA margin on top of the
      // stroke expansion.
      const expandedNormal = vec2(
        basePos.x.mul(halfSize.x.mul(2.0).add(signX.mul(strokeObj))),
        basePos.y.mul(halfSize.y.mul(2.0).add(signY.mul(strokeObj)))
      )

      const dilated = slugDilate(
        expandedObjPos,
        expandedNormal,
        expandedEmCoord,
        invScale,
        mvpRow0,
        mvpRow1,
        mvpRow3,
        viewportUniform
      )

      vRenderCoord.assign(dilated.texcoord)
      vGlyphLocX.assign(glyphTex.z)
      vGlyphLocY.assign(glyphTex.w)
      vNumHBands.assign(glyphJac.z)
      vNumVBands.assign(glyphJac.w)

      return vec3(dilated.vpos.x, dilated.vpos.y, float(0.0))
    })() as typeof this.positionNode

    this.colorNode = Fn(() => {
      const renderCoord = vRenderCoord

      // Rect sentinel: `vNumVBands < 0` means this instance is a solid
      // decoration rectangle (underline, strike). Those shouldn't get
      // stroked — short-circuit to zero coverage so decorations render
      // only via the fill pass.
      const isRect = vNumVBands.lessThan(float(0))

      const coverage = slugStroke(
        curveTexture,
        bandTexture,
        renderCoord,
        vGlyphLocX,
        vGlyphLocY,
        vNumHBands,
        vNumVBands,
        glyphBand,
        strokeHalfWidthUniform
      )

      const finalCoverage = isRect.select(float(0.0), coverage)

      return vec4(
        colorUniform.x.mul(glyphColorAttr.x),
        colorUniform.y.mul(glyphColorAttr.y),
        colorUniform.z.mul(glyphColorAttr.z),
        finalCoverage.mul(glyphColorAttr.w).mul(opacityUniform)
      )
    })() as typeof this.colorNode
  }

  /** Update the MVP matrix uniforms — call every frame before render. */
  updateMVP(object: Object3D, camera: Camera): void {
    _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _mvp.multiply(object.matrixWorld)

    const e = _mvp.elements
    this._mvpRow0Uniform.value.set(e[0], e[4], e[8], e[12])
    this._mvpRow1Uniform.value.set(e[1], e[5], e[9], e[13])
    this._mvpRow3Uniform.value.set(e[3], e[7], e[11], e[15])
  }

  setViewportSize(width: number, height: number): void {
    this._viewportUniform.value.set(width, height)
  }

  setColor(value: Color | number): void {
    const c = value instanceof Color ? value : new Color(value)
    this._colorUniform.value.copy(c)
  }

  setOpacity(value: number): void {
    this._opacityUniform.value = value
  }

  setStrokeHalfWidth(value: number): void {
    this._strokeHalfWidthUniform.value = value
  }

  get font(): SlugFont {
    return this._font
  }
}
