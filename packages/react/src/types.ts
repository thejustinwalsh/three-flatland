import type { ReactNode } from 'react'
import type { ThreeElement } from '@react-three/fiber'
import type {
  Sprite2D,
  Sprite2DMaterial,
  Sprite2DOptions,
  AnimatedSprite2D,
  AnimatedSprite2DOptions,
  SpriteGroup,
  Flatland,
  TileMap2D,
  TileLayer,
  MaterialEffectClass,
  EffectSchema,
  EffectValues,
} from '@three-flatland/core'

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
export type EffectElement<T extends MaterialEffectClass<EffectSchema>> =
  ThreeElement<T> & (T extends MaterialEffectClass<infer S extends EffectSchema> ? Partial<EffectValues<S>> : Record<string, never>)

/**
 * Props for the Flatland root component
 */
export interface FlatlandProps {
  /** Child components */
  children?: ReactNode
  /** Enable debug mode */
  debug?: boolean
}

/**
 * Props for a Sprite2D component in R3F
 */
export interface Sprite2DProps extends Partial<Sprite2DOptions> {
  /** Child components */
  children?: ReactNode
  /** Event handler for click */
  onClick?: () => void
  /** Event handler for pointer over */
  onPointerOver?: () => void
  /** Event handler for pointer out */
  onPointerOut?: () => void
}

/**
 * Props for an AnimatedSprite2D component in R3F
 */
export interface AnimatedSprite2DProps extends Partial<AnimatedSprite2DOptions> {
  /** Child components */
  children?: ReactNode
  /** Event handler for click */
  onClick?: () => void
  /** Event handler for pointer over */
  onPointerOver?: () => void
  /** Event handler for pointer out */
  onPointerOut?: () => void
}

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
 * import { Sprite2D, Sprite2DMaterial, AnimatedSprite2D } from '@three-flatland/core'
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
  }
}
