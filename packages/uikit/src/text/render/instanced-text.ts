import { effect } from '@preact/signals-core'
import type { ReadonlySignal } from '@preact/signals-core'
import type { Matrix4 } from 'three'
import type { ClippingRect } from '../../clipping.js'
import {
  abortableEffect,
  type ColorRepresentation,
  type alignmentXMap,
  type alignmentYMap,
} from '../../utils.js'
import { InstancedGlyph } from './instanced-glyph.js'
import type { InstancedGlyphGroup } from './instanced-glyph-group.js'
import type { PositionedGlyphLayout } from '../layout/index.js'
import type { Font } from '../font.js'
import type { BaseOutProperties, Properties } from '../../properties/index.js'
import { parseNumberValue } from '../../properties/values.js'
import { toAbsoluteNumber } from '../utils.js'
import type { OrderInfo } from '../../order.js'
import type { RootContext } from '../../context.js'

export type TextAlignProperties = {
  textAlign?: keyof typeof alignmentXMap | 'justify'
}

export const additionalTextDefaults = {
  verticalAlign: 'middle' as keyof typeof alignmentYMap,
}

export type AdditionalTextDefaults = typeof additionalTextDefaults

type InstancedTextProperties = AdditionalTextDefaults & BaseOutProperties

export type InstancedTextTarget<
  OutProperties extends InstancedTextProperties = InstancedTextProperties,
> = {
  root: ReadonlySignal<RootContext>
  fontSignal: ReadonlySignal<Font | undefined>
  orderInfo: ReadonlySignal<OrderInfo | undefined>
  properties: Properties<OutProperties>
  globalTextMatrix: ReadonlySignal<Matrix4 | undefined>
  isVisible: ReadonlySignal<boolean>
  abortSignal: AbortSignal
}

/**
 * Reactive glue: resolves the `(SlugFont, orderInfo)` pair into a glyph
 * group and hands it to an `InstancedText` worker. Preserves upstream's
 * defer-until-attached control flow (font/orderInfo stay undefined until
 * the Text component is enabled under a root) so unattached component
 * construction — exercised by pure-logic specs like clone.spec.ts — never
 * touches a group; only an actual render attempt does.
 */
export function createInstancedText<OutProperties extends InstancedTextProperties>(
  text: InstancedTextTarget<OutProperties>,
  parentClippingRect: ReadonlySignal<ClippingRect | undefined> | undefined,
  layoutSignal: ReadonlySignal<PositionedGlyphLayout | undefined>
): void {
  abortableEffect(() => {
    const font = text.fontSignal.value
    const orderInfo = text.orderInfo.value
    if (font == null || orderInfo == null) {
      return
    }
    const depthTest = text.properties.value.depthTest
    const depthWrite = text.properties.value.depthWrite ?? false
    const renderOrder = parseNumberValue(text.properties.value.renderOrder ?? 0)
    const group = text.root.value.glyphGroupManager.getGroup(
      orderInfo,
      depthTest,
      depthWrite,
      renderOrder,
      font.slug
    )
    const instancedText = new InstancedText(
      group,
      text.properties,
      layoutSignal,
      text.globalTextMatrix,
      text.isVisible,
      parentClippingRect
    )
    return () => instancedText.destroy()
  }, text.abortSignal)
}

/**
 * Owns one `Text` component's pool of `InstancedGlyph`s against a fixed
 * `InstancedGlyphGroup` (fixed `SlugFont` + `OrderInfo` + render config —
 * `createInstancedText` tears this down and builds a new one whenever any
 * of those change). Reactively walks the positioned layout's `'glyph'`
 * entries on every relevant signal change and keeps the glyph pool in sync
 * by index; `'whitespace'` entries render nothing (caret/selection are
 * drawn as instanced panels elsewhere — see `text/selection/*` — and never
 * touch this pool).
 */
export class InstancedText<
  OutProperties extends InstancedTextProperties = InstancedTextProperties,
> {
  private readonly instancedGlyphs: Array<InstancedGlyph> = []
  private readonly unsubscribe: () => void

  constructor(
    private readonly group: InstancedGlyphGroup,
    private readonly properties: Properties<OutProperties>,
    private readonly layoutSignal: ReadonlySignal<PositionedGlyphLayout | undefined>,
    private readonly matrixSignal: ReadonlySignal<Matrix4 | undefined>,
    private readonly isVisible: ReadonlySignal<boolean>,
    private readonly parentClippingRect: ReadonlySignal<ClippingRect | undefined> | undefined
  ) {
    this.unsubscribe = effect(() => this.sync())
  }

  private sync(): void {
    const layout = this.layoutSignal.value
    const matrix = this.matrixSignal.value
    const visible = this.isVisible.value
    const clippingRect = this.parentClippingRect?.value
    const color: ColorRepresentation = this.properties.value.color ?? 0x0
    const opacity = toAbsoluteNumber(this.properties.value.opacity ?? 1, () => 1)
    const pixelSize = parseNumberValue(this.properties.value.pixelSize)

    let length = 0
    if (visible && layout != null && matrix != null) {
      for (const line of layout.lines) {
        for (const entry of line.entries) {
          if (entry.type !== 'glyph') {
            continue
          }
          const instancedGlyph = this.getOrCreateGlyph(length, matrix, color, opacity, clippingRect)
          instancedGlyph.updateGlyphAndTransformation(
            entry.glyphInfo,
            entry.x,
            entry.y,
            layout.fontSize,
            pixelSize
          )
          length += 1
        }
      }
    }

    while (this.instancedGlyphs.length > length) {
      this.instancedGlyphs.pop()!.hide()
    }
  }

  private getOrCreateGlyph(
    index: number,
    matrix: Matrix4,
    color: ColorRepresentation,
    opacity: number,
    clippingRect: ClippingRect | undefined
  ): InstancedGlyph {
    let glyph = this.instancedGlyphs[index]
    if (glyph == null) {
      glyph = new InstancedGlyph(this.group, matrix, color, opacity, clippingRect)
      this.instancedGlyphs[index] = glyph
      glyph.show()
      return glyph
    }
    glyph.updateBaseMatrix(matrix)
    glyph.updateColor(color, opacity)
    glyph.updateClippingRect(clippingRect)
    return glyph
  }

  destroy(): void {
    this.unsubscribe()
    while (this.instancedGlyphs.length > 0) {
      this.instancedGlyphs.pop()!.hide()
    }
  }
}
