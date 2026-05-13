import { TILESET_H, TILESET_W } from '../textures'
import type { Rect } from '../atlas-regions'

export interface UvRect {
  u0: number
  v0: number
  u1: number
  v1: number
}

/**
 * Convert a source-pixel rect into UV bounds (0..1).
 *
 * Three's textures are V-up by convention (V=0 at the bottom of the image)
 * but the source PNG is Y-down (Y=0 at the top), so the V coordinates flip.
 */
export function rectToUv(r: Rect): UvRect {
  return {
    u0: r.x / TILESET_W,
    v0: 1 - (r.y + r.h) / TILESET_H,
    u1: (r.x + r.w) / TILESET_W,
    v1: 1 - r.y / TILESET_H,
  }
}

/**
 * For a sprite-strip rect, return the UV bounds of frame index `i` (0-based)
 * given a `frameW` step size in source pixels.
 */
export function frameUv(stripRect: Rect, frameIndex: number, frameW: number): UvRect {
  return rectToUv({
    x: stripRect.x + frameIndex * frameW,
    y: stripRect.y,
    w: frameW,
    h: stripRect.h,
  })
}
