import { Object3D } from 'three'
import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaPaint } from '../paint'
import { PaintCache, type SkiaColor } from './SkiaPaintProps'
import type { StrokeCap, StrokeJoin, BlendMode } from '../types'

/**
 * Abstract base class for all Skia drawing nodes.
 *
 * Extends Three.js Object3D so it participates in the scene graph.
 * The parent SkiaCanvas walks children and calls `_draw()` during render.
 */
export abstract class SkiaNode extends Object3D {
  /** @internal Paint property cache */
  protected _paintCache = new PaintCache()

  /** @internal Called by SkiaCanvas/SkiaGroup during the draw walk */
  abstract _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void

  /** Resolve the paint from inline props or explicit paint ref */
  protected _resolvePaint(skia: SkiaContext): SkiaPaint {
    return this._paintCache.resolve(skia)
  }

  // ── Paint props (R3F sets these via property assignment) ──

  get fill(): SkiaColor | undefined { return this._paintCache.fill }
  set fill(v: SkiaColor | undefined) { this._paintCache.fill = v; this._paintCache.markDirty() }

  get stroke(): SkiaColor | undefined { return this._paintCache.stroke }
  set stroke(v: SkiaColor | undefined) { this._paintCache.stroke = v; this._paintCache.markDirty() }

  get strokeWidth(): number | undefined { return this._paintCache.strokeWidth }
  set strokeWidth(v: number | undefined) { this._paintCache.strokeWidth = v; this._paintCache.markDirty() }

  get strokeCap(): StrokeCap | undefined { return this._paintCache.strokeCap }
  set strokeCap(v: StrokeCap | undefined) { this._paintCache.strokeCap = v; this._paintCache.markDirty() }

  get strokeJoin(): StrokeJoin | undefined { return this._paintCache.strokeJoin }
  set strokeJoin(v: StrokeJoin | undefined) { this._paintCache.strokeJoin = v; this._paintCache.markDirty() }

  get strokeMiter(): number | undefined { return this._paintCache.strokeMiter }
  set strokeMiter(v: number | undefined) { this._paintCache.strokeMiter = v; this._paintCache.markDirty() }

  get opacity(): number { return this._paintCache.opacity ?? 1 }
  set opacity(v: number) { this._paintCache.opacity = v; this._paintCache.markDirty() }

  get blur(): number | undefined { return this._paintCache.blur }
  set blur(v: number | undefined) { this._paintCache.blur = v; this._paintCache.markDirty() }

  get dash(): { intervals: number[]; phase?: number } | undefined { return this._paintCache.dash }
  set dash(v: { intervals: number[]; phase?: number } | undefined) { this._paintCache.dash = v; this._paintCache.markDirty() }

  get blendMode(): BlendMode | undefined { return this._paintCache.blendMode }
  set blendMode(v: BlendMode | undefined) { this._paintCache.blendMode = v; this._paintCache.markDirty() }

  get antiAlias(): boolean | undefined { return this._paintCache.antiAlias }
  set antiAlias(v: boolean | undefined) { this._paintCache.antiAlias = v; this._paintCache.markDirty() }

  get paint(): SkiaPaint | undefined { return this._paintCache.explicitPaint }
  set paint(v: SkiaPaint | undefined) { this._paintCache.explicitPaint = v }

  dispose(): void {
    this._paintCache.dispose()
  }
}
