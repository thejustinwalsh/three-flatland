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

// React context + provider wrapper
export { SkiaReactContext } from './context'
export { SkiaCanvas, type SkiaCanvasRef } from './SkiaCanvas'

// React-specific hooks
export { useSkiaContext } from './hooks'

// R3F attach helpers
export { attachSkiaTexture } from './attach'

// Re-export Three.js scene graph (rename the class to avoid conflict with wrapper)
export type { SkiaContextReady, SkiaCanvasOptions, AnyRenderer } from '../three/SkiaCanvas'
export { SkiaNode } from '../three/SkiaNode'
export { SkiaGroup } from '../three/SkiaGroup'
export { SkiaRect } from '../three/SkiaRect'
export { SkiaCircle } from '../three/SkiaCircle'
export { SkiaOval } from '../three/SkiaOval'
export { SkiaLine } from '../three/SkiaLine'
export { SkiaPathNode } from '../three/SkiaPathNode'
export { SkiaTextNode } from '../three/SkiaTextNode'
export { SkiaImageNode } from '../three/SkiaImageNode'
export { SkiaTextPathNode } from '../three/SkiaTextPathNode'
export { SkiaFontLoader } from '../three/SkiaFontLoader'
export { SkiaTypeface } from '../font'
export { SkiaImageLoader } from '../three/SkiaImageLoader'
export type { SkiaImageLoaderOptions } from '../three/SkiaImageLoader'
export { getFBOId } from '../three/utils'
export type { SkiaPaintProps, SkiaColor } from '../three/SkiaPaintProps'
