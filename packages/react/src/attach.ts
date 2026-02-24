// @three-flatland/react/attach
// Attach helper for R3F effect lifecycle

import type { Sprite2D, MaterialEffect } from '@three-flatland/core'

/**
 * R3F attach helper for MaterialEffect instances.
 * Use as the `attach` prop when adding effects as children of a sprite2D:
 * @example
 * ```tsx
 * import { attachEffect } from '@three-flatland/react'
 *
 * <sprite2D texture={tex}>
 *   <dissolveEffect attach={attachEffect} />
 * </sprite2D>
 * ```
 */
export function attachEffect<T extends MaterialEffect>(parent: Sprite2D, self: T): () => void {
  parent.addEffect(self)
  return () => parent.removeEffect(self)
}
