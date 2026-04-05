import type { SkiaContext } from './context'

const fontRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia font — loaded from raw font file data (TTF/OTF).
 *
 * ```ts
 * const data = await fetch('/fonts/Inter.ttf').then(r => r.arrayBuffer())
 * const font = new SkiaFont(skia, new Uint8Array(data), 16)
 * const width = font.measureText('Hello')
 * ctx.drawText('Hello', 10, 30, font, paint)
 * font.dispose()
 * ```
 */
export class SkiaFont {
  /** @internal */
  _handle: number
  private _typefaceHandle: number
  private readonly _ctx: SkiaContext

  constructor(context: SkiaContext, data: Uint8Array, size: number) {
    this._ctx = context

    const [dataPtr, dataLen] = context._writeBytes(data)
    this._typefaceHandle = context._exports.skia_typeface_load(dataPtr, dataLen)
    if (!this._typefaceHandle) throw new Error('Failed to load font — invalid font data')

    this._handle = context._exports.skia_font_new(this._typefaceHandle, size)
    if (!this._handle) {
      context._exports.skia_typeface_delete(this._typefaceHandle)
      throw new Error('Failed to create font')
    }

    fontRegistry.register(this, { handle: this._handle, drop: context._exports.skia_font_delete }, this)
  }

  setSize(size: number): this {
    this._ctx._exports.skia_font_set_size(this._handle, size)
    return this
  }

  /** Measure the advance width of a text string in pixels */
  measureText(text: string): number {
    const [ptr, len] = this._ctx._writeString(text)
    return this._ctx._exports.skia_measure_text(ptr, len, this._handle)
  }

  /** Get font metrics: ascent, descent, leading */
  getMetrics(): { ascent: number; descent: number; leading: number } {
    const ptr = this._ctx._writeF32([0, 0, 0])
    this._ctx._exports.skia_font_get_metrics(this._handle, ptr)
    const dv = new DataView(this._ctx._memory.buffer)
    return { ascent: dv.getFloat32(ptr, true), descent: dv.getFloat32(ptr + 4, true), leading: dv.getFloat32(ptr + 8, true) }
  }

  /** Get the current font size */
  getSize(): number {
    return this._ctx._exports.skia_font_get_size(this._handle)
  }

  /** Convert a text string to an array of glyph IDs */
  getGlyphIDs(text: string): Uint16Array {
    const [textPtr, textLen] = this._ctx._writeString(text)
    // Allocate output buffer for max possible glyphs (one per code point)
    const maxGlyphs = text.length
    const outPtr = this._ctx._exports.cabi_realloc(0, 0, 2, maxGlyphs * 2)
    const count = this._ctx._exports.skia_font_get_glyph_ids(this._handle, textPtr, textLen, outPtr, maxGlyphs)
    return new Uint16Array(this._ctx._memory.buffer.slice(outPtr, outPtr + count * 2))
  }

  /** Get advance widths for an array of glyph IDs */
  getGlyphWidths(glyphIDs: Uint16Array): Float32Array {
    const glyphsPtr = this._ctx._exports.cabi_realloc(0, 0, 2, glyphIDs.byteLength)
    new Uint16Array(this._ctx._memory.buffer, glyphsPtr, glyphIDs.length).set(glyphIDs)
    const outPtr = this._ctx._writeF32(new Array(glyphIDs.length).fill(0))
    this._ctx._exports.skia_font_get_glyph_widths(this._handle, glyphsPtr, glyphIDs.length, outPtr)
    return new Float32Array(this._ctx._memory.buffer.slice(outPtr, outPtr + glyphIDs.length * 4))
  }

  dispose(): void {
    if (this._handle !== 0) {
      fontRegistry.unregister(this)
      this._ctx._exports.skia_font_delete(this._handle)
      this._ctx._exports.skia_typeface_delete(this._typefaceHandle)
      this._handle = 0
      this._typefaceHandle = 0
    }
  }
}
