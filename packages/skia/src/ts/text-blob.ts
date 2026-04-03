import type { SkiaContext } from './context'
import type { SkiaFont } from './font'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia text blob — pre-shaped immutable text for efficient repeated drawing.
 *
 * ```ts
 * const blob = SkiaTextBlob.fromText(skia, 'Hello World', font)
 * ctx.drawTextBlob(blob, 10, 30, paint)
 * blob.dispose()
 * ```
 */
export class SkiaTextBlob {
  _handle: number
  private readonly _ctx: SkiaContext

  private constructor(context: SkiaContext, handle: number) {
    this._ctx = context
    this._handle = handle
    registry.register(this, { handle, drop: context._exports.skia_text_blob_destroy }, this)
  }

  /** Create a text blob from a string */
  static fromText(context: SkiaContext, text: string, font: SkiaFont): SkiaTextBlob | null {
    const [ptr, len] = context._writeString(text)
    const h = context._exports.skia_text_blob_from_text(ptr, len, font._handle)
    return h ? new SkiaTextBlob(context, h) : null
  }

  /** Create a text blob with explicit glyph positions */
  static fromPosText(context: SkiaContext, text: string, positions: number[], font: SkiaFont): SkiaTextBlob | null {
    const [textPtr, textLen] = context._writeString(text)
    const posPtr = context._writeF32(positions)
    const h = context._exports.skia_text_blob_from_pos_text(textPtr, textLen, posPtr, font._handle)
    return h ? new SkiaTextBlob(context, h) : null
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_text_blob_destroy(this._handle)
      this._handle = 0
    }
  }
}
