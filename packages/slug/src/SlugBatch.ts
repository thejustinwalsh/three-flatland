import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  Uint16BufferAttribute,
  Color,
  Vector2,
} from 'three'
import type { Camera, Matrix4 } from 'three'
import { SlugMaterial } from './SlugMaterial.js'
import type { SlugMaterialOptions } from './SlugMaterial.js'
import type { SlugFont } from './SlugFont.js'
import type { DecorationRect, SlugGlyphData, SlugGlyphSource } from './types.js'

/** Default initial capacity for batch instances. */
const DEFAULT_CAPACITY = 256

/** Floats per instance: 5 glyph vec4s + mat4 transform + mat4 clip. */
const STRIDE = 52

const OFFSET_POS = 0
const OFFSET_TEX = 4
const OFFSET_JAC = 8
const OFFSET_BAND = 12
const OFFSET_COLOR = 16
const OFFSET_MTX = 20
const OFFSET_CLIP = 36

/** RGBA color for a batch instance. */
export interface SlugBatchColor {
  r: number
  g: number
  b: number
  a: number
}

/** Per-instance write options shared by `writeGlyph` and `writeRect`. */
export interface SlugBatchInstanceOptions {
  /**
   * Per-instance transform, glyph space → batch-local space. uikit
   * components carry heterogeneous transforms (pixelSize, rotations,
   * non-uniform scale) — this matrix is folded into the dilation MVP
   * per instance, so the screen-space Jacobian stays exact.
   * Default identity.
   */
  matrix?: Matrix4
  /**
   * Per-instance clip: a Matrix4 whose ROWS are plane equations
   * `(nx, ny, nz, d)` in batch-local space; a point survives when
   * `dot(n, p) + d >= 0` for all four rows. `null`/omitted writes the
   * disabled sentinel `(0, 0, 0, 1)` — bit-exact no-op coverage.
   */
  clip?: Matrix4 | null
  /** Per-instance color. `Color` uses `opacity` for alpha. Default white. */
  color?: Color | SlugBatchColor
  /** Alpha when `color` is a `Color` (or omitted). Default 1. */
  opacity?: number
}

/** `writeGlyph`-only placement options. */
export interface SlugBatchGlyphOptions extends SlugBatchInstanceOptions {
  /** Pen (baseline origin) x in glyph space. Default 0. */
  x?: number
  /** Pen (baseline origin) y in glyph space. Default 0. */
  y?: number
  /** Font size in glyph-space units. May vary per glyph within one batch. Default 16. */
  fontSize?: number
}

const _drawingBufferSize = new Vector2()

const IDENTITY_LANES = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
/** Clip-disabled sentinel: 4 × (0, 0, 0, 1) — always-pass planes. */
const SENTINEL_CLIP = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]

/**
 * Interleaved instance geometry for `SlugBatch`.
 *
 * Exposes the same five instance attributes as `SlugGeometry`
 * (`glyphPos/glyphTex/glyphJac/glyphBand/glyphColor`) plus the batch-only
 * lanes `glyphMtx0..3` (per-instance transform columns) and
 * `glyphClip0..3` (per-instance clip planes) — all views over ONE
 * `InstancedInterleavedBuffer`, so the whole batch costs a single vertex
 * buffer binding (WebGPU's 8-buffer limit) and `copyWithin` compaction is
 * one array move.
 */
export class SlugBatchGeometry extends BufferGeometry {
  private _capacity: number
  private _array: Float32Array
  private _buffer: InstancedInterleavedBuffer

