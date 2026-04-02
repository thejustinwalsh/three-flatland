import type { SkiaContext } from './context'
import { type PathOp, PATH_OP } from './types'

const pathRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia path — vector path builder with SVG string conversion and boolean operations.
 *
 * ```ts
 * const path = new SkiaPath(skia)
 *   .moveTo(10, 10)
 *   .lineTo(100, 10)
 *   .lineTo(100, 100)
 *   .close()
 *
 * ctx.drawPath(path, paint)
 * path.dispose()
 * ```
 */
export class SkiaPath {
  /** @internal */
  _handle: number
  private readonly _ctx: SkiaContext

  constructor(context: SkiaContext) {
    this._ctx = context
    this._handle = context._exports.skia_path_new()
    pathRegistry.register(this, { handle: this._handle, drop: context._exports.skia_path_delete }, this)
  }

  /** @internal Create a path from an existing handle (e.g., from PathOps result) */
  private static _fromHandle(context: SkiaContext, handle: number): SkiaPath {
    const path = Object.create(SkiaPath.prototype) as SkiaPath
    ;(path as unknown as { _ctx: SkiaContext })._ctx = context
    path._handle = handle
    pathRegistry.register(path, { handle, drop: context._exports.skia_path_delete }, path)
    return path
  }

  /**
   * Parse an SVG path data string into a SkiaPath.
   * Returns null if the string is invalid.
   */
  static fromSVGString(context: SkiaContext, d: string): SkiaPath | null {
    const [ptr, len] = context._writeString(d)
    const handle = context._exports.skia_path_from_svg(ptr, len)
    if (!handle) return null
    return SkiaPath._fromHandle(context, handle)
  }

  // ── Path building (fluent) ──

  moveTo(x: number, y: number): this {
    this._ctx._exports.skia_path_move(this._handle, x, y)
    return this
  }

  lineTo(x: number, y: number): this {
    this._ctx._exports.skia_path_line(this._handle, x, y)
    return this
  }

  quadTo(cx: number, cy: number, x: number, y: number): this {
    this._ctx._exports.skia_path_quad(this._handle, cx, cy, x, y)
    return this
  }

  cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this._ctx._exports.skia_path_cubic(this._handle, c1x, c1y, c2x, c2y, x, y)
    return this
  }

  arcTo(rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number): this {
    this._ctx._exports.skia_path_arc(this._handle, rx, ry, rotation, largeArc ? 1 : 0, sweep ? 1 : 0, x, y)
    return this
  }

  close(): this {
    this._ctx._exports.skia_path_close(this._handle)
    return this
  }

  reset(): this {
    this._ctx._exports.skia_path_reset(this._handle)
    return this
  }

  // ── Conversion ──

  /** Serialize to SVG path data string */
  toSVGString(): string {
    // First call with null buf to get required size
    const needed = this._ctx._exports.skia_path_to_svg(this._handle, 0, 0)
    if (needed <= 0) return ''

    const bufSize = needed + 1 // +1 for null terminator
    const [ptr] = this._ctx._writeString('\0'.repeat(bufSize))
    this._ctx._exports.skia_path_to_svg(this._handle, ptr, bufSize)

    return new TextDecoder().decode(
      new Uint8Array(this._ctx._memory.buffer, ptr, needed),
    )
  }

  // ── Boolean operations ──

  /**
   * Combine this path with another using a boolean operation.
   * Returns a new SkiaPath, or null on failure.
   */
  op(other: SkiaPath, operation: PathOp): SkiaPath | null {
    const handle = this._ctx._exports.skia_path_op_combine(this._handle, other._handle, PATH_OP[operation])
    if (!handle) return null
    return SkiaPath._fromHandle(this._ctx, handle)
  }

  /**
   * Simplify this path by removing overlapping contours.
   * Returns a new SkiaPath, or null on failure.
   */
  simplify(): SkiaPath | null {
    const handle = this._ctx._exports.skia_path_simplify(this._handle)
    if (!handle) return null
    return SkiaPath._fromHandle(this._ctx, handle)
  }

  dispose(): void {
    if (this._handle !== 0) {
      pathRegistry.unregister(this)
      this._ctx._exports.skia_path_delete(this._handle)
      this._handle = 0
    }
  }
}
