import { Matrix4 } from 'three'
import type { SlugShapeHandle } from '@three-flatland/slug'
import type { InstancedShapeGroup } from './instanced-shape-group.js'
import type { ColorRepresentation } from '../../utils.js'
import type { ClippingRect } from '../../clipping.js'
import { writeColor } from '../../panel/index.js'

const colorArrayHelper = new Float32Array(4)
const clipArrayHelper = new Float32Array(16)
const clipMatrixHelper = new Matrix4()

/**
 * `ClippingRect.toArray` writes 4 plane equations `(nx, ny, nz, d)`
 * contiguously (plane-major) — exactly the row-major layout `Matrix4.set`
 * expects and exactly what `SlugShapeBatch`'s `clip` option requires. Same
 * conversion as `text/render/instanced-glyph.ts`'s `clippingRectToMatrix`
 * (duplicated here rather than imported/exported to keep the shape-render
 * pipeline self-contained — see `packages/slug/CLAUDE.md`'s "one place, on
 * purpose" precedent for why a tiny duplicated conversion beats a new
 * shared-utils dependency between two independently-owned pipelines).
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
 * Renders one SVG path (a registered `SlugShapeHandle`) through
 * `group.batch.writeShape` — the shape-batch analogue of
 * `text/render/instanced-glyph.ts`'s `InstancedGlyph`. Unlike a glyph, a
 * shape instance carries no per-instance `x`/`y`/`fontSize` pen placement:
 * `slug/svg` already bakes every path's absolute position into its
 * contour coordinates (one shared viewBox-normalized frame per icon), so
 * `baseMatrix` alone (the Svg component's `globalContentMatrix`) fully
 * places it.
 */
export class InstancedShape {
  public index?: number

  private hidden = true

  private handle?: SlugShapeHandle
  private color: ColorRepresentation = 0xffffff
  private opacity: number = 1

  constructor(
    private readonly group: InstancedShapeGroup,
    private baseMatrix: Matrix4 | undefined,
    private clippingRect: ClippingRect | undefined
  ) {}

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

  updateClippingRect(clippingRect: ClippingRect | undefined): void {
    this.clippingRect = clippingRect
    this.write()
  }

  updateBaseMatrix(baseMatrix: Matrix4): void {
    if (this.baseMatrix === baseMatrix) {
      return
    }
    this.baseMatrix = baseMatrix
    this.write()
  }

  updateShape(handle: SlugShapeHandle, color: ColorRepresentation, opacity: number): void {
    if (this.handle === handle && this.color === color && this.opacity === opacity) {
      return
    }
    this.handle = handle
    this.color = color
    this.opacity = opacity
    this.write()
  }

  private write(): void {
    if (this.index == null || this.handle == null || this.baseMatrix == null) {
      return
    }
    const { batch, root } = this.group
    if (batch == null) {
      return
    }

    writeColor(colorArrayHelper, 0, this.color, this.opacity)

    const clip =
      this.clippingRect == null ? null : clippingRectToMatrix(this.clippingRect, clipMatrixHelper)

    batch.writeShape(this.index, this.handle, {
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
