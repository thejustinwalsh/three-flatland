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
