import type { ThreeElement } from '@react-three/fiber'
import type { SlugText } from '../SlugText.js'
import type { SlugStackText } from '../SlugStackText.js'
import type { SlugMaterial } from '../SlugMaterial.js'
import type { SlugGeometry } from '../SlugGeometry.js'
import type { SlugFontStack } from '../SlugFontStack.js'

/**
 * R3F ThreeElements type augmentation for @three-flatland/slug.
 *
 * Enables typed JSX elements:
 * - <slugText font={font} text="Hello" fontSize={48} />
 * - <slugMaterial />
 * - <slugGeometry />
 *
 * Users must call extend() before using these elements:
 *
 * @example
 * ```tsx
 * import { extend } from '@react-three/fiber'
 * import { SlugText } from '@three-flatland/slug/react'
 *
 * extend({ SlugText })
 *
 * <slugText font={font} text="Hello" fontSize={48} color={0xffffff} />
 * ```
 */
declare module '@react-three/fiber' {
  interface ThreeElements {
    slugText: ThreeElement<typeof SlugText>
    slugStackText: ThreeElement<typeof SlugStackText>
    slugMaterial: ThreeElement<typeof SlugMaterial>
    slugGeometry: ThreeElement<typeof SlugGeometry>
    slugFontStack: ThreeElement<typeof SlugFontStack>
  }
}
