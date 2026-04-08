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
    pathRegistry.register(this, { handle: this._handle, drop: (h: number) => context._exports.skia_path_delete(h) }, this)
  }

  /** @internal Create a path from an existing handle (e.g., from PathOps result) */
  private static _fromHandle(context: SkiaContext, handle: number): SkiaPath {
    const path = Object.create(SkiaPath.prototype) as SkiaPath
    ;(path as unknown as { _ctx: SkiaContext })._ctx = context
    path._handle = handle
    pathRegistry.register(path, { handle, drop: (h: number) => context._exports.skia_path_delete(h) }, path)
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

  conicTo(cx: number, cy: number, x: number, y: number, weight: number): this {
    this._ctx._exports.skia_path_conic(this._handle, cx, cy, x, y, weight)
    return this
  }

  rMoveTo(dx: number, dy: number): this {
    this._ctx._exports.skia_path_r_move(this._handle, dx, dy)
    return this
  }

  rLineTo(dx: number, dy: number): this {
    this._ctx._exports.skia_path_r_line(this._handle, dx, dy)
    return this
  }

  rQuadTo(dcx: number, dcy: number, dx: number, dy: number): this {
    this._ctx._exports.skia_path_r_quad(this._handle, dcx, dcy, dx, dy)
    return this
  }

  rCubicTo(dc1x: number, dc1y: number, dc2x: number, dc2y: number, dx: number, dy: number): this {
    this._ctx._exports.skia_path_r_cubic(this._handle, dc1x, dc1y, dc2x, dc2y, dx, dy)
    return this
  }

  rConicTo(dcx: number, dcy: number, dx: number, dy: number, weight: number): this {
    this._ctx._exports.skia_path_r_conic(this._handle, dcx, dcy, dx, dy, weight)
    return this
  }

  // ── Fill type ──

  setFillType(type: 'winding' | 'evenOdd'): this {
    this._ctx._exports.skia_path_set_fill_type(this._handle, type === 'evenOdd' ? 1 : 0)
    return this
  }

  getFillType(): 'winding' | 'evenOdd' {
    return this._ctx._exports.skia_path_get_fill_type(this._handle) === 1 ? 'evenOdd' : 'winding'
  }

  close(): this {
    this._ctx._exports.skia_path_close(this._handle)
    return this
  }

  reset(): this {
    this._ctx._exports.skia_path_reset(this._handle)
    return this
  }

  // ── Shape additions ──

  addRect(x: number, y: number, w: number, h: number): this {
    this._ctx._exports.skia_path_add_rect(this._handle, x, y, w, h)
    return this
  }

  addCircle(cx: number, cy: number, r: number): this {
    this._ctx._exports.skia_path_add_circle(this._handle, cx, cy, r)
    return this
  }

  addOval(x: number, y: number, w: number, h: number): this {
    this._ctx._exports.skia_path_add_oval(this._handle, x, y, w, h)
    return this
  }

  addRoundRect(x: number, y: number, w: number, h: number, rx: number, ry: number): this {
    this._ctx._exports.skia_path_add_rrect(this._handle, x, y, w, h, rx, ry)
    return this
  }

  addArc(x: number, y: number, w: number, h: number, startAngle: number, sweepAngle: number): this {
    this._ctx._exports.skia_path_add_arc(this._handle, x, y, w, h, startAngle, sweepAngle)
    return this
  }

  addPath(other: SkiaPath): this {
    this._ctx._exports.skia_path_add_path(this._handle, other._handle)
    return this
  }

  // ── Queries ──

  getBounds(): { x: number; y: number; width: number; height: number } {
    const ptr = this._ctx._writeF32([0, 0, 0, 0])
    this._ctx._exports.skia_path_get_bounds(this._handle, ptr)
    const dv = new DataView(this._ctx._memory.buffer)
    return { x: dv.getFloat32(ptr, true), y: dv.getFloat32(ptr + 4, true), width: dv.getFloat32(ptr + 8, true), height: dv.getFloat32(ptr + 12, true) }
  }

  computeTightBounds(): { x: number; y: number; width: number; height: number } {
    const ptr = this._ctx._writeF32([0, 0, 0, 0])
    this._ctx._exports.skia_path_compute_tight_bounds(this._handle, ptr)
    const dv = new DataView(this._ctx._memory.buffer)
    return { x: dv.getFloat32(ptr, true), y: dv.getFloat32(ptr + 4, true), width: dv.getFloat32(ptr + 8, true), height: dv.getFloat32(ptr + 12, true) }
  }

  contains(x: number, y: number): boolean {
    return this._ctx._exports.skia_path_contains(this._handle, x, y) !== 0
  }

  isEmpty(): boolean {
    return this._ctx._exports.skia_path_is_empty(this._handle) !== 0
  }

  countPoints(): number {
    return this._ctx._exports.skia_path_count_points(this._handle)
  }

  getPoint(index: number): { x: number; y: number } {
    const ptr = this._ctx._writeF32([0, 0])
    this._ctx._exports.skia_path_get_point(this._handle, index, ptr)
    const dv = new DataView(this._ctx._memory.buffer)
    return { x: dv.getFloat32(ptr, true), y: dv.getFloat32(ptr + 4, true) }
  }

  // ── Transform & copy ──

  /** Apply a 3x3 matrix transform. Returns a NEW transformed path. */
  transform(matrix: Float32Array | number[]): SkiaPath | null {
    const arr = matrix instanceof Float32Array ? matrix : new Float32Array(matrix)
    const ptr = this._ctx._writeF32(arr)
    const handle = this._ctx._exports.skia_path_transform(this._handle, ptr)
    if (!handle) return null
    return SkiaPath._fromHandle(this._ctx, handle)
  }

  /** Create a deep copy of this path */
  copy(): SkiaPath | null {
    const handle = this._ctx._exports.skia_path_copy(this._handle)
    if (!handle) return null
    return SkiaPath._fromHandle(this._ctx, handle)
  }

  /** Offset all points in this path by (dx, dy). Modifies in place. */
  offset(dx: number, dy: number): this {
    this._ctx._exports.skia_path_offset(this._handle, dx, dy)
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

  // ── In-place operations (reuse existing handle, no allocation) ──

  /**
   * Boolean op that writes the result into `target`, reusing its handle.
   * Returns true on success. The target path is reset before writing.
   */
  opInto(other: SkiaPath, operation: PathOp, target: SkiaPath): boolean {
    return this._ctx._exports.skia_path_op_into(
      this._handle, other._handle, PATH_OP[operation], target._handle,
    ) !== 0
  }

  /**
   * Simplify and write the result into `target`, reusing its handle.
   * Returns true on success.
   */
  simplifyInto(target: SkiaPath): boolean {
    return this._ctx._exports.skia_path_simplify_into(this._handle, target._handle) !== 0
  }

  /**
   * Transform and write the result into `target`, reusing its handle.
   * Returns true on success.
   */
  transformInto(matrix: Float32Array | number[], target: SkiaPath): boolean {
    const arr = matrix instanceof Float32Array ? matrix : new Float32Array(matrix)
    const ptr = this._ctx._writeF32(arr)
    return this._ctx._exports.skia_path_transform_into(this._handle, ptr, target._handle) !== 0
  }

  dispose(): void {
    if (this._handle !== 0) {
      pathRegistry.unregister(this)
      this._ctx._exports.skia_path_delete(this._handle)
      this._handle = 0
    }
  }
}