  constructor(capacity: number = DEFAULT_CAPACITY) {
    super()
    this._capacity = capacity

    // Base quad — identical to SlugGeometry
    const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0])
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3])
    this.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    this.setIndex(new Uint16BufferAttribute(indices, 1))

    this._array = new Float32Array(capacity * STRIDE)
    this._buffer = this._createBuffer()
    this._bindInstanceAttributes()
  }

  private _createBuffer(): InstancedInterleavedBuffer {
    const buffer = new InstancedInterleavedBuffer(this._array, STRIDE, 1)
    buffer.setUsage(DynamicDrawUsage)
    return buffer
  }

  private _bindInstanceAttributes(): void {
    const b = this._buffer
    this.setAttribute('glyphPos', new InterleavedBufferAttribute(b, 4, OFFSET_POS))
    this.setAttribute('glyphTex', new InterleavedBufferAttribute(b, 4, OFFSET_TEX))
    this.setAttribute('glyphJac', new InterleavedBufferAttribute(b, 4, OFFSET_JAC))
    this.setAttribute('glyphBand', new InterleavedBufferAttribute(b, 4, OFFSET_BAND))
    this.setAttribute('glyphColor', new InterleavedBufferAttribute(b, 4, OFFSET_COLOR))
    for (let l = 0; l < 4; l++) {
      this.setAttribute('glyphMtx' + l, new InterleavedBufferAttribute(b, 4, OFFSET_MTX + l * 4))
      this.setAttribute('glyphClip' + l, new InterleavedBufferAttribute(b, 4, OFFSET_CLIP + l * 4))
    }
  }

  get capacity(): number {
    return this._capacity
  }

  /** The raw interleaved instance array — test/introspection access. */
  get instanceArray(): Float32Array {
    return this._array
  }

  /** Grow to hold at least `n` instances (1.5×, contents preserved). */
  ensureCapacity(n: number): void {
    if (n <= this._capacity) return
    this._growInto(Math.max(n, Math.ceil(this._capacity * 1.5)))
  }

  /** Grow the array + buffer in place. Only safe BEFORE the geometry is bound to
   *  a render object (three's WebGPU backend caches vertex buffers per geometry
   *  and does not re-bind a replaced interleaved buffer). Post-bind growth must
   *  go through a fresh geometry — see `SlugBatch.ensureCapacity`. */
  private _growInto(newCapacity: number): void {
    const next = new Float32Array(newCapacity * STRIDE)
    next.set(this._array)
    this._array = next
    this._capacity = newCapacity
    this._buffer = this._createBuffer()
    this._bindInstanceAttributes()
  }

  /** A fresh geometry grown to hold at least `n` instances, with this geometry's
   *  instances copied in. Used to swap the mesh's geometry on grow so three's
   *  render object rebuilds its vertex buffers instead of keeping the stale
   *  (smaller) buffer bound. */
  cloneGrown(n: number): SlugBatchGeometry {
    const grown = new SlugBatchGeometry(Math.max(n, Math.ceil(this._capacity * 1.5)))
    grown._array.set(this._array)
    grown._buffer.needsUpdate = true
    return grown
  }

  /** Flag instances `[start, start+count)` for a PARTIAL GPU re-upload. three's
   *  WebGPU backend (`WebGPUAttributeUtils.updateAttribute`) uploads only the flagged
   *  updateRanges instead of the whole interleaved buffer — so a frame that touches a
   *  few animating glyphs re-sends a few KB, not the entire batch. This is the
   *  dirty-range/bucketing discipline the sprite batches use; without it, one changed
   *  glyph re-uploads every static glyph in its batch (~200 MB/s for this gallery). */
  markDirty(start: number, count = 1): void {
    this._buffer.addUpdateRange(start * STRIDE, count * STRIDE)
    this._buffer.needsUpdate = true
  }

  /** Move whole instances `[start, end)` to `target` (bucket compaction). */
  copyWithin(target: number, start: number, end: number): void {
    this._array.copyWithin(target * STRIDE, start * STRIDE, end * STRIDE)
    this.markDirty(target, end - start)
  }

  /** Write glyph pos/tex/jac/band fields — same math as `SlugGeometry`. */
  writeGlyphData(
    index: number,
    glyph: SlugGlyphData,
    fontSize: number,
    x: number,
    y: number
  ): void {
    const { bounds, bandLocation, bands } = glyph
    const a = this._array
    const o = index * STRIDE

    const width = (bounds.xMax - bounds.xMin) * fontSize
    const height = (bounds.yMax - bounds.yMin) * fontSize
    const cx = x + (bounds.xMin + bounds.xMax) * 0.5 * fontSize
    const cy = y + (bounds.yMin + bounds.yMax) * 0.5 * fontSize

    a[o + OFFSET_POS] = cx
    a[o + OFFSET_POS + 1] = cy
    a[o + OFFSET_POS + 2] = width * 0.5
    a[o + OFFSET_POS + 3] = height * 0.5

    a[o + OFFSET_TEX] = (bounds.xMin + bounds.xMax) * 0.5
    a[o + OFFSET_TEX + 1] = (bounds.yMin + bounds.yMax) * 0.5
    a[o + OFFSET_TEX + 2] = bandLocation.x
    a[o + OFFSET_TEX + 3] = bandLocation.y

    const numHBands = bands.hBands.length
    const numVBands = bands.vBands.length
    const invScale = 1 / fontSize
    a[o + OFFSET_JAC] = invScale
    a[o + OFFSET_JAC + 1] = invScale
    a[o + OFFSET_JAC + 2] = numHBands
    a[o + OFFSET_JAC + 3] = numVBands

    const emWidth = bounds.xMax - bounds.xMin
    const emHeight = bounds.yMax - bounds.yMin
    const bandScaleX = emWidth > 0 ? numVBands / emWidth : 0
    const bandScaleY = emHeight > 0 ? numHBands / emHeight : 0
    a[o + OFFSET_BAND] = bandScaleX
    a[o + OFFSET_BAND + 1] = bandScaleY
    a[o + OFFSET_BAND + 2] = -bounds.xMin * bandScaleX
    a[o + OFFSET_BAND + 3] = -bounds.yMin * bandScaleY
  }

  /** Write a solid rect via the `glyphJac.w = -1` sentinel. */
  writeRectData(index: number, rect: DecorationRect): void {
    const a = this._array
    const o = index * STRIDE

    a[o + OFFSET_POS] = rect.x
    a[o + OFFSET_POS + 1] = rect.y
    a[o + OFFSET_POS + 2] = rect.width * 0.5
    a[o + OFFSET_POS + 3] = rect.height * 0.5

    a.fill(0, o + OFFSET_TEX, o + OFFSET_TEX + 4)

    // invScale stays finite for the dilation math; jac.w < 0 is the sentinel.
    a[o + OFFSET_JAC] = 1
    a[o + OFFSET_JAC + 1] = 1
    a[o + OFFSET_JAC + 2] = 0
    a[o + OFFSET_JAC + 3] = -1

    a.fill(0, o + OFFSET_BAND, o + OFFSET_BAND + 4)
  }

  writeColor(index: number, r: number, g: number, b: number, alpha: number): void {
    const a = this._array
    const o = index * STRIDE + OFFSET_COLOR
    a[o] = r
    a[o + 1] = g
    a[o + 2] = b
    a[o + 3] = alpha
  }

  /** Write the per-instance transform lanes (columns). `null` = identity. */
  writeMatrix(index: number, matrix: Matrix4 | null): void {
    const o = index * STRIDE + OFFSET_MTX
    if (matrix === null) {
      this._array.set(IDENTITY_LANES, o)
    } else {
      // Matrix4.elements is column-major — lanes ARE the columns.
      this._array.set(matrix.elements, o)
    }
  }

  /** Write the per-instance clip planes from the matrix ROWS. `null` = sentinel. */
  writeClip(index: number, clip: Matrix4 | null): void {
    const a = this._array
    const o = index * STRIDE + OFFSET_CLIP
    if (clip === null) {
      a.set(SENTINEL_CLIP, o)
    } else {
      const e = clip.elements
      for (let row = 0; row < 4; row++) {
        a[o + row * 4] = e[row]!
        a[o + row * 4 + 1] = e[row + 4]!
        a[o + row * 4 + 2] = e[row + 8]!
        a[o + row * 4 + 3] = e[row + 12]!
      }
    }
  }
}

