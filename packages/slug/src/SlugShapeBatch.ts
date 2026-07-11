import type { Camera } from 'three'
import { SlugBatch } from './SlugBatch.js'
import type { SlugBatchInstanceOptions, SlugBatchOptions } from './SlugBatch.js'
import type { SlugFont } from './SlugFont.js'
import type { SlugShapeHandle, SlugShapeSet } from './SlugShapeSet.js'

/** Options for `SlugShapeBatch`. */
export interface SlugShapeBatchOptions extends Omit<SlugBatchOptions, 'font'> {
  /** Shape set whose curve/band textures the batch material binds. */
  shapes?: SlugShapeSet
}

/** `writeShape` placement options. */
export interface SlugShapeBatchWriteOptions extends SlugBatchInstanceOptions {
  /** Shape-space origin x (the analogue of `writeGlyph`'s pen x). Default 0. */
  x?: number
  /** Shape-space origin y. Default 0. */
  y?: number
  /**
   * Uniform scale from shape space to batch-local space — the shape
   * analogue of `fontSize`. A `slug/svg` shape occupies a unit box, so
   * `scale: 64` renders it 64 units tall/wide. May vary per instance.
   * Default 1.
   */
  scale?: number
}

/**
 * `SlugBatch` over a `SlugShapeSet`: one draw call for any number of shape
 * instances, with the identical per-instance layout (transform lanes, clip
 * planes, color) and the identical dilation/Jacobian machinery — nothing is
 * forked, `SlugShapeBatch` only re-points the writer at shape handles.
 *
 * Fill rule is batch-level: pass `material: { evenOdd: true }` for even-odd
 * filling; the default is nonzero winding (matches post-`oslllo-svg-fixer`
 * lucide output). Per-shape fill-rule is a documented v2 item.
 *
 * The batch re-binds its material automatically (in `update`) when the
 * bound set repacks its textures after growth — previously written
 * instances stay valid because a repack never moves existing shapes.
 */
export class SlugShapeBatch extends SlugBatch {
  private _shapes: SlugShapeSet | null = null
  private _boundVersion = -1

  constructor(options?: SlugShapeBatchOptions) {
    super(options)
    if (options?.shapes) this.shapes = options.shapes
  }

  /** `SlugShapeBatch` binds a `SlugShapeSet`, not a font — use `shapes`. */
  override get font(): SlugFont | null {
    return null
  }

  override set font(_value: SlugFont | null) {
    throw new Error('SlugShapeBatch: bind a SlugShapeSet via `shapes`, not `font`')
  }

  get shapes(): SlugShapeSet | null {
    return this._shapes
  }

  set shapes(value: SlugShapeSet | null) {
    if (this._shapes === value) return
    this._shapes = value
    this._boundVersion = -1
    this._bindShapes()
  }

  /** Bind when the set has textures to bind (registration may come later). */
  private _bindShapes(): void {
    const set = this._shapes
    if (!set || set.shapeCount === 0) {
      this._bindSource(null)
      return
    }
    this._bindSource(set)
    this._boundVersion = set.version
  }

  /**
   * Write one shape instance at `index` (auto-grows). `handle` is the
   * record returned by `SlugShapeSet.registerShape` (or its id).
   */
  writeShape(
    index: number,
    handle: SlugShapeHandle | number,
    opts: SlugShapeBatchWriteOptions = {}
  ): void {
    const shape = typeof handle === 'number' ? this._shapes?.getShape(handle) : handle
    this.ensureCapacity(index + 1)
    if (shape) {
      this.batchGeometry.writeGlyphData(index, shape, opts.scale ?? 1, opts.x ?? 0, opts.y ?? 0)
      this._writeCommon(index, opts, 1)
    } else {
      // Unknown handle id: hidden degenerate keeps allocator slots dense.
      this.batchGeometry.writeRectData(index, { x: 0, y: 0, width: 0, height: 0 })
      this._writeCommon(index, opts, 0)
    }
    this.batchGeometry.markDirty(index)
  }

  /**
   * Per-frame MVP push (see `SlugBatch.update`) plus a staleness check:
   * when the bound set has repacked (grown) since the material was built,
   * re-bind so the material samples the new texture objects.
   */
  override update(camera: Camera): void {
    const set = this._shapes
    if (set && set.shapeCount > 0 && set.version !== this._boundVersion) {
      this._bindShapes()
    }
    super.update(camera)
  }
}
