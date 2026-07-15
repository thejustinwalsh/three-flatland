import { effect } from '@preact/signals-core'
import type { ReadonlySignal } from '@preact/signals-core'
import type { Matrix4 } from 'three'
import type { RegisteredSVG } from '@three-flatland/slug'
import type { ClippingRect } from '../../clipping.js'
import { abortableEffect, type ColorRepresentation } from '../../utils.js'
import { InstancedShape } from './instanced-shape.js'
import type { InstancedShapeGroup } from './instanced-shape-group.js'
import type { BaseOutProperties, Properties } from '../../properties/index.js'
import { parseNumberValue } from '../../properties/values.js'
import { toAbsoluteNumber } from '../../text/index.js'
import type { OrderInfo } from '../../order.js'
import type { RootContext } from '../../context.js'

export type InstancedShapesTarget<OutProperties extends BaseOutProperties = BaseOutProperties> = {
  root: ReadonlySignal<RootContext>
  svgSignal: ReadonlySignal<RegisteredSVG | undefined>
  orderInfo: ReadonlySignal<OrderInfo | undefined>
  properties: Properties<OutProperties>
  globalContentMatrix: ReadonlySignal<Matrix4 | undefined>
  isVisible: ReadonlySignal<boolean>
  abortSignal: AbortSignal
}

/**
 * Reactive glue: resolves the `(SlugShapeSet, orderInfo)` pair into a shape
 * group and hands it to an `InstancedShapes` worker — the Svg analogue of
 * `text/render/instanced-text.ts`'s `createInstancedText`.
 */
export function createInstancedShapes<OutProperties extends BaseOutProperties>(
  target: InstancedShapesTarget<OutProperties>,
  parentClippingRect: ReadonlySignal<ClippingRect | undefined> | undefined
): void {
  abortableEffect(() => {
    const svg = target.svgSignal.value
    const orderInfo = target.orderInfo.value
    if (svg == null || orderInfo == null || svg.handles.length === 0) {
      return
    }
    const depthTest = target.properties.value.depthTest
    const depthWrite = target.properties.value.depthWrite ?? false
    const renderOrder = parseNumberValue(target.properties.value.renderOrder ?? 0)
    const group = target.root.value.shapeGroupManager.getGroup(
      orderInfo,
      depthTest,
      depthWrite,
      renderOrder,
      svg.set
    )
    const instancedShapes = new InstancedShapes(
      group,
      svg,
      target.properties,
      target.globalContentMatrix,
      target.isVisible,
      parentClippingRect
    )
    return () => instancedShapes.destroy()
  }, target.abortSignal)
}

/**
 * Owns one `Svg` component's pool of `InstancedShape`s against a fixed
 * `InstancedShapeGroup` (fixed `SlugShapeSet` + `OrderInfo` + render config
 * — `createInstancedShapes` tears this down and builds a new one whenever
 * any of those change). Unlike `InstancedText`'s per-glyph layout entries,
 * an SVG's path count and placement are fixed once the source loads:
 * every registered path shares the SAME `globalContentMatrix` (there is no
 * per-shape pen position — `slug/svg` already bakes each path's absolute
 * placement into its own contour coordinates), so `sync()` reacts to
 * matrix/visibility/clip/color changes only, not a layout signal.
 */
export class InstancedShapes<OutProperties extends BaseOutProperties = BaseOutProperties> {
  private readonly instancedShapes: Array<InstancedShape> = []
  private readonly unsubscribe: () => void

  constructor(
    private readonly group: InstancedShapeGroup,
    private readonly svg: RegisteredSVG,
    private readonly properties: Properties<OutProperties>,
    private readonly matrixSignal: ReadonlySignal<Matrix4 | undefined>,
    private readonly isVisible: ReadonlySignal<boolean>,
    private readonly parentClippingRect: ReadonlySignal<ClippingRect | undefined> | undefined
  ) {
    this.unsubscribe = effect(() => this.sync())
  }

  private sync(): void {
    const matrix = this.matrixSignal.value
    const visible = this.isVisible.value
    const clippingRect = this.parentClippingRect?.value
    // `fill`/`color` tint EVERY registered path to one color, replacing
    // `slug/svg`'s per-path parsed fill — same contract upstream uikit's
    // `Svg` uses (see `packages/slug/src/svg/index.ts`'s module doc).
    const overrideColor = this.properties.value.fill ?? this.properties.value.color
    const opacity = toAbsoluteNumber(this.properties.value.opacity ?? 1, () => 1)

    let length = 0
    if (visible && matrix != null) {
      const { handles, fills } = this.svg
      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i]!
        const fill = fills[i]!
        const color: ColorRepresentation = overrideColor ?? [
          fill.color.r,
          fill.color.g,
          fill.color.b,
          fill.color.a,
        ]
        const instancedShape = this.getOrCreateShape(length, matrix, clippingRect)
        instancedShape.updateShape(handle, color, opacity)
        length += 1
      }
    }

    while (this.instancedShapes.length > length) {
      this.instancedShapes.pop()!.hide()
    }
  }

  private getOrCreateShape(
    index: number,
    matrix: Matrix4,
    clippingRect: ClippingRect | undefined
  ): InstancedShape {
    let shape = this.instancedShapes[index]
    if (shape == null) {
      shape = new InstancedShape(this.group, matrix, clippingRect)
      this.instancedShapes[index] = shape
      shape.show()
      return shape
    }
    shape.updateBaseMatrix(matrix)
    shape.updateClippingRect(clippingRect)
    return shape
  }

  destroy(): void {
    this.unsubscribe()
    while (this.instancedShapes.length > 0) {
      this.instancedShapes.pop()!.hide()
    }
  }
}
