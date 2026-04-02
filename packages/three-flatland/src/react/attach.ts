// three-flatland/react/attach
// Attach helpers for R3F effect lifecycle

import type { Sprite2D } from '../sprites/Sprite2D'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Flatland } from '../Flatland'
import type { LightEffect } from '../lights/LightEffect'

/**
 * R3F attach helper for MaterialEffect instances.
 * Use as the `attach` prop when adding effects as children of a sprite2D:
 * @example
 * ```tsx
 * import { attachEffect } from 'three-flatland/react'
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

/**
 * R3F attach helper for LightEffect instances.
 * Use as the `attach` prop when adding a light effect as a child of a flatland:
 * @example
 * ```tsx
 * import { attachLighting } from 'three-flatland/react'
 *
 * <flatland ref={flatlandRef} viewSize={400}>
 *   <defaultLightEffect attach={attachLighting} />
 *   <light2D lightType="point" position={[50, 50, 0]} color="orange" />
 * </flatland>
 * ```
 */
export function attachLighting<T extends LightEffect>(parent: Flatland, self: T): () => void {
  parent.setLighting(self)
  return () => parent.setLighting(null)
}
