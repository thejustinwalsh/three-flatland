import type { SkiaContext } from './context'

const picRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia picture — immutable recording of drawing commands.
 * Replay with `ctx.drawPicture(picture)`.
 */
export class SkiaPicture {
  _handle: number
  private readonly _ctx: SkiaContext

  /** @internal */
  constructor(context: SkiaContext, handle: number) {
    this._ctx = context
    this._handle = handle
    picRegistry.register(this, { handle, drop: (h: number) => context._exports.skia_picture_destroy(h) }, this)
  }

  dispose(): void {
    if (this._handle !== 0) {
      picRegistry.unregister(this)
      this._ctx._exports.skia_picture_destroy(this._handle)
      this._handle = 0
    }
  }
}

const recRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia picture recorder — record drawing commands into an immutable Picture.
 *
 * ```ts
 * const recorder = new SkiaPictureRecorder(skia)
 * const recCanvas = recorder.beginRecording(0, 0, 512, 512)
 * // ... draw to recCanvas ...
 * const picture = recorder.finishRecording()
 *
 * // Replay many times — single WASM call
 * ctx.drawPicture(picture)
 * ```
 */
export class SkiaPictureRecorder {
  _handle: number
  private readonly _ctx: SkiaContext

  constructor(context: SkiaContext) {
    this._ctx = context
    this._handle = context._exports.skia_picture_recorder_create()
    recRegistry.register(this, { handle: this._handle, drop: (h: number) => context._exports.skia_picture_recorder_destroy(h) }, this)
  }

  /** Begin recording. Returns a canvas handle for the recording context. */
  beginRecording(x: number, y: number, width: number, height: number): number {
    return this._ctx._exports.skia_picture_recorder_begin(this._handle, x, y, width, height)
  }

  /** Finish recording and return the immutable Picture */
  finishRecording(): SkiaPicture | null {
    const h = this._ctx._exports.skia_picture_recorder_finish(this._handle)
    return h ? new SkiaPicture(this._ctx, h) : null
  }

  dispose(): void {
    if (this._handle !== 0) {
      recRegistry.unregister(this)
      this._ctx._exports.skia_picture_recorder_destroy(this._handle)
      this._handle = 0
    }
  }
}
