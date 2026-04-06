import { InstancedMesh, Color } from 'three'
import type { Camera } from 'three'
import { SlugFont } from './SlugFont.js'
import { SlugMaterial } from './SlugMaterial.js'
import { SlugGeometry } from './SlugGeometry.js'
import type { SlugTextOptions } from './types.js'

/**
 * High-level text rendering object using the Slug algorithm.
 *
 * All constructor parameters are optional for R3F compatibility.
 * Properties can be set after construction via setters.
 *
 * @example
 * ```ts
 * const font = await SlugFont.fromURL('/fonts/Inter.ttf')
 * const text = new SlugText({ font, text: 'Hello!', fontSize: 48 })
 * scene.add(text)
 * ```
 */
export class SlugText extends InstancedMesh {
  private _font: SlugFont | null = null
  private _text = ''
  private _fontSize = 16
  private _color = new Color(0xffffff)
  private _align: 'left' | 'center' | 'right' = 'left'
  private _lineHeight = 1.2
  private _maxWidth: number | undefined
  private _evenOdd = false
  private _weightBoost = false
  private _dirty = true

  private _slugMaterial: SlugMaterial | null = null
  private _slugGeometry: SlugGeometry

  constructor(options?: SlugTextOptions) {
    const geometry = new SlugGeometry()
    // Construct with a placeholder material — replaced when font is set
    super(geometry, undefined!, 0)

    this._slugGeometry = geometry
    this.frustumCulled = false
    this.visible = false

    if (!options) return

    // Apply options — setters handle dirty marking
    if (options.fontSize !== undefined) this._fontSize = options.fontSize
    if (options.color !== undefined) this._color.set(options.color)
    if (options.align !== undefined) this._align = options.align
    if (options.lineHeight !== undefined) this._lineHeight = options.lineHeight
    if (options.maxWidth !== undefined) this._maxWidth = options.maxWidth
    if (options.evenOdd !== undefined) this._evenOdd = options.evenOdd
    if (options.weightBoost !== undefined) this._weightBoost = options.weightBoost
    if (options.text !== undefined) this._text = options.text
    if (options.font !== undefined) this._setFont(options.font)
  }

  // -- Font (triggers material creation + rebuild) --

  get font(): SlugFont | null {
    return this._font
  }

  set font(value: SlugFont | null) {
    if (this._font !== value) {
      this._setFont(value)
    }
  }

  private _setFont(value: SlugFont | null): void {
    this._font = value

    if (value) {
      this._slugMaterial = new SlugMaterial(value, {
        color: this._color,
        evenOdd: this._evenOdd,
        weightBoost: this._weightBoost,
        transparent: true,
      })
      this.material = this._slugMaterial
      this.visible = true
      this._dirty = true

      if (this._text) {
        this._rebuild()
      }
    } else {
      this.visible = false
      this.count = 0
    }
  }

  // -- Text --

  get text(): string {
    return this._text
  }

  set text(value: string) {
    if (this._text !== value) {
      this._text = value
      this._dirty = true
    }
  }

  // -- Font size --

  get fontSize(): number {
    return this._fontSize
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value
      this._dirty = true
    }
  }

  // -- Alignment --

  get align(): 'left' | 'center' | 'right' {
    return this._align
  }

  set align(value: 'left' | 'center' | 'right') {
    if (this._align !== value) {
      this._align = value
      this._dirty = true
    }
  }

  // -- Line height --

  get lineHeight(): number {
    return this._lineHeight
  }

  set lineHeight(value: number) {
    if (this._lineHeight !== value) {
      this._lineHeight = value
      this._dirty = true
    }
  }

  // -- Max width --

  get maxWidth(): number | undefined {
    return this._maxWidth
  }

  set maxWidth(value: number | undefined) {
    if (this._maxWidth !== value) {
      this._maxWidth = value
      this._dirty = true
    }
  }

  /**
   * Rebuild geometry if any properties changed since last call.
   * Also updates the MVP matrix uniforms for vertex dilation.
   * Call once per frame, passing the active camera.
   */
  update(camera?: Camera): void {
    if (this._dirty) {
      this._rebuild()
      this._dirty = false
    }

    // Update MVP for dilation every frame (camera/object may have moved)
    if (camera && this._slugMaterial) {
      this._slugMaterial.updateMVP(this, camera)
    }
  }

  private _rebuild(): void {
    if (!this._text || !this._font) {
      this.count = 0
      return
    }

    const positionedGlyphs = this._font.shapeText(this._text, this._fontSize, {
      align: this._align,
      lineHeight: this._lineHeight,
      maxWidth: this._maxWidth,
    })

    if (positionedGlyphs.length === 0) {
      this.count = 0
      return
    }

    this._slugGeometry.setGlyphs(positionedGlyphs, this._font, {
      r: this._color.r,
      g: this._color.g,
      b: this._color.b,
      a: 1,
    })

    this.count = positionedGlyphs.length
  }

  /** Update viewport size for dilation calculations. */
  setViewportSize(width: number, height: number): void {
    this._slugMaterial?.setViewportSize(width, height)
  }

  /** Dispose all resources. */
  dispose(): this {
    this._slugGeometry.dispose()
    this._slugMaterial?.dispose()
    return super.dispose()
  }
}
