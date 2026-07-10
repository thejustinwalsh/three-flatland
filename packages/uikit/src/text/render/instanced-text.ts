import type { ReadonlySignal } from '@preact/signals-core'
import type { Matrix4 } from 'three'
import type { ClippingRect } from '../../clipping.js'
import { abortableEffect, type alignmentXMap, type alignmentYMap } from '../../utils.js'
import type { InstancedGlyphGroup } from './instanced-glyph-group.js'
import type { PositionedGlyphLayout } from '../layout/index.js'
import type { BaseOutProperties, Properties } from '../../properties/index.js'
import type { Font } from '../font.js'
import type { OrderInfo } from '../../order.js'
import type { RootContext } from '../../context.js'

// STUB: ported in U1/U2. Upstream drives MSDF `InstancedGlyph` writes from the layout
// signal; the fork drives Slug's `SlugBatch.writeGlyph/writeRect` instead (spec §8.2).

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

// Preserves upstream's defer-until-attached control flow (font/orderInfo stay
// undefined until the Text component is enabled under a root) so unattached
// component construction — exercised by pure-logic specs like clone.spec.ts —
// does not throw; only an actual render attempt reaches the stub.
export function createInstancedText<OutProperties extends InstancedTextProperties>(
  text: InstancedTextTarget<OutProperties>,
  _parentClippingRect: ReadonlySignal<ClippingRect | undefined> | undefined,
  _layoutSignal: ReadonlySignal<PositionedGlyphLayout | undefined>
): void {
  abortableEffect(() => {
    const font = text.fontSignal.value
    const orderInfo = text.orderInfo.value
    if (font == null || orderInfo == null) {
      return
    }
    throw new Error('ported in U1/U2')
  }, text.abortSignal)
}

export class InstancedText {
  constructor(
    _group: InstancedGlyphGroup,
    _properties: Properties<InstancedTextProperties>,
    _layoutSignal: ReadonlySignal<PositionedGlyphLayout | undefined>,
    _matrix: ReadonlySignal<Matrix4 | undefined>,
    _isVisible: ReadonlySignal<boolean>,
    _parentClippingRect: ReadonlySignal<ClippingRect | undefined> | undefined
  ) {
    throw new Error('ported in U1/U2')
  }

  destroy(): void {
    throw new Error('ported in U1/U2')
  }
}
