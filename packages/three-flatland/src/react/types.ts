import type { ThreeElement } from '@react-three/fiber'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { AnimatedSprite2D } from '../sprites/AnimatedSprite2D'
import type { SpriteGroup } from '../pipeline/SpriteGroup'
import type { Flatland } from '../Flatland'
import type { TileMap2D } from '../tilemap/TileMap2D'
import type { TileLayer } from '../tilemap/TileLayer'
import type { Light2D } from '../lights/Light2D'
import type { MaterialEffectClass, EffectSchema, EffectValues } from '../materials/MaterialEffect'
import type { LightEffectClass } from '../lights/LightEffect'

/**
 * JSX element type for a MaterialEffect with schema-derived props.
 *
 * `ThreeElement<T>` can't always resolve dynamic properties defined via
 * `Object.defineProperty` in `createMaterialEffect`. This helper explicitly
 * surfaces the schema fields so they appear in VS Code autocomplete.
 *
 * @example
 * ```tsx
 * declare module '@react-three/fiber' {
 *   interface ThreeElements {
 *     dissolveEffect: EffectElement<typeof DissolveEffect>
 *   }
 * }
 *
 * // Now `progress` shows up as a valid prop:
 * <dissolveEffect attach={attachEffect} progress={0.5} />
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EffectElement<T extends MaterialEffectClass<any>> =
  ThreeElement<T> & (T extends MaterialEffectClass<infer S extends EffectSchema> ? Partial<EffectValues<S>> : Record<string, never>)

/**
 * JSX element type for a LightEffect with schema-derived props.
 * Surfaces uniform (settable) schema fields as JSX props.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LightEffectElement<T extends LightEffectClass<any>> =
  ThreeElement<T> & (T extends LightEffectClass<infer S extends EffectSchema> ? Partial<EffectValues<S>> : Record<string, never>)

/**
 * R3F ThreeElements type augmentation for three-flatland objects.
 *
 * This enables proper TypeScript support for JSX elements like:
 * - <sprite2D texture={...} />
 * - <sprite2DMaterial />
 * - <animatedSprite2D spriteSheet={...} />
 *
 * Users must call extend() from '@react-three/fiber' before using these elements:
 *
 * @example
 * ```tsx
 * import { extend } from '@react-three/fiber'
 * import { Sprite2D, Sprite2DMaterial, AnimatedSprite2D } from 'three-flatland'
 *
 * // Register only what you need (tree-shakeable)
 * extend({ Sprite2D })
 * // or extend({ Sprite2D, Sprite2DMaterial, AnimatedSprite2D })
 * ```
 */
declare module '@react-three/fiber' {
  interface ThreeElements {
    sprite2D: ThreeElement<typeof Sprite2D>
    sprite2DMaterial: ThreeElement<typeof Sprite2DMaterial>
    animatedSprite2D: ThreeElement<typeof AnimatedSprite2D>
    spriteGroup: ThreeElement<typeof SpriteGroup>
    flatland: ThreeElement<typeof Flatland>
    tileMap2D: ThreeElement<typeof TileMap2D>
    tileLayer: ThreeElement<typeof TileLayer>
    light2D: ThreeElement<typeof Light2D>
  }
}
