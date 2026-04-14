import { Color, Group, InstancedBufferAttribute, InstancedMesh } from 'three'
import type { Camera } from 'three'
import { SlugFontStack } from './SlugFontStack.js'
import { SlugMaterial } from './SlugMaterial.js'
import { SlugGeometry } from './SlugGeometry.js'
import { shapeStackText } from './pipeline/textShaperStack.js'
import type { SlugFont } from './SlugFont.js'

export interface SlugStackTextOptions {
  font?: SlugFontStack
  text?: string
  fontSize?: number
  color?: number | Color
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  maxWidth?: number
}

/**
 * Multi-font text rendered from a `SlugFontStack`. Each font in the
 * stack gets its own `InstancedMesh` child (sharing the parent's
 * transform) so their distinct curve/band textures can be bound per
 * draw call. One draw per font present in the rendered text — fonts
 * that contribute no glyphs to the current text are simply hidden.
 *
 * Keeps the same setter / `update()` lifecycle as `SlugText`. R3F users
 * extend with `SlugStackText` and use `<slugStackText font={stack}>`.
 */
export class SlugStackText extends Group {
  private _font: SlugFontStack | null = null
  private _text = ''
  private _fontSize = 16
  private _color = new Color(0xffffff)
  private _align: 'left' | 'center' | 'right' = 'left'
  private _lineHeight = 1.2
  private _maxWidth: number | undefined
  private _dirty = true

  private _viewportWidth = 1
  private _viewportHeight = 1

  /** One mesh per font in the stack. Created on font set, disposed on swap. */
  private _meshes: InstancedMesh[] = []
  private _materials: SlugMaterial[] = []
  private _geometries: SlugGeometry[] = []

  constructor(options?: SlugStackTextOptions) {
    super()
    this.frustumCulled = false

    if (!options) return
    if (options.fontSize !== undefined) this._fontSize = options.fontSize
    if (options.color !== undefined) this._color.set(options.color)
    if (options.align !== undefined) this._align = options.align
    if (options.lineHeight !== undefined) this._lineHeight = options.lineHeight
    if (options.maxWidth !== undefined) this._maxWidth = options.maxWidth
    if (options.text !== undefined) this._text = options.text
    if (options.font !== undefined) this._setFont(options.font)
  }

  // -- Font (stack) --

  get font(): SlugFontStack | null { return this._font }
  set font(value: SlugFontStack | null) {
    if (this._font !== value) this._setFont(value)
  }

  private _setFont(stack: SlugFontStack | null): void {
    // Tear down old child meshes.
    for (const m of this._meshes) {
      this.remove(m)
      m.dispose()
    }
    for (const g of this._geometries) g.dispose()
    for (const m of this._materials) m.dispose()
    this._meshes = []
    this._materials = []
    this._geometries = []

    this._font = stack

    if (!stack) return

    // One mesh per font in the stack. Hidden until populated.
    for (const font of stack.fonts) {
      const geom = new SlugGeometry()
      const mat = new SlugMaterial(font, { color: this._color, transparent: true })
      mat.setViewportSize(this._viewportWidth, this._viewportHeight)
      const mesh = new InstancedMesh(geom, mat, 0)
      mesh.frustumCulled = false
      mesh.visible = false
      this._geometries.push(geom)
      this._materials.push(mat)
      this._meshes.push(mesh)
      this.add(mesh)
    }

    this._dirty = true
    if (this._text) this._rebuild()
  }

  // -- Text + visual properties (mirror SlugText) --

  get text(): string { return this._text }
  set text(v: string) { if (this._text !== v) { this._text = v; this._dirty = true } }

  get fontSize(): number { return this._fontSize }
  set fontSize(v: number) { if (this._fontSize !== v) { this._fontSize = v; this._dirty = true } }

  get color(): Color { return this._color }
  set color(v: Color | number) {
    const c = v instanceof Color ? v : new Color(v)
    if (!this._color.equals(c)) {
      this._color.copy(c)
      for (const m of this._materials) m.setColor(c)
      this._dirty = true
    }
  }

  get align(): 'left' | 'center' | 'right' { return this._align }
  set align(v: 'left' | 'center' | 'right') { if (this._align !== v) { this._align = v; this._dirty = true } }

  get lineHeight(): number { return this._lineHeight }
  set lineHeight(v: number) { if (this._lineHeight !== v) { this._lineHeight = v; this._dirty = true } }

  get maxWidth(): number | undefined { return this._maxWidth }
  set maxWidth(v: number | undefined) { if (this._maxWidth !== v) { this._maxWidth = v; this._dirty = true } }

  /** Per-frame update. Re-shapes only when dirty; always refreshes per-mesh MVP. */
  update(camera?: Camera): void {
    if (this._dirty) { this._rebuild(); this._dirty = false }
    if (camera) {
      for (const mesh of this._meshes) {
        const mat = mesh.material as SlugMaterial
        mat.updateMVP(this, camera)
      }
    }
  }

  private _rebuild(): void {
    const stack = this._font
    if (!stack || !this._text) {
      for (const mesh of this._meshes) { mesh.count = 0; mesh.visible = false }
      return
    }

    const result = shapeStackText(stack, this._text, this._fontSize, {
      align: this._align,
      lineHeight: this._lineHeight,
      maxWidth: this._maxWidth,
    })

    const colorRGBA = { r: this._color.r, g: this._color.g, b: this._color.b, a: 1 }

    for (let fi = 0; fi < stack.fonts.length; fi++) {
      const mesh = this._meshes[fi]!
      const geom = this._geometries[fi]!
      const font = stack.fonts[fi]!
      const glyphs = result.byFont.get(fi) ?? []

      if (glyphs.length === 0) {
        mesh.count = 0
        mesh.visible = false
        continue
      }

      geom.setGlyphs(glyphs, font, colorRGBA)

      // Ensure the InstancedMesh's instanceMatrix is sized + identity.
      if (mesh.instanceMatrix.count < glyphs.length) {
        const capacity = Math.max(glyphs.length, geom.capacity)
        const buf = new Float32Array(capacity * 16)
        for (let i = 0; i < capacity; i++) {
          const o = i * 16
          buf[o] = 1; buf[o + 5] = 1; buf[o + 10] = 1; buf[o + 15] = 1
        }
        mesh.instanceMatrix = new InstancedBufferAttribute(buf, 16)
      }
      mesh.count = glyphs.length
      mesh.visible = true
    }
  }

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = width
    this._viewportHeight = height
    for (const m of this._materials) m.setViewportSize(width, height)
  }

  dispose(): this {
    for (const g of this._geometries) g.dispose()
    for (const m of this._materials) m.dispose()
    return this
  }

  /** Total positioned-glyph count across all fonts. Mirrors `SlugText.count`. */
  get totalGlyphCount(): number {
    let n = 0
    for (const m of this._meshes) n += m.count
    return n
  }

  /** For introspection — primary font of the stack, or null. */
  get primaryFont(): SlugFont | null {
    return this._font?.primary ?? null
  }
}
