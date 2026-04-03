import type { SkiaContext } from './context'
import type { SkiaPaint } from './paint'
import type { SkiaPath } from './path'
import type { SkiaFont } from './font'
import type { SkiaSVG } from './svg'
import type { SkiaImage } from './image'
import type { SkiaTextBlob } from './text-blob'
import type { SkiaPicture } from './picture'

/**
 * Drawing context — provides all canvas operations during a draw pass.
 *
 * Created by `SkiaContext.beginDrawing()`, invalidated by `endDrawing()`.
 * Do NOT hold references to this object across frames.
 */
export class SkiaDrawingContext {
  private _valid = true
  private readonly _ctx: SkiaContext

  /** @internal Created by SkiaContext.beginDrawing() */
  constructor(context: SkiaContext) {
    this._ctx = context
  }

  private _check(): void {
    if (!this._valid) throw new Error('SkiaDrawingContext is no longer valid — endDrawing() was called')
  }

  // ── Clear ──

  clear(r: number, g: number, b: number, a = 1): void {
    this._check()
    this._ctx._exports.skia_canvas_clear(r, g, b, a)
  }

  // ── Shape drawing ──

  drawRect(x: number, y: number, w: number, h: number, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_draw_rect(x, y, w, h, paint._handle)
  }

  drawRoundRect(x: number, y: number, w: number, h: number, rx: number, ry: number, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_draw_round_rect(x, y, w, h, rx, ry, paint._handle)
  }

  drawCircle(cx: number, cy: number, r: number, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_draw_circle(cx, cy, r, paint._handle)
  }

  drawOval(x: number, y: number, w: number, h: number, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_draw_oval(x, y, w, h, paint._handle)
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_draw_line(x0, y0, x1, y1, paint._handle)
  }

  drawPath(path: SkiaPath, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_draw_path(path._handle, paint._handle)
  }

  // ── Text ──

  drawText(text: string, x: number, y: number, font: SkiaFont, paint: SkiaPaint): void {
    this._check()
    const [ptr, len] = this._ctx._writeString(text)
    this._ctx._exports.skia_draw_text(ptr, len, x, y, font._handle, paint._handle)
  }

  // ── SVG ──

  drawSVG(svg: SkiaSVG): void {
    this._check()
    this._ctx._exports.skia_draw_svg(svg._handle)
  }

  // ── Transform stack ──

  save(): void {
    this._check()
    this._ctx._exports.skia_canvas_save()
  }

  restore(): void {
    this._check()
    this._ctx._exports.skia_canvas_restore()
  }

  translate(x: number, y: number): void {
    this._check()
    this._ctx._exports.skia_canvas_translate(x, y)
  }

  rotate(degrees: number): void {
    this._check()
    this._ctx._exports.skia_canvas_rotate(degrees)
  }

  scale(sx: number, sy?: number): void {
    this._check()
    this._ctx._exports.skia_canvas_scale(sx, sy ?? sx)
  }

  skew(sx: number, sy: number): void {
    this._check()
    this._ctx._exports.skia_canvas_skew(sx, sy)
  }

  /** Concatenate a 3x3 (9 floats) or 4x4 (16 floats) matrix */
  concat(matrix: Float32Array | number[]): void {
    this._check()
    const arr = matrix instanceof Float32Array ? matrix : new Float32Array(matrix)
    const ptr = this._ctx._writeF32(arr)
    this._ctx._exports.skia_canvas_concat_matrix(ptr, arr.length)
  }

  // ── Clipping ──

  clipRect(x: number, y: number, w: number, h: number): void {
    this._check()
    this._ctx._exports.skia_canvas_clip_rect(x, y, w, h)
  }

  clipRoundRect(x: number, y: number, w: number, h: number, rx: number, ry: number): void {
    this._check()
    this._ctx._exports.skia_canvas_clip_round_rect(x, y, w, h, rx, ry)
  }

  clipPath(path: SkiaPath): void {
    this._check()
    this._ctx._exports.skia_canvas_clip_path(path._handle)
  }

  // ── Layers ──

  /** Save canvas state into an offscreen layer. Use with a paint that has imageFilter/colorFilter for group effects. */
  saveLayer(bounds?: [number, number, number, number], paint?: SkiaPaint): void {
    this._check()
    const boundsPtr = bounds ? this._ctx._writeF32(bounds) : 0
    this._ctx._exports.skia_canvas_save_layer(boundsPtr, paint?._handle ?? 0)
  }

  /** Save canvas state into an offscreen layer with a given opacity */
  saveLayerAlpha(alpha: number, bounds?: [number, number, number, number]): void {
    this._check()
    const boundsPtr = bounds ? this._ctx._writeF32(bounds) : 0
    this._ctx._exports.skia_canvas_save_layer_alpha(boundsPtr, alpha)
  }

  // ── Images ──

  drawImage(image: SkiaImage, x: number, y: number, paint?: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_canvas_draw_image(image._handle, x, y, paint?._handle ?? 0)
  }

  drawImageRect(image: SkiaImage, src: [number, number, number, number], dst: [number, number, number, number], paint?: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_canvas_draw_image_rect(
      image._handle, src[0], src[1], src[2], src[3], dst[0], dst[1], dst[2], dst[3], paint?._handle ?? 0)
  }

  // ── Text Blob ──

  drawTextBlob(blob: SkiaTextBlob, x: number, y: number, paint: SkiaPaint): void {
    this._check()
    this._ctx._exports.skia_canvas_draw_text_blob(blob._handle, x, y, paint._handle)
  }

  // ── Picture ──

  drawPicture(picture: SkiaPicture): void {
    this._check()
    this._ctx._exports.skia_canvas_draw_picture(picture._handle)
  }

  // ── Backdrop Layer ──

  saveLayerWithBackdrop(bounds: [number, number, number, number] | undefined, paint: SkiaPaint | undefined,
                        backdropFilter: import('./image-filter').SkiaImageFilter): void {
    this._check()
    const boundsPtr = bounds ? this._ctx._writeF32(bounds) : 0
    this._ctx._exports.skia_canvas_save_layer_with_backdrop(
      boundsPtr, paint?._handle ?? 0, backdropFilter._handle)
  }

  /** @internal Called by SkiaContext.endDrawing() */
  _invalidate(): void {
    this._valid = false
  }
}
