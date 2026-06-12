import type { Texture } from 'three'

/**
 * Minimal atlas-rect shape `sampleFrame` needs — a structural subset of
 * `SpriteFrame`, declared here so `events/` never imports `sprites/`
 * (avoids an `AlphaMap` ↔ `sprites/types` type cycle). A full
 * `SpriteFrame` is assignable to it.
 */
export interface AtlasRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * CPU-side alpha-channel store for pixel-perfect hit testing
 * (`hitTestMode: 'alpha'`). 1 byte per pixel.
 *
 * Spec §10: populated from a baked `.alpha.png` sidecar when present;
 * `fromTexture` is the runtime readback fallback.
 */
export class AlphaMap {
  constructor(
    /** Alpha values, row-major from the top (canvas pixel order). */
    readonly data: Uint8Array,
    readonly width: number,
    readonly height: number
  ) {}

  /** Sample at atlas UV (0–1, bottom-left origin). Returns 0–255. */
  sampleAtlasUV(u: number, v: number): number {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(u * this.width)))
    const yFromTop = Math.min(this.height - 1, Math.max(0, Math.floor((1 - v) * this.height)))
    return this.data[yFromTop * this.width + x] ?? 0
  }

  /** Sample at sprite-local UV (0–1 within the frame quad). Returns 0–255. */
  sampleFrame(localU: number, localV: number, frame: AtlasRect): number {
    return this.sampleAtlasUV(frame.x + localU * frame.width, frame.y + localV * frame.height)
  }

  /**
   * Runtime fallback: extract the alpha channel from a loaded texture
   * via canvas readback. Synchronous and main-thread — prefer the
   * baked sidecar (spec §10). Returns null when the image is missing
   * or the canvas is tainted.
   */
  static fromTexture(texture: Texture): AlphaMap | null {
    const image = texture.image as { width: number; height: number } | undefined
    if (!image || !image.width || !image.height) return null
    try {
      // Obtain the 2D context on a concrete canvas type — calling
      // getContext('2d') on an OffscreenCanvas|HTMLCanvasElement union
      // widens the result to RenderingContext, which drops drawImage.
      let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
      if (typeof OffscreenCanvas !== 'undefined') {
        ctx = new OffscreenCanvas(image.width, image.height).getContext('2d')
      } else {
        const c = document.createElement('canvas')
        c.width = image.width
        c.height = image.height
        ctx = c.getContext('2d')
      }
      if (!ctx) return null
      ctx.drawImage(image as CanvasImageSource, 0, 0)
      const rgba = ctx.getImageData(0, 0, image.width, image.height).data
      const alpha = new Uint8Array(image.width * image.height)
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0
      return new AlphaMap(alpha, image.width, image.height)
    } catch {
      return null
    }
  }
}
