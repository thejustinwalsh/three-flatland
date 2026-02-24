// @three-flatland/react/attach
// Attach helper for R3F effect lifecycle

import type { Sprite2D, MaterialEffect } from '@three-flatland/core'

/**
 * R3F attach helper that prevents unnecessary effect churn.
 *
 * R3F calls attach for ALL children on every re-render, creating new
 * instances each time. This helper skips the add if the sprite already
 * has an effect of the same type, and defers removal to a microtask
 * so that a detach followed by an immediate re-attach is a no-op.
 *
 * @example
 * ```tsx
 * import { attachEffect } from '@three-flatland/react'
 *
 * <sprite2D texture={tex}>
 *   <dissolveEffect attach={attachEffect} />
 * </sprite2D>
 * ```
 */
export function attachEffect(parent: object, self: MaterialEffect): () => void {
  const sprite = parent as Sprite2D

  const alreadyAttached = sprite._effects.includes(self)
  if (!alreadyAttached) {
    sprite.addEffect(self)
  }

  return () => {
    queueMicrotask(() => {
      if (sprite._effects.includes(self)) {
        sprite.removeEffect(self)
      }
    })
  }
}
