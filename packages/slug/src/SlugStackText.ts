import { Color, Group, InstancedBufferAttribute, InstancedMesh } from 'three'
import type { Camera } from 'three'
import { SlugFontStack } from './SlugFontStack.js'
import { SlugMaterial } from './SlugMaterial.js'
import { SlugStrokeMaterial } from './SlugStrokeMaterial.js'
import { SlugGeometry } from './SlugGeometry.js'
import { shapeStackText } from './pipeline/textShaperStack.js'
import type { SlugFont } from './SlugFont.js'
import type { PositionedGlyph, SlugOutlineOptions, StyleSpan } from './types.js'

export interface SlugStackTextOptions {
  font?: SlugFontStack
  text?: string
  fontSize?: number
  color?: number | Color
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  maxWidth?: number
  /** Underline / strike spans applied to character ranges — parity with `SlugText.styles`. */
  styles?: readonly StyleSpan[]
  /** Stroke outline config — parity with `SlugText.outline`. Runtime uniform width/color. */
  outline?: SlugOutlineOptions
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

  /** Runtime styles (underline/strike) applied across the stack. */
  private _styles: readonly StyleSpan[] = []

  /** Optional outline configuration — parity with `SlugText.outline`. */
  private _outlineEnabled = false
  private _outlineWidth = 0.025
  private _outlineColor = new Color(0x000000)
  /** One stroke mesh per font in the stack, parallel to `_meshes`. */
  private _outlineMeshes: InstancedMesh[] = []
  private _outlineMaterials: SlugStrokeMaterial[] = []

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
    if (options.styles !== undefined) this._styles = options.styles
    if (options.outline !== undefined) {
      this._outlineEnabled = true
      if (options.outline.width !== undefined) this._outlineWidth = options.outline.width
      if (options.outline.color !== undefined) this._outlineColor.set(options.outline.color)
    }
    if (options.font !== undefined) this._setFont(options.font)
  }

  // -- Styles --

  /** Underline / strikethrough spans applied to character ranges. */
  get styles(): readonly StyleSpan[] { return this._styles }
  set styles(value: readonly StyleSpan[]) {
    if (this._styles !== value) {
      this._styles = value
      this._dirty = true
    }
  }

  // -- Outline --

  get outline(): { width: number; color: Color } | null {
    return this._outlineEnabled
      ? { width: this._outlineWidth, color: this._outlineColor }
      : null
  }
  set outline(value: SlugOutlineOptions | null) {
    if (value === null) {
      if (this._outlineEnabled) {
        this._outlineEnabled = false
        this._teardownOutlines()
      }
      return
    }
    if (value.width !== undefined) this._outlineWidth = value.width
    if (value.color !== undefined) this._outlineColor.set(value.color as Color)
    if (!this._outlineEnabled) {
      this._outlineEnabled = true
      if (this._font) this._setupOutlines()
    } else {
      for (const m of this._outlineMaterials) {
        m.setStrokeHalfWidth(this._outlineWidth)
        m.setColor(this._outlineColor)
      }
    }
  }

  setOutlineWidth(w: number): void {
    this._outlineWidth = w
    for (const m of this._outlineMaterials) m.setStrokeHalfWidth(w)
  }
  setOutlineColor(c: Color | number | string): void {
    this._outlineColor.set(c as Color)
    for (const m of this._outlineMaterials) m.setColor(this._outlineColor)
  }

  /** Fill opacity — forwarded to every per-font fill material. Parity
   *  with `SlugText.setOpacity`. */
  setOpacity(value: number): void {
    for (const m of this._materials) m.setOpacity(value)
  }

  private _setupOutlines(): void {
    if (!this._font || this._outlineMeshes.length > 0) return
    // One stroke mesh per font in the stack, sharing that font's
    // InstancedMesh geometry + instance matrix so glyph instance data
    // stays single-sourced. The fill meshes remain on top; stroke
    // meshes have `renderOrder = -1` so they draw behind.
    for (let i = 0; i < this._meshes.length; i++) {
      const fillMesh = this._meshes[i]!
      const fillGeom = this._geometries[i]!
      const font = this._font.fonts[i]!

      const mat = new SlugStrokeMaterial(font, {
        color: this._outlineColor,
        strokeHalfWidth: this._outlineWidth,
        transparent: true,
      })
      mat.setViewportSize(this._viewportWidth, this._viewportHeight)

      const mesh = new InstancedMesh(fillGeom, mat, 0)
      mesh.frustumCulled = false
      mesh.renderOrder = -1
      mesh.visible = false
      this._outlineMaterials.push(mat)
      this._outlineMeshes.push(mesh)
      this.add(mesh)

      // Mirror the fill mesh's count + instanceMatrix onto the stroke.
      mesh.count = fillMesh.count
      mesh.instanceMatrix = fillMesh.instanceMatrix
      mesh.visible = fillMesh.visible
    }
  }

  private _teardownOutlines(): void {
    for (const m of this._outlineMeshes) {
      this.remove(m)
      m.dispose()
    }
    for (const m of this._outlineMaterials) m.dispose()
    this._outlineMeshes = []
    this._outlineMaterials = []
  }

  private _syncOutlines(): void {
    if (this._outlineMeshes.length === 0) return
    for (let i = 0; i < this._outlineMeshes.length; i++) {
      const strokeMesh = this._outlineMeshes[i]
      const fillMesh = this._meshes[i]
      if (!strokeMesh || !fillMesh) continue
      strokeMesh.count = fillMesh.count
      strokeMesh.instanceMatrix = fillMesh.instanceMatrix
      strokeMesh.visible = fillMesh.visible
    }
  }

  // -- Font (stack) --

  get font(): SlugFontStack | null { return this._font }
  set font(value: SlugFontStack | null) {
    if (this._font !== value) this._setFont(value)
  }

  private _setFont(stack: SlugFontStack | null): void {
    // Tear down old child meshes (fill + stroke siblings).
    this._teardownOutlines()
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

    // Re-wire outline meshes against the new stack, if outline is on.
    if (this._outlineEnabled) this._setupOutlines()

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
      for (const mat of this._outlineMaterials) mat.updateMVP(this, camera)
    }
  }

  private _rebuild(): void {
    const stack = this._font
    if (!stack || !this._text) {
      for (const mesh of this._meshes) { mesh.count = 0; mesh.visible = false }
      this._syncOutlines()
      return
    }

    const result = shapeStackText(stack, this._text, this._fontSize, {
      align: this._align,
      lineHeight: this._lineHeight,
      maxWidth: this._maxWidth,
    })

    // Build a flat list of positioned glyphs + parallel font-index
    // array, sorted by srcCharIndex. Decorations walk glyphs in char
    // order per-line, so this is the shape `emitDecorations` consumes.
    const flat: PositionedGlyph[] = []
    const flatFontIdx: number[] = []
    for (let fi = 0; fi < stack.fonts.length; fi++) {
      const glyphs = result.byFont.get(fi)
      if (!glyphs) continue
      for (const g of glyphs) {
        flat.push(g)
        flatFontIdx.push(fi)
      }
    }
    // Stable-sort by srcCharIndex so the `runStart/runEnd` walk inside
    // emitDecorations sees glyphs in the order the shaper emitted them.
    const order = flat.map((_, i) => i).sort((a, b) => {
      const da = flat[a]!.srcCharIndex - flat[b]!.srcCharIndex
      return da
    })
    const flatSorted: PositionedGlyph[] = order.map((i) => flat[i]!)
    const flatFontSorted: number[] = order.map((i) => flatFontIdx[i]!)

    const decorations = this._styles.length > 0
      ? stack.emitDecorations(this._text, flatSorted, flatFontSorted, this._styles, this._fontSize)
      : []

    const colorRGBA = { r: this._color.r, g: this._color.g, b: this._color.b, a: 1 }

    for (let fi = 0; fi < stack.fonts.length; fi++) {
      const mesh = this._meshes[fi]!
      const geom = this._geometries[fi]!
      const font = stack.fonts[fi]!
      const glyphs = result.byFont.get(fi) ?? []

      // Decorations attach to the primary font's mesh only — the
      // underline/strike lines use primary-font metrics and there's
      // no reason to duplicate them across fallback meshes. Rect-
      // sentinel instances sit alongside the primary font's glyphs.
      const decosForMesh = fi === 0 ? decorations : []
      const glyphCount = glyphs.length
      const totalInstances = glyphCount + decosForMesh.length

      if (totalInstances === 0) {
        mesh.count = 0
        mesh.visible = false
        continue
      }

      geom.setGlyphs(glyphs, font, colorRGBA, decosForMesh)

      // Ensure the InstancedMesh's instanceMatrix is sized + identity.
      if (mesh.instanceMatrix.count < totalInstances) {
        const capacity = Math.max(totalInstances, geom.capacity)
        const buf = new Float32Array(capacity * 16)
        for (let i = 0; i < capacity; i++) {
          const o = i * 16
          buf[o] = 1; buf[o + 5] = 1; buf[o + 10] = 1; buf[o + 15] = 1
        }
        mesh.instanceMatrix = new InstancedBufferAttribute(buf, 16)
      }
      mesh.count = totalInstances
      mesh.visible = true
    }

    // Stroke meshes follow fill count + instance matrix, per-font.
    this._syncOutlines()
  }

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = width
    this._viewportHeight = height
    for (const m of this._materials) m.setViewportSize(width, height)
    for (const m of this._outlineMaterials) m.setViewportSize(width, height)
  }

  dispose(): this {
    // Tear outlines first — they hold SlugStrokeMaterial refs that
    // aren't in `_materials`, and they share geometry with the fill
    // meshes so disposing geometry first here would double-free.
    this._teardownOutlines()
    // Remove + dispose each fill InstancedMesh child. R3F's scene-
    // graph cleanup handles geometry/material disposal via its
    // generic traversal, but we also own references internally; be
    // explicit so nothing leaks if callers invoke dispose() outside
    // the R3F lifecycle.
    for (const mesh of this._meshes) {
      this.remove(mesh)
      mesh.dispose()
    }
    for (const g of this._geometries) g.dispose()
    for (const m of this._materials) m.dispose()
    this._meshes = []
    this._geometries = []
    this._materials = []
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
