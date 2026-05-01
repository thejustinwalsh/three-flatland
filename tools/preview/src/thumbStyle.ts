/**
 * Pure CSS-math helper for rendering a single sprite-sheet frame
 * centered inside a fixed-size box, without bleed from neighboring
 * tiles in the source atlas.
 *
 * The technique: scale the WHOLE atlas image so the rect fits in the
 * box (preserving aspect), center-position so the rect lines up, then
 * `clip-path: inset(...)` to crop the box's drawing region to just the
 * letterbox area where the rect actually sits. Without the clip, the
 * letterbox margins on either side of a non-square frame fill with the
 * neighboring tiles' pixels.
 *
 * Apply the returned CSS values to an INNER element that fills the
 * outer fixed-size chrome (border, bg, hover state). The clip-path
 * crops only the inner image, leaving the chrome intact:
 *
 *   <span style={{ width: BOX, height: BOX, position: 'relative', overflow: 'hidden', border: ... }}>
 *     <span style={{ position: 'absolute', inset: 0, backgroundImage: bgImage,
 *                    backgroundSize: bgSize, backgroundPosition: bgPos,
 *                    clipPath: clip, backgroundRepeat: 'no-repeat',
 *                    imageRendering: 'pixelated' }} />
 *   </span>
 *
 * The source image loads once (browser-cached by URL); each thumb is
 * just a CSS scale + offset of the same image — no canvas, no data
 * URI, no per-frame DOM image.
 */
export type ThumbStyle = {
  bgImage: string
  bgSize: string
  bgPos: string
  clip: string
}

export function computeThumbStyle(
  imageUri: string,
  imageW: number,
  imageH: number,
  rect: { x: number; y: number; w: number; h: number },
  boxW: number,
  boxH: number,
): ThumbStyle {
  const scale = Math.min(boxW / rect.w, boxH / rect.h)
  const displayW = imageW * scale
  const displayH = imageH * scale
  const fitW = rect.w * scale
  const fitH = rect.h * scale
  const padX = (boxW - fitW) / 2
  const padY = (boxH - fitH) / 2
  const offsetX = -rect.x * scale + padX
  const offsetY = -rect.y * scale + padY
  return {
    bgImage: `url("${imageUri}")`,
    bgSize: `${displayW}px ${displayH}px`,
    bgPos: `${offsetX}px ${offsetY}px`,
    clip: `inset(${padY}px ${padX}px ${padY}px ${padX}px)`,
  }
}