/** Options for `SlugBatch`. */
export interface SlugBatchOptions {
  /** Font whose curve/band textures the batch material binds. */
  font?: SlugFont
  /** Initial instance capacity. Default 256. */
  capacity?: number
  /**
   * Build the material with per-instance clipping. Default true — the
   * disabled sentinel makes unclipped instances free; set false only to
   * shave the clip varying off a batch that will never clip.
   */
  clip?: boolean
  /** Extra options forwarded to the batch `SlugMaterial`. */
  material?: Omit<SlugMaterialOptions, 'instanceTransform' | 'instanceClip' | 'pixelSnap'>
}

/**
 * Cross-component glyph batch: many text components, one draw call.
 *
 * Where `SlugText` renders one mesh per component (one shared transform,
 * trivially-correct Jacobian), `SlugBatch` batches glyphs from MANY
 * components keyed by font. Each instance carries its own transform
 * (`glyphMtx0..3`), folded into the dilation MVP in the vertex stage so
 * the half-pixel screen-space dilation — and, via `fwidth` of the
 * em-space varying, the fragment coverage footprint — is exact per
 * instance. Each instance also carries 4 clip planes (`glyphClip0..3`)
 * applied as an antialiased coverage multiply.
 *
 * Duck-typed instanced mesh (uikit `InstancedPanelMesh` shape, proven by
 * E1): `isInstancedMesh + count` over a plain geometry. `instanceMatrix`
 * stays `null` ON PURPOSE — the per-instance transform rides the
 * `glyphMtx` lanes, and a real `instanceMatrix` would make NodeMaterial
 * inject an InstanceNode whose output our `positionNode` overwrites,
 * wasting a vertex-buffer slot and an upload.
 *
 * Writer contract (allocator-compatible with uikit's sorted buckets):
 * `ensureCapacity`, `writeGlyph`, `writeRect`, `copyWithin`, `count`.
 * Writes mark the interleaved buffer dirty; `count` is the live instance
 * count and drives the draw.
 */
