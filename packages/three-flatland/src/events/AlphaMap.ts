import type { Texture } from 'three'

/**
 * Minimal atlas-rect shape `sampleFrame` needs — a structural subset of
 * `SpriteFrame`, declared here so `events/` never imports `sprites/`
 * (avoids an `AlphaMap` ↔ `sprites/types` type cycle). A full
 * `SpriteFrame` is assignable to it.
 *
 * The optional fields (`rotated`, `trimmed`, `trimOffset`, `sourceWidth`,
 * `sourceHeight`) are carried for type-compatibility with `SpriteFrame` and
 * for documentation purposes. `sampleFrame` intentionally does **not** apply
 * rotation or trim-offset corrections, because the renderer
 * (`Sprite2DMaterial._buildBaseColor`) performs the identical plain linear
 * remap — `atlasUV = localUV * (frame.width, frame.height) + (frame.x, frame.y)`
 * — without any rotation or trim handling either. Alpha and rendered pixels
 * must agree; correcting one without the other would reintroduce the
 * disagreement the alpha mask exists to prevent. Full rotated/trimmed atlas
 * support (renderer + sampling) is owned by the atlas overhaul in PR #117
 * (feat-vscode-tools); when it lands, both the shader remap and this method
 * gain the matching rotation/trim transform together.
 */
export interface AtlasRect {
  x: number
  y: number
  width: number
  height: number
  /** Original logical sprite width in pixels. */
  sourceWidth?: number
  /** Original logical sprite height in pixels. */
  sourceHeight?: number
  /**
   * Whether the frame was packed with a 90° rotation in the atlas.
   * The renderer does not apply a reverse-rotation UV transform, so
   * `sampleFrame` does not either — both sample the atlas linearly.
   */
  rotated?: boolean
  /**
   * Whether transparent border pixels were stripped when the frame was
   * packed. The renderer does not offset into the trimmed sub-rect, so
   * `sampleFrame` does not either — both sample the atlas linearly.
   */
  trimmed?: boolean
  /**
   * Pixel-space offset of the trimmed content within the logical source
   * rect (`{ x, y, width, height }` in source pixels). Present when
   * `trimmed` is `true`. Not used by `sampleFrame`; see `trimmed` note.
   */
  trimOffset?: { x: number; y: number; width: number; height: number }
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

  /**
   * Sample at sprite-local UV (0–1 within the frame quad). Returns 0–255.
   *
   * Maps `localUV` through the frame rect with the same linear transform
   * the renderer uses:
   *
   * ```
   * atlasU = frame.x + localU * frame.width
   * atlasV = frame.y + localV * frame.height
   * ```
   *
   * This is intentionally identical to `Sprite2DMaterial._buildBaseColor`'s
   * TSL expression `flippedUV.mul(instanceUV.zw).add(instanceUV.xy)`.
   * Neither the shader nor this method applies rotation or trim-offset
   * corrections — see the `AtlasRect` interface for the full rationale.
   */
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
