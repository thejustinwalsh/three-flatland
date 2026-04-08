import { InstancedMesh, InstancedBufferAttribute, Color } from 'three'
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
  private _stemDarken = 0
  private _thicken = 0
  private _supersample = false
  private _pixelSnap = true
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
    if (options.stemDarken !== undefined) this._stemDarken = options.stemDarken
    if (options.thicken !== undefined) this._thicken = options.thicken
    if (options.supersample !== undefined) this._supersample = options.supersample
    if (options.pixelSnap !== undefined) this._pixelSnap = options.pixelSnap
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

  private _viewportWidth = 1
  private _viewportHeight = 1

  private _setFont(value: SlugFont | null): void {
    this._font = value

    if (value) {
      this._slugMaterial = new SlugMaterial(value, {
        color: this._color,
        evenOdd: this._evenOdd,
        weightBoost: this._weightBoost,
        stemDarken: this._stemDarken,
        thicken: this._thicken,
        supersample: this._supersample,
        pixelSnap: this._pixelSnap,
        transparent: true,
      })
      // Restore viewport size on the new material
      this._slugMaterial.setViewportSize(this._viewportWidth, this._viewportHeight)
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

  // -- Color --

  get color(): Color {
    return this._color
  }

  set color(value: Color | number) {
    const c = value instanceof Color ? value : new Color(value)
    if (!this._color.equals(c)) {
      this._color.copy(c)
      this._slugMaterial?.setColor(c)
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

  // -- Stem darkening (runtime uniform) --

  get stemDarken(): number {
    return this._stemDarken
  }

  set stemDarken(value: number) {
    if (this._stemDarken !== value) {
      this._stemDarken = value
      this._slugMaterial?.setStemDarken(value)
    }
  }

  // -- Thickening (runtime uniform) --

  get thicken(): number {
    return this._thicken
  }

  set thicken(value: number) {
    if (this._thicken !== value) {
      this._thicken = value
      this._slugMaterial?.setThicken(value)
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

    // Ensure instanceMatrix is large enough with identity matrices.
    // InstancedMesh multiplies each vertex by instanceMatrix — zeros = invisible.
    const needed = positionedGlyphs.length
    if (this.instanceMatrix.count < needed) {
      const capacity = Math.max(needed, this._slugGeometry.capacity)
      const buf = new Float32Array(capacity * 16)
      // Fill with identity matrices (1 on diagonal)
      for (let i = 0; i < capacity; i++) {
        const o = i * 16
        buf[o] = 1       // m[0][0]
        buf[o + 5] = 1   // m[1][1]
        buf[o + 10] = 1  // m[2][2]
        buf[o + 15] = 1  // m[3][3]
      }
      this.instanceMatrix = new InstancedBufferAttribute(buf, 16)
    }
    this.count = needed
  }

  /** Update viewport size for dilation calculations. */
  setViewportSize(width: number, height: number): void {
    this._viewportWidth = width
    this._viewportHeight = height
    this._slugMaterial?.setViewportSize(width, height)
  }

  /** Dispose all resources. */
  dispose(): this {
    this._slugGeometry.dispose()
    this._slugMaterial?.dispose()
    return super.dispose()
  }
}
