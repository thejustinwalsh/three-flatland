import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Vector2,
  Color,
  FrontSide,
  NormalBlending,
} from 'three'
import {
  Fn,
  float,
  vec2,
  vec4,
  attribute,
  uniform,
  max,
  bool,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { slugRender } from './shaders/slugFragment.js'
import type { SlugFont } from './SlugFont.js'

export interface SlugMaterialOptions {
  color?: number | Color
  opacity?: number
  evenOdd?: boolean
  weightBoost?: boolean
  transparent?: boolean
}

/**
 * NodeMaterial implementing the Slug font rendering algorithm.
 *
 * Vertex stage: positions instanced glyph quads.
 * Fragment stage: evaluates winding number from quadratic Bezier curves
 *   via dual-axis ray casting, producing antialiased coverage.
 */
export class SlugMaterial extends MeshBasicNodeMaterial {
  private _font: SlugFont
  private _colorUniform
  private _opacityUniform
  private _viewportUniform
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

    this.transparent = options.transparent ?? true
    this.side = FrontSide
    this.depthWrite = false
    this.blending = NormalBlending

    this._buildShader()
  }

  private _buildShader(): void {
    const font = this._font

    // Instance attributes — typed generics give us swizzle access
    const glyphPos = attribute<'vec4'>('glyphPos', 'vec4')
    const glyphTex = attribute<'vec4'>('glyphTex', 'vec4')
    const glyphJac = attribute<'vec4'>('glyphJac', 'vec4')
    const glyphBand = attribute<'vec4'>('glyphBand', 'vec4')
    const glyphColorAttr = attribute<'vec4'>('glyphColor', 'vec4')
    const basePos = attribute<'vec3'>('position', 'vec3')

    // Capture uniforms and textures for closure
    const curveTexture = font.curveTexture
    const bandTexture = font.bandTexture
    const evenOddNode = bool(this._evenOdd)
    const weightBoostNode = bool(this._weightBoost)
    const colorUniform = this._colorUniform
    const opacityUniform = this._opacityUniform

    // --- Vertex shader ---
    this.positionNode = Fn(() => {
      const center = vec2(glyphPos.x, glyphPos.y)
      const halfSize = vec2(glyphPos.z, glyphPos.w)

      const worldX = center.x.add(basePos.x.mul(halfSize.x.mul(2.0)))
      const worldY = center.y.add(basePos.y.mul(halfSize.y.mul(2.0)))

      return vec4(worldX, worldY, float(0.0), float(1.0))
    })()

    // --- Fragment shader ---
    this.colorNode = Fn(() => {
      // Reconstruct em-space coordinate from base quad position [-0.5, 0.5]
      const emCenter = vec2(glyphTex.x, glyphTex.y)
      const halfSize = vec2(glyphPos.z, glyphPos.w)
      const invScale = glyphJac.x

      const emHalfWidth = halfSize.x.mul(invScale)
      const emHalfHeight = halfSize.y.mul(invScale)

      const renderCoord = vec2(
        emCenter.x.add(basePos.x.mul(emHalfWidth.mul(2.0))),
        emCenter.y.add(basePos.y.mul(emHalfHeight.mul(2.0))),
      )

      // Glyph metadata
      const glyphLocX = glyphTex.z
      const glyphLocY = glyphTex.w
      const numHBands = float(8.0)
      const numVBands = float(8.0)

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

  /** Update viewport dimensions (call when canvas resizes). */
  setViewportSize(width: number, height: number): void {
    ;(this._viewportUniform.value as Vector2).set(width, height)
  }

  /** Set text color. */
  setColor(value: Color | number): void {
    const c = value instanceof Color ? value : new Color(value)
    ;(this._colorUniform.value as Color).copy(c)
  }

  /** Set opacity. */
  setOpacity(value: number): void {
    this._opacityUniform.value = value
  }

  get font(): SlugFont {
    return this._font
  }
}
