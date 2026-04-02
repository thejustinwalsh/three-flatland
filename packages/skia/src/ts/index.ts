/**
 * @three-flatland/skia
 *
 * Pure Skia WASM wrapper — GPU-accelerated 2D vector graphics, text, and SVG.
 * Works with any WebGL2RenderingContext. No Three.js dependency.
 *
 * @example
 * ```ts
 * import { SkiaContext, SkiaPaint } from '@three-flatland/skia'
 *
 * const gl = canvas.getContext('webgl2')
 * const skia = await SkiaContext.create(gl)
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

export { SkiaContext } from './context'
export type { SkiaContextOptions } from './context'
export { SkiaPaint } from './paint'
export { SkiaPath } from './path'
export { SkiaFont } from './font'
export { SkiaSVG } from './svg'
export { SkiaDrawingContext } from './drawing-context'
export { preloadSkia } from './preload'
export type { StrokeCap, StrokeJoin, BlendMode, PathOp } from './types'
