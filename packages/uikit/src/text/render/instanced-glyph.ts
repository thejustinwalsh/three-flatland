import { Matrix4 } from 'three'
import type { InstancedGlyphGroup } from './instanced-glyph-group.js'
import type { ColorRepresentation } from '../../utils.js'
import type { ClippingRect } from '../../clipping.js'
import type { GlyphInfo } from '../font.js'
import { writeColor } from '../../panel/index.js'

const colorArrayHelper = new Float32Array(4)
const clipArrayHelper = new Float32Array(16)
const clipMatrixHelper = new Matrix4()

/**
 * `ClippingRect.toArray` writes 4 plane equations `(nx, ny, nz, d)`
 * contiguously (plane-major, i.e. row-major for a matrix whose ROWS are
 * plane equations) — exactly the layout `Matrix4.set(...)`'s row-major
 * argument order expects, and exactly what `SlugBatch`'s `clip` option
 * requires (§8.2). `Matrix4.fromArray` would be wrong here — it treats the
 * array as already-column-major `elements`.
 */
function clippingRectToMatrix(rect: ClippingRect, target: Matrix4): Matrix4 {
  rect.toArray(clipArrayHelper, 0)
  return target.set(
    clipArrayHelper[0]!,
    clipArrayHelper[1]!,
    clipArrayHelper[2]!,
    clipArrayHelper[3]!,
    clipArrayHelper[4]!,
    clipArrayHelper[5]!,
    clipArrayHelper[6]!,
    clipArrayHelper[7]!,
    clipArrayHelper[8]!,
    clipArrayHelper[9]!,
    clipArrayHelper[10]!,
    clipArrayHelper[11]!,
    clipArrayHelper[12]!,
    clipArrayHelper[13]!,
    clipArrayHelper[14]!,
    clipArrayHelper[15]!
  )
}

/**
 * Renders one glyph through `group.batch.writeGlyph` — the `SlugBatch`
 * writer-API replacement for MSDF's raw instanced-attribute pokes.
 */
export class InstancedGlyph {
  public index?: number

  private hidden = true

  private glyphInfo?: GlyphInfo
  //ink-box top-left (x-right, y-up), in the SAME units as `baseMatrix` expects —
  //i.e. NOT yet pixelSize-scaled. Matches `PositionedGlyphLayoutEntry`'s convention.
  private x: number = 0
  private y: number = 0
  private fontSize: number = 0
  private pixelSize: number = 0

  constructor(
    private readonly group: InstancedGlyphGroup,
    //modifiable using update...
    private baseMatrix: Matrix4 | undefined,
    private color: ColorRepresentation,
    private opacity: number,
    private clippingRect: ClippingRect | undefined
  ) {}

  getX(widthMultiplier: number): number {
    if (this.glyphInfo == null) {
      return this.x
    }
    return this.x + widthMultiplier * this.glyphInfo.width * this.fontSize
  }

  show(): void {
    if (!this.hidden) {
      return
    }
    this.hidden = false
    this.group.requestActivate(this)
  }

  hide(): void {
    if (this.hidden) {
      return
    }
    this.hidden = true
    this.group.delete(this)
  }

  activate(index: number): void {
    this.index = index
    this.write()
  }

  setIndex(index: number): void {
    this.index = index
  }

  updateClippingRect(clippingRect: ClippingRect | undefined): void {
    // Dirty-track: `sync()` re-runs every frame (its `globalTextMatrix` dependency is a
    // fresh matrix per frame) and re-pushes the SAME clip to every glyph. Skipping the
    // no-op keeps the interleaved buffer clean, so three doesn't re-upload it — the
    // difference between ~0 and ~200 MB/s of buffer traffic for a static UI.
    if (this.clippingRect === clippingRect) {
      return
    }
    this.clippingRect = clippingRect
    this.write()
  }

  updateColor(color: ColorRepresentation, opacity: number): void {
    if (this.color === color && this.opacity === opacity) {
      return
    }
    this.color = color
    this.opacity = opacity
    this.write()
  }

  updateGlyphAndTransformation(
    glyphInfo: GlyphInfo,
    x: number,
    y: number,
    fontSize: number,
    pixelSize: number
  ): void {
    if (
      this.glyphInfo === glyphInfo &&
      this.x === x &&
      this.y === y &&
      this.fontSize === fontSize &&
      this.pixelSize === pixelSize
    ) {
      return
    }
    this.glyphInfo = glyphInfo
    this.x = x
    this.y = y
    this.fontSize = fontSize
    this.pixelSize = pixelSize
    this.write()
  }

  updateBaseMatrix(baseMatrix: Matrix4): void {
    // Value equality, NOT reference: `globalTextMatrix` is rebuilt into a fresh Matrix4
    // every frame (matrixAutoUpdate), so `===` always missed and re-wrote every glyph.
    // Comparing the 16 elements makes a static text a no-op; a genuine move still writes.
    if (this.baseMatrix != null && this.baseMatrix.equals(baseMatrix)) {
      return
    }
    this.baseMatrix = baseMatrix
    this.write()
  }

  private write(): void {
    if (this.index == null || this.glyphInfo == null || this.baseMatrix == null) {
      return
    }
    const { batch, font, root } = this.group
    if (batch == null) {
      return
    }

    writeColor(colorArrayHelper, 0, this.color, this.opacity)

    const fontSize = this.fontSize * this.pixelSize
    // R4: uikit's ink-box (x,y) -> Slug's pen origin. `xoffset`/`yoffset` are the
    // SAME ratios `Font.getGlyphInfo` derived via slug's `getGlyphTopOffset` — this
    // is algebra over that already-derived value, not a second baseline formula
    // (see `packages/slug/CLAUDE.md` "Baseline conversion — one place, on purpose").
    // ink x = pen x + xoffset*fontSize  =>  pen x = ink x - xoffset*fontSize
    // ink y (top, y-up) = pen y (baseline, y-up) + yMax*fontSize, yMax = ascender - yoffset
    const penX = this.x * this.pixelSize - this.glyphInfo.xoffset * fontSize
    const yMax = font.ascender - this.glyphInfo.yoffset
    const penY = this.y * this.pixelSize - yMax * fontSize

    const clip =
      this.clippingRect == null ? null : clippingRectToMatrix(this.clippingRect, clipMatrixHelper)

    batch.writeGlyph(this.index, this.glyphInfo.id, font, {
      x: penX,
      y: penY,
      fontSize,
      matrix: this.baseMatrix,
      clip,
      color: {
        r: colorArrayHelper[0]!,
        g: colorArrayHelper[1]!,
        b: colorArrayHelper[2]!,
        a: colorArrayHelper[3]!,
      },
    })
    root.requestRender?.()
  }
}