export class SlugBatch extends Mesh {
  /** Instanced-draw duck type — `RenderObject` reads `count` for instanceCount. */
  readonly isInstancedMesh = true
  /** See class docs: transforms ride `glyphMtx` lanes, not three's InstanceNode. */
  readonly instanceMatrix = null
  readonly instanceColor = null
  readonly morphTexture = null

  /** Live instance count (drives the instanced draw). */
  count = 0

  /** Bound curve/band source — a `SlugFont` (glyphs) or `SlugShapeSet` (shapes). */
  protected _source: SlugGlyphSource | null = null
  private _clip: boolean
  private _materialOptions: SlugBatchOptions['material']
  private _slugMaterial: SlugMaterial | null = null
  private _batchGeometry: SlugBatchGeometry

  private _viewportWidth = 1
  private _viewportHeight = 1

  constructor(options?: SlugBatchOptions) {
    const geometry = new SlugBatchGeometry(options?.capacity ?? DEFAULT_CAPACITY)
    super(geometry, undefined)

    this._batchGeometry = geometry
    this._clip = options?.clip ?? true
    this._materialOptions = options?.material
    this.frustumCulled = false

    if (options?.font) this.font = options.font
  }

  get font(): SlugFont | null {
    return this._source as SlugFont | null
  }

  set font(value: SlugFont | null) {
    if (this._source === value) return
    this._bindSource(value)
  }

  /**
   * Bind a curve/band source: dispose the old batch material and build a
   * fresh `SlugMaterial` over the source's textures. Shared by the `font`
   * setter and `SlugShapeBatch`'s `shapes` binding (which also re-binds on
   * shape-set repack).
   */
  protected _bindSource(value: SlugGlyphSource | null): void {
    this._source = value
    this._slugMaterial?.dispose()
    this._slugMaterial = null
    if (value) {
      this._slugMaterial = new SlugMaterial(value, {
        ...this._materialOptions,
        instanceTransform: true,
        instanceClip: this._clip,
        pixelSnap: false,
      })
      this._slugMaterial.setViewportSize(this._viewportWidth, this._viewportHeight)
      this.material = this._slugMaterial
    }
  }

  get batchGeometry(): SlugBatchGeometry {
    return this._batchGeometry
  }

  get capacity(): number {
    return this._batchGeometry.capacity
  }

  /** Grow to hold at least `n` instances (1.5×, contents preserved). */
  ensureCapacity(n: number): void {
    const geometry = this._batchGeometry
    if (n <= geometry.capacity) return
    // Swap in a fresh, larger geometry rather than growing in place: three's
    // WebGPU render object caches this mesh's vertex buffers per geometry and
    // will not rebind a replaced interleaved buffer, so an in-place grow leaves
    // the smaller buffer bound while `count` climbs into the grown region and the
    // draw fails every frame. A new geometry object forces a clean rebind. Dispose
    // the old one only AFTER it is unbound (`this.geometry = grown`), never while
    // it is still the bound geometry (that frees a buffer three uploads to
    // mid-frame → "used in submit while destroyed").
    const grown = geometry.cloneGrown(n)
    this._batchGeometry = grown
    this.geometry = grown
    geometry.dispose()
  }

