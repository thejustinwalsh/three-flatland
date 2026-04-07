import type { SkiaContext } from './context'
import type { SkiaPath } from './path'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia path measure — query length, position, and tangent along a path.
 * Used for text-on-path and path animations.
 *
 * ```ts
 * const pm = new SkiaPathMeasure(skia, path)
 * const len = pm.length
 * const { x, y, tx, ty } = pm.getPosTan(len * 0.5) // midpoint
 * pm.dispose()
 * ```
 */
export class SkiaPathMeasure {
  _handle: number
  private readonly _ctx: SkiaContext

  constructor(context: SkiaContext, path: SkiaPath, forceClosed = false) {
    this._ctx = context
    this._handle = context._exports.skia_path_measure_create(path._handle, forceClosed ? 1 : 0)
    registry.register(this, { handle: this._handle, drop: (h: number) => context._exports.skia_path_measure_destroy(h) }, this)
  }

  /** Total arc length of the path */
  get length(): number {
    return this._ctx._exports.skia_path_measure_length(this._handle)
  }

  /** Get position and tangent at a given distance along the path */
  getPosTan(distance: number): { x: number; y: number; tx: number; ty: number } | null {
    const posPtr = this._ctx._writeF32([0, 0])
    const tanPtr = this._ctx._writeF32([0, 0])
    const ok = this._ctx._exports.skia_path_measure_get_pos_tan(this._handle, distance, posPtr, tanPtr)
    if (!ok) return null
    const view = new DataView(this._ctx._memory.buffer)
    return {
      x: view.getFloat32(posPtr, true), y: view.getFloat32(posPtr + 4, true),
      tx: view.getFloat32(tanPtr, true), ty: view.getFloat32(tanPtr + 4, true),
    }
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_path_measure_destroy(this._handle)
      this._handle = 0
    }
  }
}
