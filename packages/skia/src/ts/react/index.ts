/**
 * @three-flatland/skia/react
 *
 * React Three Fiber integration — type augmentation and hooks.
 * Import this to get `<skiaCanvas>`, `<skiaRect>`, etc. in R3F JSX.
 *
 * For loading resources, use `useLoader` with Skia loaders from `/three`:
 * ```tsx
 * import { useLoader } from '@react-three/fiber'
 * import { SkiaFontLoader } from '@three-flatland/skia/three'
 * const font = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
 * ```
 *
 * @packageDocumentation
 */

// Side-effect: augment ThreeElements with Skia types
import './types'

export { useSkiaContext, useSkiaDraw } from './hooks'
