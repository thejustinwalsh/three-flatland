import type { SkiaContext } from './context'

const svgRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia SVG DOM — parse and render SVG documents.
 *
 * ```ts
 * const svg = new SkiaSVG(skia, '<svg viewBox="0 0 100 100">...</svg>')
 * svg.setSize(200, 200)
 * ctx.drawSVG(svg)
 * svg.dispose()
 * ```
 */
export class SkiaSVG {
  /** @internal */
  _handle: number
  private readonly _ctx: SkiaContext

  constructor(context: SkiaContext, svgString: string) {
    this._ctx = context
    const [ptr, len] = context._writeString(svgString)
    this._handle = context._exports.skia_svg_from_string(ptr, len)
    if (!this._handle) throw new Error('Failed to parse SVG')
    svgRegistry.register(this, { handle: this._handle, drop: context._exports.skia_svg_delete }, this)
  }

  getSize(): { width: number; height: number } {
    return {
      width: this._ctx._exports.skia_svg_get_width(this._handle),
      height: this._ctx._exports.skia_svg_get_height(this._handle),
    }
  }

  setSize(width: number, height: number): this {
    this._ctx._exports.skia_svg_set_size(this._handle, width, height)
    return this
  }

  dispose(): void {
    if (this._handle !== 0) {
      svgRegistry.unregister(this)
      this._ctx._exports.skia_svg_delete(this._handle)
      this._handle = 0
    }
  }
}
