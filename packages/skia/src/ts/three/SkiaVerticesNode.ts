import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { BlendMode } from '../types'
import { SkiaNode } from './SkiaNode'

/**
 * Draw a triangle mesh with optional per-vertex colors and texture coordinates.
 */
export class SkiaVerticesNode extends SkiaNode {
  /** Flat array of [x, y, x, y, ...] vertex positions */
  positions: number[] = []
  /** Optional: flat array of packed 0xAARRGGBB per-vertex colors */
  colors: number[] | null = null
  /** Optional: flat array of [u, v, u, v, ...] texture coordinates */
  texCoords: number[] | null = null
  /** Optional: index buffer for indexed drawing */
  indices: number[] | null = null
  /** Triangle assembly mode */
  vertexMode: 'triangles' | 'triangle-strip' | 'triangle-fan' = 'triangles'
  /** Blend mode for vertex colors */
  vertexBlendMode: BlendMode = 'srcOver'

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    if (this.positions.length < 4) return // at least 2 vertices
    ctx.drawVertices(
      this.positions, this.colors, this.texCoords, this.indices,
      this.vertexBlendMode, this._resolvePaint(skia), this.vertexMode,
    )
  }
}
