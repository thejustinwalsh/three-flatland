/**
 * @three-flatland/skia
 *
 * Pure Skia WASM wrapper — GPU-accelerated 2D vector graphics, text, and SVG.
 * Works with any WebGL2RenderingContext. No Three.js dependency.
 *
 * @example
 * ```ts
 * import { Skia, SkiaPaint } from '@three-flatland/skia'
 *
 * // Initialize with a GL context or Three.js renderer
 * const skia = await Skia.init(renderer)
 *
 * skia.drawToFBO(0, canvas.width, canvas.height, (ctx) => {
 *   ctx.clear(0.1, 0.1, 0.2, 1)
 *   const paint = new SkiaPaint(skia).setColor(1, 0, 0, 1).setFill()
 *   ctx.drawRect(10, 10, 200, 100, paint)
 *   paint.dispose()
 * })
 *
 * skia.destroy()
 * ```
 *
 * @packageDocumentation
 */

export { Skia } from './init'
export { SkiaContext } from './context'
export type { SkiaContextOptions } from './context'
export { SkiaPaint } from './paint'
export { SkiaPath } from './path'
export { SkiaFont } from './font'
export { SkiaSVG } from './svg'
export { SkiaDrawingContext } from './drawing-context'
export { SkiaImageFilter } from './image-filter'
export { SkiaColorFilter } from './color-filter'
export { SkiaImage } from './image'
export { preloadSkia } from './preload'
export type { StrokeCap, StrokeJoin, BlendMode, PathOp } from './types'
