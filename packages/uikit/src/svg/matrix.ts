import { computed } from '@preact/signals-core'
import type { ReadonlySignal } from '@preact/signals-core'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Vector2Tuple } from 'three'
import type { Inset } from '../flex/node.js'
import type { BoundingBox, ContentOutProperties } from '../components/content.js'
import type { Properties } from '../properties/index.js'
import { parseNumberValue } from '../properties/values.js'
import { alignmentZMap } from '../utils.js'

/** Structural slice of `Content` that `computedGlobalContentMatrix` reads. */
export type ContentMatrixTarget<OutProperties extends ContentOutProperties = ContentOutProperties> =
  {
    size: ReadonlySignal<Vector2Tuple | undefined>
    paddingInset: ReadonlySignal<Inset | undefined>
    borderInset: ReadonlySignal<Inset | undefined>
    boundingBox: ReadonlySignal<BoundingBox | undefined>
    properties: Properties<OutProperties>
    globalMatrix: ReadonlySignal<Matrix4 | undefined>
  }

const IdentityQuaternion = new Quaternion()
const scaleHelper = new Vector3()
const positionHelper = new Vector3()
const insetOffsetHelper = new Vector3()

/**
 * `Content`'s children-positioning transform (`boundingBox` → inner content
 * box, honoring padding/border/pixelSize/depthAlign/keepAspectRatio) as a
 * reactive `Matrix4` signal, premultiplied by `globalMatrix` — the Svg
 * analogue of `text/layout/matrix.ts`'s `computedGlobalTextMatrix`.
 *
 * Duplicates (rather than reuses) `Content`'s own private, non-reactive
 * `childrenMatrix` field: that field is a plain `Matrix4` mutated in place
 * by an internal effect, not a signal, so it can't be read reactively from
 * outside. The math is identical on purpose — see `content.ts`'s
 * `childrenMatrix` effect.
 */
export function computedGlobalContentMatrix<OutProperties extends ContentOutProperties>(
  target: ContentMatrixTarget<OutProperties>
): ReadonlySignal<Matrix4 | undefined> {
  return computed(() => {
    const size = target.size.value
    const paddingInset = target.paddingInset.value
    const borderInset = target.borderInset.value
    const boundingBox = target.boundingBox.value
    const globalMatrix = target.globalMatrix.value
    if (
      size == null ||
      paddingInset == null ||
      borderInset == null ||
      boundingBox == null ||
      globalMatrix == null
    ) {
      return undefined
    }

    const [width, height] = size
    const [pTop, pRight, pBottom, pLeft] = paddingInset
    const [bTop, bRight, bBottom, bLeft] = borderInset
    const topInset = pTop + bTop
    const rightInset = pRight + bRight
    const bottomInset = pBottom + bBottom
    const leftInset = pLeft + bLeft

    const innerWidth = width - leftInset - rightInset
    const innerHeight = height - topInset - bottomInset

    const pixelSize = parseNumberValue(target.properties.value.pixelSize)
    const keepAspectRatio = target.properties.value.keepAspectRatio
    const depthAlign = target.properties.value.depthAlign

    scaleHelper
      .set(
        innerWidth * pixelSize,
        innerHeight * pixelSize,
        keepAspectRatio
          ? (innerHeight * pixelSize * boundingBox.size.z) / boundingBox.size.y
          : boundingBox.size.z
      )
      .divide(boundingBox.size)

    positionHelper.copy(boundingBox.center).negate()
    positionHelper.z -= alignmentZMap[depthAlign] * boundingBox.size.z
    positionHelper.multiply(scaleHelper)
    positionHelper.add(
      insetOffsetHelper.set(
        (leftInset - rightInset) * 0.5 * pixelSize,
        (bottomInset - topInset) * 0.5 * pixelSize,
        0
      )
    )

    return new Matrix4()
      .compose(positionHelper, IdentityQuaternion, scaleHelper)
      .premultiply(globalMatrix)
  })
}
