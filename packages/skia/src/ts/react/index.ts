/**
 * @three-flatland/skia/react
 *
 * React Three Fiber integration — type augmentation, hooks, and full API.
 * R3F users should always import from this subpath to get JSX types.
 *
 * ```tsx
 * import { SkiaCanvas, SkiaRect, SkiaFontLoader, useSkiaContext } from '@three-flatland/skia/react'
 * ```
 *
 * @packageDocumentation
 */

// Side-effect: augment ThreeElements with Skia types
import './types'

// React-specific hooks
export { useSkiaContext, useSkiaDraw } from './hooks'

// Re-export Three.js scene graph so R3F users only need one import
export * from '../three/index'
