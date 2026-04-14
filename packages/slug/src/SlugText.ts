import { InstancedMesh, InstancedBufferAttribute, Color } from 'three'
import type { Camera } from 'three'
import { SlugFont } from './SlugFont.js'
import { SlugMaterial } from './SlugMaterial.js'
import { SlugStrokeMaterial } from './SlugStrokeMaterial.js'
import { SlugGeometry } from './SlugGeometry.js'
import type { SlugOutlineOptions, SlugTextOptions, StyleSpan } from './types.js'

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
  private _styles: readonly StyleSpan[] = []
  private _dirty = true

  private _slugMaterial: SlugMaterial | null = null
  private _slugGeometry: SlugGeometry

  // --- Outline (stroke) — optional child mesh behind the fill ---
  private _outlineEnabled = false
  private _outlineWidth = 0.025
  private _outlineColor = new Color(0x000000)
  private _outlineMesh: InstancedMesh | null = null
  private _strokeMaterial: SlugStrokeMaterial | null = null

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
    if (options.styles !== undefined) this._styles = options.styles
    if (options.outline !== undefined) {
      this._outlineEnabled = true
      if (options.outline.width !== undefined) this._outlineWidth = options.outline.width
      if (options.outline.color !== undefined) this._outlineColor.set(options.outline.color)
    }
    if (options.font !== undefined) this._setFont(options.font)
  }

  // -- Outline --

  /**
   * Outline config. Setting to `null` disables the outline; setting an
   * object toggles it on with the provided (or default) width/color.
   * Individual field mutations do NOT rebuild — they update uniforms in
   * place, so scrubbing width in a tweakpane slider is instant.
   */
  get outline(): { width: number; color: Color } | null {
    return this._outlineEnabled
      ? { width: this._outlineWidth, color: this._outlineColor }
      : null
  }
  set outline(value: SlugOutlineOptions | null) {
    if (value === null) {
      if (this._outlineEnabled) {
        this._outlineEnabled = false
        this._teardownOutline()
      }
      return
    }
    if (value.width !== undefined) this._outlineWidth = value.width
    if (value.color !== undefined) this._outlineColor.set(value.color)
    if (!this._outlineEnabled) {
      this._outlineEnabled = true
      if (this._font) this._setupOutline()
    } else {
      this._strokeMaterial?.setStrokeHalfWidth(this._outlineWidth)
      this._strokeMaterial?.setColor(this._outlineColor)
    }
  }

  setOutlineWidth(w: number): void {
    this._outlineWidth = w
    this._strokeMaterial?.setStrokeHalfWidth(w)
  }
  setOutlineColor(c: Color | number | string): void {
    // Color.set() accepts all three — number, CSS string, or another Color.
    this._outlineColor.set(c as Color)
    this._strokeMaterial?.setColor(this._outlineColor)
  }

  /** Fill opacity — runtime uniform on the fill material. */
  setOpacity(value: number): void {
    this._slugMaterial?.setOpacity(value)
  }

  /**
   * Build the stroke child mesh + material. Called eagerly from
   * `_setFont` (not lazily on first outline-enable) so the WebGPU
   * pipeline compile happens during the normal font-load frame rather
   * than stalling the first frame the user toggles the outline on.
   *
   * The mesh starts hidden (`visible = false`). `_syncOutline` flips
   * it visible only when outline is enabled AND there's real glyph
   * data to draw — avoids compiling against a zero-count instance
   * buffer (the same WebGPU validation trap that hit the fill mesh
   * earlier — see SlugText._setFont for the full incident).
   *
   * On R3F first-frame render, WebGPU sees this hidden mesh in the
   * scene with `count > 0` once glyphs are shaped, compiles the
   * stroke pipeline, and draws it fully alpha-invisible (fillOpacity
   * stays 1, outline is behind, the outline mesh itself has
   * visibility gated on `_outlineEnabled`). That one-time compile
   * happens without the user ever toggling anything — so the toggle
   * itself is instant.
   */
  private _setupOutline(): void {
    if (!this._font || this._outlineMesh) return
    this._strokeMaterial = new SlugStrokeMaterial(this._font, {
      color: this._outlineColor,
      strokeHalfWidth: this._outlineWidth,
      transparent: true,
    })
    this._strokeMaterial.setViewportSize(this._viewportWidth, this._viewportHeight)

    // Child mesh shares the glyph geometry (including all instance
    // attributes — glyphPos, glyphTex, glyphJac, glyphBand, glyphColor)
    // so the stroke sees exactly the same shaped layout as the fill.
    this._outlineMesh = new InstancedMesh(this._slugGeometry, this._strokeMaterial, 0)
    this._outlineMesh.frustumCulled = false
    // Add behind fill: lower renderOrder draws first. The actual fill
    // mesh (this) renders on top courtesy of both materials having
    // depthWrite=false + transparent alpha blending.
    this._outlineMesh.renderOrder = -1
    this.add(this._outlineMesh)

    this._syncOutline()
  }

  private _teardownOutline(): void {
    if (this._outlineMesh) {
      this.remove(this._outlineMesh)
      this._outlineMesh.dispose()
      this._outlineMesh = null
    }
    this._strokeMaterial?.dispose()
    this._strokeMaterial = null
  }

  /** Mirror the fill mesh's `count` + `instanceMatrix` onto the outline. */
  private _syncOutline(): void {
    const mesh = this._outlineMesh
    if (!mesh) return
    mesh.count = this.count
    // Share the same instance matrix attribute — no copy, no drift.
    mesh.instanceMatrix = this.instanceMatrix
    mesh.visible = this.count > 0 && this.visible
  }

  /** Style spans (underline / strike / sub-super) applied to the text. */
  get styles(): readonly StyleSpan[] {
    return this._styles
  }
  set styles(value: readonly StyleSpan[]) {
    if (this._styles !== value) {
      this._styles = value
      this._dirty = true
    }
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
      this._dirty = true

      // If outline is already configured (including font swap while
      // outline stays on) rebuild the stroke mesh against the new
      // font's textures. Don't pre-build for users who never enable
      // outline — that pays GPU-resource cost for nothing.
      if (this._outlineEnabled) {
        this._teardownOutline()
        this._setupOutline()
      }

      // Stay hidden until the first `_rebuild` has populated instance data.
      // R3F can render once between prop-set and the first `useFrame`; if
      // the pipeline sees a zero-count / unpopulated instance buffer on
      // that pass, WebGPU validates a zero-size binding and aborts the
      // command submission for the frame ("Binding size is zero ... is
      // invalid due to a previous error"). Flip visible on in `_rebuild`.
      if (this._text) {
        this._rebuild()
      }
    } else {
      this.visible = false
      this.count = 0
      this._teardownOutline()
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
    if (camera) {
      this._slugMaterial?.updateMVP(this, camera)
      this._strokeMaterial?.updateMVP(this, camera)
    }
  }

  private _rebuild(): void {
    if (!this._text || !this._font) {
      this.count = 0
      this.visible = false
      this._syncOutline()
      return
    }

    const positionedGlyphs = this._font.shapeText(this._text, this._fontSize, {
      align: this._align,
      lineHeight: this._lineHeight,
      maxWidth: this._maxWidth,
    })

    if (positionedGlyphs.length === 0) {
      this.count = 0
      this.visible = false
      this._syncOutline()
      return
    }

    const decorations = this._styles.length > 0
      ? this._font.emitDecorations(this._text, positionedGlyphs, this._styles, this._fontSize)
      : []

    this._slugGeometry.setGlyphs(positionedGlyphs, this._font, {
      r: this._color.r,
      g: this._color.g,
      b: this._color.b,
      a: 1,
    }, decorations)

    // Ensure instanceMatrix is large enough with identity matrices.
    // InstancedMesh multiplies each vertex by instanceMatrix — zeros = invisible.
    const needed = positionedGlyphs.length + decorations.length
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
    this.visible = true
    this._syncOutline()
  }

  /** Update viewport size for dilation calculations. */
  setViewportSize(width: number, height: number): void {
    this._viewportWidth = width
    this._viewportHeight = height
    this._slugMaterial?.setViewportSize(width, height)
    this._strokeMaterial?.setViewportSize(width, height)
  }

  /** Dispose all resources. */
  dispose(): this {
    this._teardownOutline()
    this._slugGeometry.dispose()
    this._slugMaterial?.dispose()
    return super.dispose()
  }
}