  /**
   * Write one glyph instance at `index` (auto-grows). `font` supplies the
   * glyph tables and must share curve/band textures with the batch font.
   * A glyphId with no outline data writes a hidden degenerate instance so
   * allocator slots stay dense.
   */
  writeGlyph(
    index: number,
    glyphId: number,
    font: SlugGlyphSource,
    opts: SlugBatchGlyphOptions = {}
  ): void {
    this.ensureCapacity(index + 1)
    const glyph = font.glyphs.get(glyphId)
    if (glyph) {
      this._batchGeometry.writeGlyphData(
        index,
        glyph,
        opts.fontSize ?? 16,
        opts.x ?? 0,
        opts.y ?? 0
      )
      this._writeCommon(index, opts, 1)
    } else {
      // Hidden degenerate: zero-size rect sentinel, alpha 0.
      this._batchGeometry.writeRectData(index, { x: 0, y: 0, width: 0, height: 0 })
      this._writeCommon(index, opts, 0)
    }
    this._batchGeometry.markDirty(index)
  }

  /**
   * Write a solid rectangle instance at `index` (auto-grows) — the
   * `glyphJac.w < 0` sentinel path. Serves underline/strikethrough and
   * uikit's `renderSolid` replacement.
   */
  writeRect(index: number, rect: DecorationRect, opts: SlugBatchInstanceOptions = {}): void {
    this.ensureCapacity(index + 1)
    this._batchGeometry.writeRectData(index, rect)
    this._writeCommon(index, opts, 1)
    this._batchGeometry.markDirty(index)
  }

  protected _writeCommon(index: number, opts: SlugBatchInstanceOptions, alphaScale: number): void {
    const g = this._batchGeometry
    const color = opts.color
    if (color instanceof Color) {
      g.writeColor(index, color.r, color.g, color.b, (opts.opacity ?? 1) * alphaScale)
    } else if (color) {
      g.writeColor(index, color.r, color.g, color.b, color.a * alphaScale)
    } else {
      g.writeColor(index, 1, 1, 1, (opts.opacity ?? 1) * alphaScale)
    }
    g.writeMatrix(index, opts.matrix ?? null)
    g.writeClip(index, opts.clip ?? null)
  }

  /** Move whole instances `[start, end)` to `target` (bucket compaction). */
  copyWithin(target: number, start: number, end: number): void {
    this._batchGeometry.copyWithin(target, start, end)
  }

  /**
   * Update the MVP uniforms for vertex dilation. Call once per frame with
   * the active camera (matches `SlugText.update`).
   */
  update(camera: Camera): void {
    const material = this.material as { updateMVP?: (object: SlugBatch, camera: Camera) => void }
    material.updateMVP?.(this, camera)
  }

  /**
   * Feed the dilation viewport from the renderer's DRAWING BUFFER size —
   * device pixels — right before this batch draws. CSS-pixel viewports
   * (the historical `setViewportSize` contract) over-expand the AA
   * footprint by the device pixel ratio on retina displays. Bit-identical
   * at DPR 1, where device px == CSS px. Subclass overrides (uikit's
   * `InstancedGlyphMesh`/`InstancedShapeMesh`) keep this exact signature.
   */
  override onBeforeRender = (
    renderer: { getDrawingBufferSize(target: Vector2): Vector2 },
    _scene: unknown,
    _camera: Camera
  ): void => {
    renderer.getDrawingBufferSize(_drawingBufferSize)
    this.setViewportSize(_drawingBufferSize.width, _drawingBufferSize.height)
  }

  /**
   * Update viewport size for dilation calculations. Render-time viewport
   * comes from `onBeforeRender` (drawing-buffer device pixels); this
   * remains as the headless/pre-render seed.
   */
  setViewportSize(width: number, height: number): void {
    this._viewportWidth = width
    this._viewportHeight = height
    const material = this.material as { setViewportSize?: (w: number, h: number) => void }
    material.setViewportSize?.(width, height)
  }

  /** Dispose geometry and owned material. */
  dispose(): this {
    this._batchGeometry.dispose()
    this._slugMaterial?.dispose()
    return this
  }
}
