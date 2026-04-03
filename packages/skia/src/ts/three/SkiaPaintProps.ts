import type { SkiaContext } from '../context'
import { SkiaPaint } from '../paint'
import type { StrokeCap, StrokeJoin, BlendMode } from '../types'

/** Color as [r, g, b, a] floats (0-1) or packed 0xAARRGGBB integer */
export type SkiaColor = [number, number, number, number] | number

/** Inline paint properties accepted by all Skia drawing nodes */
export interface SkiaPaintProps {
  fill?: SkiaColor
  stroke?: SkiaColor
  strokeWidth?: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
  opacity?: number
  blur?: number
  dash?: { intervals: number[]; phase?: number }
  blendMode?: BlendMode
  antiAlias?: boolean
  /** Explicit paint — overrides all inline props */
  paint?: SkiaPaint
}

function colorToRGBA(c: SkiaColor): [number, number, number, number] {
  if (Array.isArray(c)) return c
  return [
    ((c >> 16) & 0xff) / 255,
    ((c >> 8) & 0xff) / 255,
    (c & 0xff) / 255,
    ((c >> 24) & 0xff) / 255,
  ]
}

/**
 * Manages a cached SkiaPaint built from inline props.
 * Recreates only when props change.
 * @internal
 */
export class PaintCache {
  private _paint: SkiaPaint | null = null
  private _dirty = true

  // Tracked props
  fill?: SkiaColor
  stroke?: SkiaColor
  strokeWidth?: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
  opacity?: number
  blur?: number
  dash?: { intervals: number[]; phase?: number }
  blendMode?: BlendMode
  antiAlias?: boolean
  explicitPaint?: SkiaPaint

  markDirty(): void {
    this._dirty = true
  }

  resolve(skia: SkiaContext): SkiaPaint {
    if (this.explicitPaint) return this.explicitPaint

    if (!this._paint) {
      this._paint = new SkiaPaint(skia)
      this._dirty = true
    }

    if (!this._dirty) return this._paint

    const p = this._paint

    if (this.fill) {
      const [r, g, b, a] = colorToRGBA(this.fill)
      p.setColor(r, g, b, a).setFill()
    }

    if (this.stroke) {
      const [r, g, b, a] = colorToRGBA(this.stroke)
      p.setColor(r, g, b, a).setStroke(this.strokeWidth ?? 1)
    }

    if (this.strokeCap) p.setStrokeCap(this.strokeCap)
    if (this.strokeJoin) p.setStrokeJoin(this.strokeJoin)
    if (this.opacity !== undefined) p.setAlpha(this.opacity)
    if (this.blur !== undefined && this.blur > 0) p.setBlur(this.blur)
    else p.clearBlur()
    if (this.dash) p.setDash(this.dash.intervals, this.dash.phase)
    else p.clearDash()
    if (this.blendMode) p.setBlendMode(this.blendMode)
    if (this.antiAlias !== undefined) p.setAntiAlias(this.antiAlias)

    this._dirty = false
    return p
  }

  dispose(): void {
    if (this._paint) {
      this._paint.dispose()
      this._paint = null
    }
  }
}
