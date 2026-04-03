import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaPath } from '../path'
import { SkiaNode } from './SkiaNode'

/**
 * Draws a path. Accepts either an SVG path data string or a SkiaPath reference.
 */
export class SkiaPathNode extends SkiaNode {
  /** SVG path data string (e.g., "M10 200 Q100 100 200 200") */
  d?: string
  /** Explicit SkiaPath reference (overrides `d`) */
  path?: SkiaPath

  private _cachedPath: SkiaPath | null = null
  private _cachedD?: string

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    const path = this._getPath(skia)
    if (!path) return
    ctx.drawPath(path, this._resolvePaint(skia))
  }

  private _getPath(skia: SkiaContext): SkiaPath | null {
    if (this.path) return this.path

    if (this.d) {
      if (this.d !== this._cachedD || !this._cachedPath) {
        this._cachedPath?.dispose()
        this._cachedPath = SkiaPath.fromSVGString(skia, this.d)
        this._cachedD = this.d
      }
      return this._cachedPath
    }

    return null
  }

  dispose(): void {
    super.dispose()
    this._cachedPath?.dispose()
    this._cachedPath = null
  }
}
